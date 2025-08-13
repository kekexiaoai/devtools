# `io.Copy` 阻塞调用与 Goroutine 优雅退出分析

## 1. 问题提出

在修复了 `listener.Accept()` 的阻塞问题后，我们注意到在 `forwardLocalConnection` 和 `handleSocks5Connection` 中，`io.Copy` 也是一个阻塞调用。

```go
// in proxyData function
go copier(conn1, conn2) // io.Copy(dst, src)
go copier(conn2, conn1) // io.Copy(dst, src)
```

这引出了一个重要问题：当隧道关闭时，这些正在执行 `io.Copy` 的 goroutine 是否会像之前 `runTunnel` 一样被永久阻塞，从而导致 goroutine 泄漏？它们是否也需要类似的 `context` 机制来确保及时退出？

## 2. 分析与结论

**简短结论：不需要。**

当前的实现是安全且无泄漏的。这些 `io.Copy` goroutine 会通过一个隐式的 **“级联关闭” (Cascading Close)** 机制被优雅地终止。

### 详细分析

`io.Copy` 会持续阻塞，直到其数据源 (Reader) 返回 `io.EOF` 或其他错误。这里的关键在于，我们能否确保在隧道关闭时，`io.Copy` 的数据源一定会被关闭。

让我们回顾一下完整的隧道关闭流程：

1. **触发关闭**: 远端连接断开，`sshClient.Wait()` 返回错误。
2. **取消 Context**: `cancelFunc()` 被调用，`runTunnel` 的 `context` 被标记为 "done"。
3. **主循环退出**: `runTunnel` 中的 `listener.Close()` 解除了 `Accept()` 的阻塞，主循环检查到 `context` 已取消，随即退出。
4. **执行清理**: `runTunnel` 的 `defer m.cleanupTunnel(tunnel.ID)` 被执行。
5. **关闭上游资源**: 在 `cleanupTunnel` 函数中，我们调用了 `tunnel.sshClient.Close()`。

**第 5 步 `tunnel.sshClient.Close()` 是终结 `io.Copy` 的关键。**

当 `ssh.Client` 的 `Close()` 方法被调用时，它会关闭底层的 TCP 连接。这个关闭动作会**级联**到所有通过这个 `ssh.Client` 实例创建的资源上。

在我们的代码中，`remoteConn` 是通过 `tunnel.sshClient.Dial(...)` 创建的。因此，当 `tunnel.sshClient.Close()` 执行时：

- `remoteConn` 这个网络连接会被强制关闭。
- 正在从 `remoteConn` 读取数据（`io.Copy(localConn, remoteConn)`）的 goroutine 会因为连接被关闭而立即收到一个错误（通常是 `io.EOF` 或 "use of closed network connection"）。
- 正在向 `remoteConn` 写入数据（`io.Copy(remoteConn, localConn)`）的 goroutine 也会因为写入失败而收到一个错误。

一旦两个方向的 `io.Copy` 都因错误而返回，它们所在的 goroutine 就会自然退出。`proxyData` 函数中的 `wg.Wait()` 也会解除阻塞，整个 `forwardLocalConnection` 的 goroutine 也随之干净地终结。

因此，我们通过关闭 `io.Copy` 所依赖的上游资源 (`ssh.Client`) 来确保其能够被可靠地中断。这是一种在 Go 中非常常见且有效的资源管理模式，无需为每个数据转发 goroutine 增加额外的 `context` 控制。
