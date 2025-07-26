# React `useState` Hook 深度解析：函数式更新

本文档旨在深入解析 React `useState` Hook 的函数式更新模式，并解释为什么当新状态依赖于旧状态时，它
是首选的最佳实践。

## 1. `useState` 基础

在 React 函数组件中，`useState` 钩子用于为组件添加 state（状态）。它返回一个包含两个元素的数组：

1. `currentState`: 当前的状态值。
2. `setState`: 一个用于更新该状态的函数。

```tsx
// 在 App.tsx 中
import { useState } from 'react'
import type { types } from '@wailsjs/go/models'

// ...
const [logs, setLogs] = useState<types.LogEntry[]>([])
```

在上述代码中，`logs` 是我们当前的状态，而 `setLogs` 则是专门用来更新 `logs` 的函数。

## 2. 状态更新的两种方式

`useState` 提供的 `setState` 函数支持两种调用方式。

### 方式一：直接传递新值 (Direct Value Update)

这是最直接的方式。当你明确知道下一个状态是什么，并且它不依赖于之前的状态时，可以使用这种方法。

```tsx
// 示例：清空日志
const clearLogs = () => {
  // 直接将一个新的空数组作为下一个状态
  setLogs([])
}
```

**缺点**: 如果新状态的计算需要依赖**当前**的状态值，这种方式在某些特定场景下可能会出现问题。

### 方式二：传递函数 (Functional Update) - 强烈推荐

当**新状态依赖于之前的状态**时，我们应该向 `setState` 函数传递一个**回调函数**。

```tsx
// 示例：在 App.tsx 中添加一条新日志
const addLogEntry = useCallback((logEntry: types.LogEntry) => {
  // 我们传递一个函数给 setLogs
  setLogs((prevLogs) => {
    // 这个函数接收 React 确保为最新的“前一个状态” (prevLogs)
    const newLogs = [...prevLogs, logEntry]
    // 函数的返回值将成为下一个状态
    return newLogs.length > 200 ? newLogs.slice(1) : newLogs
  })
}, [])
```

## 3. `prevLogs` 的来源：揭秘函数式更新的威力

> `prevLogs` 是 `setLogs` 函数式更新时的参数，代表前一个 `logs` 状态值。

您的这个理解完全正确。但**为什么** React 要提供这种看似更复杂的方式呢？

**根本原因**：React 的状态更新可能是**异步**和**批量处理 (batched)** 的。

这意味着，当您在同一个事件循环中多次调用 `setState` 时，React 可能会将它们合并为一次更新来优化性能。

### **一个经典的对比示例：计数器**

假设我们有一个计数器，想在一次点击中让它增加两次。

**错误的写法 (直接更新):**

```tsx
const [count, setCount] = useState(0)

const handleDoubleClick = () => {
  // 第一次调用时，count 的值是 0。
  setCount(count + 1) // setCount(0 + 1) -> 计划更新为 1

  // 第二次调用时，count 的值依然是 0，因为状态更新还没来得及执行！
  setCount(count + 1) // setCount(0 + 1) -> 再次计划更新为 1
}
// 最终结果: count 只会增加 1。
```

**正确的写法 (函数式更新):**

```tsx
const [count, setCount] = useState(0)

const handleDoubleClick = () => {
  // 第一次调用
  setCount((prevCount) => prevCount + 1) // React 将 "给我之前的值，然后+1" 这个操作放入队列

  // 第二次调用
  setCount((prevCount) => prevCount + 1) // React 将 "再给我之前的值，然后再+1" 这个操作放入队列
}
// React 在处理队列时，会正确地执行两次 +1 操作。
// 最终结果: count 会正确地增加 2。
```

`prevLogs` (或 `prevCount`) 正是 React 传递给这个队列中操作的、**绝对安全和最新**的状态快照。

## 4. 总结

`prevLogs` 是 `setLogs` 函数式更新时的参数，由 React 在内部管理和提供，代表了执行更新操作前一刻的最新的状态值。

**何时使用函数式更新？**

> **黄金法则：只要你的下一个 state 依赖于前一个 state，就一定要使用函数式更新。**

这能保证您的代码在任何情况下（包括 React 未来的并发模式）都能稳健、可预测地工作。
