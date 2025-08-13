# SSH 隧道断开后无法自动清理的 Bug 分析与修复

## 1. 问题现象

在真实的测试中，当一个 SSH 隧道成功建立后，如果在远端服务器上手动断开该 SSH 连接（例如，通过 `kill` 掉 `sshd` 进程），本地的隧道进程并没有如预期般退出。它会一直“傻傻地”运行，导致资源无法被清理，并且在应用界面上，该隧道显示为依然“活跃”，但实际上已经失效。

## 2. 根本原因分析

问题的核心在于 `runTunnel` goroutine 的主循环中存在一个经典的并发阻塞问题。

我们的设计意图是：

1. 一个独立的 "健康检查" goroutine 通过 `tunnel.sshClient.Wait()` 监控底层 SSH 连接。
2. 当连接断开时，`Wait()` 返回，该 goroutine 调用 `tunnel.cancelFunc()`。
3. `cancelFunc()` 会将 `context` 标记为 "done"。
4. `runTunnel` goroutine 在其 `for` 循环中通过 `select` 语句检测到 `ctx.Done()`，从而优雅退出。
5. `runTunnel` 退出后，其 `defer` 语句中的 `cleanupTunnel()` 会被执行，完成所有资源的清理。

然而，实际情况是第 4 步失败了。`runTunnel` 的代码如下：

```go
// 错误的实现
for {
    select {
    case <-ctx.Done():
        return
    default:
        // 问题点：此调用会永久阻塞，直到有新连接进来
        localConn, err := tunnel.listener.Accept()
        // ...
    }
}
```

`listener.Accept()` 是一个**阻塞式调用**。如果没有新的本地连接请求，代码会永远停在这里，等待。

当健康检查 goroutine 调用 `cancelFunc()` 时，`runTunnel` goroutine 正好被 `Accept()` 阻塞。它没有机会进入下一次 `for` 循环去执行 `select` 语句，因此永远无法感知到 `context` 已经被取消。

这就导致了：

- `runTunnel` goroutine 泄漏，永远无法退出。
- `defer m.cleanupTunnel(tunnel.ID)` 永远不会被执行。
- `listener` 和 `sshClient` 等资源无法被关闭。
- 前端 `runtime.EventsEmit(m.appCtx, "tunnels:changed")` 事件不会被触发，UI 状态错误。

### 流程图分析

#### 问题逻辑

```text
   Health-Check Goroutine         runTunnel Goroutine
           |                              |
   sshClient.Wait() <-------------------- |
           |                              |
           |                      for {
           |                        select {
           |                        case <-ctx.Done(): ...
           |                        default:
           |                          listener.Accept() --+
           |                        }                     |
           |                      }                       | (在此处永久阻塞)
           |                                              |
(SSH 连接断开)                                            |
           |                                              |
   Wait() 返回错误                                        |
           |                                              |
   调用 cancelFunc()                                      |
           |                                              |
   (context 变为 "done")                                  |
           |                                              |
           +--------------------------------------------->X (无法感知到 context 的变化)
                                                          |
                                                  (Goroutine 卡死)
                                                          |
                                                  (defer cleanupTunnel() 不会执行)
```

## 3. 解决方案

解决这个问题的标准 Go 并发模式是：**通过关闭阻塞源来解除阻塞**。

我们需要引入一个专门的 "unblocker" goroutine。这个 goroutine 的唯一职责就是监听 `context` 的取消信号。一旦信号传来，它就主动关闭那个导致阻塞的资源——在这里是 `tunnel.listener`。

当 `listener.Close()` 被调用后，正在阻塞的 `listener.Accept()` 会立即返回一个错误（通常是 `use of closed network connection`）。这样，`runTunnel` 的主循环就从阻塞中被唤醒，得以继续执行。在错误处理逻辑中，我们检查 `ctx.Done()`，发现 `context` 确实已被取消，于是函数就可以安全地 `return` 了。

### 修复后的正确逻辑

```text
   Health-Check Goroutine         runTunnel Goroutine          unblocker Goroutine
           |                              |                              |
   sshClient.Wait() <-------------------- | ---------------------------> | <-ctx.Done()
           |                              |                              |
           |                      for {                                  |
           |                        listener.Accept() --+                |
           |                      }                     | (在此处阻塞)   |
           |                                            |                |
(SSH 连接断开)                                          |                |
           |                                            |                |
   Wait() 返回错误                                      |                |
           |                                            |                |
   调用 cancelFunc()                                    |                |
           |                                            |                |
   (context 变为 "done") -------------------------------+----------------+
           |                                                             |
           |                                                     (被唤醒)
           |                                                             |
           |                                                     listener.Close()
           |                                                             |
           |                                            <----------------+
           |                                            |
           |                      Accept() 返回错误 <--------------------+
           |                              |
           |                      if err != nil {
           |                        select {
           |                        case <-ctx.Done(): // 检查到 context 变化
           |                          return // 👈 优雅退出
           |                        }
           |                      }
           |                              |
           |                      (Goroutine 正常退出)
           |                              |
           +--------------------> (defer cleanupTunnel() 被成功执行)
```

## 4. 代码变更

为了实现上述逻辑并增加调试日志，我们对 `backend/internal/sshtunnel/tunnel_manager.go` 进行了修改，详细 diff 请参考本次提交。

```golang
 
 func (m *Manager) runTunnel(tunnel *Tunnel, ctx context.Context) {
        defer m.cleanupTunnel(tunnel.ID) // 确保隧道退出时被清理
+       log.Printf("Tunnel %s: runTunnel loop started.", tunnel.ID)
+
+       // 启动一个 goroutine，它的唯一作用是在 context 被取消时关闭 listener。
+       // 这样可以解除下面 listener.Accept() 的阻塞。
+       go func() {
+               <-ctx.Done()
+               log.Printf("Tunnel %s: Context cancelled, closing listener to unblock Accept().", tunnel.ID)
+               tunnel.listener.Close()
+       }()
 
        for {
-               select {
-               case <-ctx.Done(): // 如果隧道被取消，则退出
-                       return
-               default:
-                       // 等待并接受来自本地的连接
-                       localConn, err := tunnel.listener.Accept()
-                       if err != nil {
-                               // 如果监听器被关闭，这是一个正常的退出信号
-                               if opErr, ok := err.(*net.OpError); ok && opErr.Err.Error() == "use of closed network connection" {
-                                       return
-                               }
-                               log.Printf("Tunnel %s failed to accept connection: %v", tunnel.ID, err)
+               // 等待并接受来自本地的连接
+               localConn, err := tunnel.listener.Accept()
+               if err != nil {
+                       // 当 listener 被关闭时，Accept() 会返回一个错误。
+                       // 我们检查 context 是否已 "done" 来判断这是不是一次正常的关闭。
+                       select {
+                       case <-ctx.Done():
+                               // context 被取消，是预期的关闭流程。
+                               log.Printf("Tunnel %s: Listener closed as part of graceful shutdown.", tunnel.ID)
                                return
-                       }
-
-                       // 根据隧道类型，分派到不同的处理器
-                       switch tunnel.Type {
-                       case "local":
-                               go m.forwardLocalConnection(localConn, tunnel)
-                       case "dynamic":
-                               go m.handleSocks5Connection(localConn, tunnel)
                        default:
-                               log.Printf("Unknown tunnel type '%s' for tunnel ID %s. Closing connection.", tunnel.Type, tunnel.ID)
-                               localConn.Close()
+                               // context 没有被取消，这是一个意外的错误。
+                               log.Printf("Tunnel %s: Error accepting connection: %v. Shutting down.", tunnel.ID, err)
+                               return
                        }
                }
+
+               log.Printf("Tunnel %s: Accepted new local connection from %s", tunnel.ID, localConn.RemoteAddr())
+               // 根据隧道类型，分派到不同的处理器
+               switch tunnel.Type {
+               case "local":
+                       go m.forwardLocalConnection(localConn, tunnel)
+               case "dynamic":
+                       go m.handleSocks5Connection(localConn, tunnel)
+               default:
+                       log.Printf("Unknown tunnel type '%s' for tunnel ID %s. Closing connection.", tunnel.Type, tunnel.ID)
+                       localConn.Close()
+               }
        }
 }
 

```
