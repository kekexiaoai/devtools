# React 性能陷阱：由不稳定的 Prop 函数引发的无限渲染循环

本文档记录并分析了一次在开发终端状态指示器功能时遇到的严重性能问题——一个由不稳定的函数 Prop 引发的无限渲染循环。

## 1. 问题现象

在为终端标签页添加了连接状态指示器后，应用在打开终端视图时出现严重卡顿，CPU 占用率飙升。通过日志观察，发现 `IntegratedTerminal` 组件内的某个 `useEffect` 被无限次地触发，导致了组件的无限重渲染。

## 2. 问题代码 (The Culprit)

问题的根源在于 `TerminalView.tsx` 组件的渲染方法中，我们为 `onStatusChange` prop 创建了一个内联的箭头函数：

```tsx
// file: frontend/src/views/TerminalView.tsx

terminalSessions.map((session) => (
  <TabsContent key={session.id} ...>
    <IntegratedTerminal
      // ... other props
      // 关键问题：每次渲染都会创建一个新的函数实例
      onStatusChange={(status) => onStatusChange(session.id, status)}
    />
  </TabsContent>
))
```

而在 `IntegratedTerminal.tsx` 组件内部，这个 `onStatusChange` prop 被用作一个 `useEffect` 的依赖项：

```tsx
// file: frontend/src/components/sshgate/IntegratedTerminal.tsx

useEffect(() => {
  // 这个 effect 会在状态变化时，调用 onStatusChange 通知父组件
  onStatusChange(id, connectionStatus)
}, [id, connectionStatus, onStatusChange]) // onStatusChange 是依赖项
```

## 3. 根源分析：恶性循环的诞生

这个 Bug 的触发形成了一个完美的闭环：

1. **`TerminalView` 渲染**: 组件开始渲染，遍历 `terminalSessions`。
2. **创建新函数**: 在 `.map()` 循环中，`onStatusChange={(status) => ...}` 为每个终端都创建了一个**全新的函数实例**。虽然代码看起来一样，但它在内存中的地址是全新的。
3. **Prop 变更**: `IntegratedTerminal` 组件接收到这个新的函数实例作为 `onStatusChange` prop。
4. **依赖检查**: `IntegratedTerminal` 内部的 `useEffect` 在执行前，会检查其依赖项 `[id, connectionStatus, onStatusChange]` 是否发生变化。
5. **引用不相等**: React 使用 `Object.is` (类似于 `===`) 来比较依赖项。由于上一次渲染传入的 `onStatusChange` 函数和这一次的函数是两个不同的实例（引用地址不同），React 认为这个依赖项**发生了变化**。
6. **Effect 再次执行**: 因为依赖项变化，`useEffect` 的回调函数被再次执行。
7. **状态更新**: Effect 内部调用了 `onStatusChange`，这会触发 `App.tsx` 中的 `setTerminalSessions`，更新顶层状态。
8. **父组件重渲染**: `App.tsx` 的状态更新，导致其子组件 `TerminalView` **再次重渲染**。
9. **回到第 1 步**: `TerminalView` 的重渲染又会创建新的函数实例，无限循环就此诞生。

## 4. 解决方案：确保 Prop 的引用稳定性

解决方案的核心是打破这个循环，确保传递给 `IntegratedTerminal` 的 `onStatusChange` prop 是一个**稳定**的函数引用。

1. **在 `App.tsx` 中使用 `useCallback`**:
   确保顶层传递下来的 `updateTerminalStatus` 函数本身是稳定的。

   ```tsx
   const updateTerminalStatus = useCallback(...)
   ```

2. **修改 `IntegratedTerminal` 的“契约”**:
   让 `IntegratedTerminal` 接收那个稳定的、通用的状态更新函数，并由它自己负责在调用时传入自己的 `id`。

3. **在 `TerminalView` 中直接传递 Prop**:
   直接将从 `App.tsx` 接收到的稳定函数 `onStatusChange` 传递下去，不再创建内联函数。

   ```tsx
   // file: frontend/src/views/TerminalView.tsx
   <IntegratedTerminal
     // ...
     onStatusChange={onStatusChange} // 直接传递稳定引用
   />
   ```

## 5. 核心启示 (Key Takeaway)

> 当向子组件传递函数或对象作为 props 时，如果该 prop 被子组件用作 `useEffect` 的依赖项，或子组件是经过 `React.memo` 优化的，**必须**确保该 prop 的引用是稳定的。使用 `useCallback` 包装函数，使用 `useMemo` 包装对象和数组，是保证引用稳定性的标准做法。

这个案例是 React 中关于“引用相等性”重要性的一个绝佳教材。
