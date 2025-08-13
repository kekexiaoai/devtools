# React 重构笔记：用 `useRef` 优雅地解决 `useEffect` 的“陈旧闭包”难题

> **前言：** 在 React 的修行之路上，我们常常会遇到一个看似无解的困境：一个 `useEffect` 既需要保持稳定（不因无关的 props 变化而重跑），又需要访问到这些 props 的最新值。这便是“陈旧闭包”的幽灵。本文将通过一个真实 Bug 的修复过程，揭示如何使用 `useRef` 这一“法宝”，优雅地驯服这个幽灵。

---

## 👻 **Bug 现形：重命名为何导致连接断开？**

在我们的终端（`TerminalView`）功能中，我们发现了一个诡异的 Bug：

> 当用户重命名一个终端标签页时（例如，从 "local" 改为 "my-server"），这个终端的 SSH (WebSocket) 连接会意外断开并重连。

这显然不是我们想要的行为。用户的重命名操作，应该只改变一个标签的显示文本，而不应影响其底层的网络连接。

### **探寻根源：依赖项的“蝴蝶效应”**

经过调试，我们定位到了问题的根源，它源于 `IntegratedTerminal.tsx` 组件中一系列环环相扣的依赖关系：

1. **Prop 变化**: 重命名操作更新了 `App.tsx` 中的 `terminalSessions` 状态，导致 `IntegratedTerminal` 组件接收到了一个新的 `displayName` prop。
2. **Logger 实例重建**: 我们的 `logger` 实例是通过 `useMemo` 创建的，并且为了在日志中打印出可读的名称，它依赖于 `displayName`。

   ```tsx
   // 问题代码
   const logger = useMemo(
     () => advancedLogger.withPrefix(`[${id}]<${displayName}>`),
     [id, displayName] // <- 致命依赖！
   )
   ```

3. **Effect 重启**: 这个新创建的 `logger` 实例，恰好是管理 WebSocket 连接的核心 `useEffect` 的依赖项之一。

   ```tsx
   // 问题代码
   useEffect(() => {
     // ... WebSocket 连接逻辑 ...
     return () => {
       ws.close(); // <- 清理函数被意外触发
     };
   }, [websocketUrl, logger, ...]); // <- logger 是依赖项
   ```

4. **连接断开**: 根据 React 的铁律，当 `useEffect` 的任何一个依赖项发生变化时，它都必须重新执行。在重新执行前，React 会先调用上一次 Effect 的**清理函数**。于是，`ws.close()` 被调用，SSH 连接被无情地切断。

---

## ⚔️ **核心矛盾：稳定身份 vs. 动态数据**

这个 Bug 暴露了 React 开发中的一个核心矛盾：

- **React 的规则**: `useEffect` 的依赖数组必须诚实地包含其内部用到的所有“反应式”变量（props, state, 以及由它们衍生的变量）。这是为了避免“陈旧闭包”——即 Effect 内部的函数使用了过时的、来自上一次渲染的值。
- **我们的需求**: 我们希望管理 WebSocket 的 `useEffect` 拥有一个**稳定的“身份”**（不因 `displayName` 变化而重跑），但它内部的日志记录功能，又需要访问到**动态的、最新的 `displayName` 数据**。

---

## ✨ **终极解法：`useRef` 的“时空穿梭”之力**

要打破这个僵局，我们需要一个既能存储最新数据，又不会触发 React 重新渲染的“法宝”。这正是 `useRef` 的核心价值所在。

### **`useRef` 教学：一个不会触发重渲染的“盒子”**

`useRef` 返回一个可变的 ref 对象，其 `.current` 属性被初始化为传入的参数。这个 ref 对象在组件的整个生命周期内保持不变。

最关键的特性是：

> **当您修改 ref 对象的 `.current` 属性时，React _不会_ 触发组件的重新渲染。**

这使得 `useRef` 成为了一个完美的“信使”，可以悄无声息地将最新的 props “递送”到那些因性能优化而刻意保持稳定的 `useCallback` 或 `useEffect` 闭包内部。

### **三步舞，优雅解决**

我们通过以下三步，重构了 `logger` 的创建逻辑：

#### **第一步：为动态数据创建一个 Ref “信箱”**

我们创建一个 `useRef` 来专门存放易变的 `displayName`。

```tsx
const displayNameRef = useRef(displayName)
```

#### **第二步：用一个专职 Effect 保持“信箱”更新**

我们用一个专门的、轻量级的 `useEffect`，它的唯一职责就是在 `displayName` 变化时，去更新这个 Ref 的值。

```tsx
useEffect(() => {
  displayNameRef.current = displayName
}, [displayName])
```

#### **第三步：一个有缺陷的尝试**

我们最初的思路是改造 `logger` 的创建逻辑，让 `useMemo` 只依赖于不变的 `id`，从而得到一个引用稳定的 `logger` 对象。

```tsx
// 最终的完美方案
const logger = useMemo(() => {
  // 定义一个函数，它在被调用时才去读取 ref
  const getPrefix = () => `[${id}]<${displayNameRef.current}>`

  // 返回一个稳定的对象，但其方法的行为是动态的
  return advancedLogger.withPrefix(getPrefix()) // 致命错误在这里！
}, [id]) // 依赖项中不再有 displayName！
```

这个方案的缺陷在于：

`getPrefix()` 函数在 `useMemo` 的回调函数内部被立即调用了。这意味着 `advancedLogger.withPrefix()` 接收到的是一个固定的字符串，例如 "`[session-1]<my-server>`"。

当 `displayName` 改变时，`displayNameRef.current` 的值会更新，但因为 `id` 没有改变，`useMemo` 不会重新执行，所以 `logger` 实例依然持有那个陈旧的、过时的前缀字符串。

因此，这个方案并没有真正实现动态前缀。

#### **第四步：真正的完美方案 —— 传递函数，而非值**

要真正解决问题，我们需要让 `logger` 在每次打印日志时才去获取最新的前缀。这要求我们的 `logger` 工具（appLogger）支持接收一个函数作为前缀。

幸运的是，我们的 `logger` 库被设计为支持链式调用和动态前缀函数。

```tsx
// 最终的完美方案
const logger = useMemo(() => {
  // 定义一个函数，它在被调用时才去读取 ref 的最新值
- const getPrefix = () => `[${id}]<${displayNameRef.current}>`
+ const getDynamicPrefix = () => `<${displayNameRef.current}>`

-  return advancedLogger.withPrefix(getPrefix())// 致命错误在这里！
+ // 将 getDynamicPrefix 函数本身传递给 withPrefix
+ // logger 库会在内部需要前缀时调用这个函数
+ return appLogger
+   .withPrefix('Terminal')
+   .withPrefix(id)
+   .withPrefix(getDynamicPrefix)
}, [id]) // 依赖项中不再有 displayName！
```

这个方案为何能成功？

1. 稳定的 `logger` 实例：`useMemo` 的依赖项只有 `id`，所以 `logger` 对象的引用是稳定的。`useEffect` 依赖它不会导致不必要的重跑。
2. 动态的前缀行为：我们传递给 `.withPrefix()` 的是 `getDynamicPrefix` 这个函数本身，而不是它的执行结果。`appLogger` 的内部实现会在每次调用 `.info()`, `.error()` 等方法时，才去执行 `getDynamicPrefix()` 函数。
3. 读取最新值：因为 `getDynamicPrefix` 是在日志打印的时刻才被调用，所以它总能通过 `displayNameRef.current` 读取到最新的 `displayName` 值。

### **结论**

通过将动态数据封装在 `useRef` 中，并把一个读取该 `ref` 的函数传递给稳定的 `useMemo` 实例的模式，我们成功地将 `logger` 的 **稳定“身份”**（它的对象引用）与其动态的“行为”（它打印的前缀）进行了解耦。

现在，管理 WebSocket 的 `useEffect` 可以安全地依赖这个引用稳定的 `logger` 对象，重命名操作再也不会触发不必要的重连。同时，所有的日志输出又能正确地显示最新的 `displayName`，实现了功能与性能的完美统一。
