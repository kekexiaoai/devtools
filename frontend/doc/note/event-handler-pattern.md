# React 最佳实践：优雅的事件处理与“指令”传递模式

在我们的代码中，父组件向子组件传递事件处理器时，采用了直接传递函数引用的方式，而非在父组件中指定参数。

```typescriptreact
// 在 SavedTunnelsView.tsx 中
<SavedTunnelItem
  // ...
  onStart={onStartTunnel}
  onStop={onStopTunnel}
  onEdit={onEditTunnel}
/>
```

**核心问题**：`onStart`, `onStop`, `onEdit` 这三个函数需要的参数各不相同，为什么我们不在父组件中像 `onStart={() => onStartTunnel(tunnel.id)}` 这样显式地传递参数呢？

答案在于一个优雅的 React 设计模式，它完美地体现了**关注点分离 (Separation of Concerns)**。

---

## 1. 核心思想：传递“指令”，而非“执行指令”

当我们写下 `onStart={onStartTunnel}` 时，我们并不是在**调用** `onStartTunnel` 函数。我们正在做的是，将 `onStartTunnel` 这个**函数本身**（可以想象成一个“指令”或一个“电话号码”）作为一个名为 `onStart` 的 prop，传递给了子组件 `SavedTunnelItem`。

这就引出了关键点：

> **谁负责提供参数，取决于谁最终“拨打”了这个电话。**

在这个场景中，真正“拨打”电话（即调用函数）的是子组件 `SavedTunnelItem`。

## 2. 子组件拥有所有必需的“情报”

现在，我们来看看 `SavedTunnelItem.tsx` 的内部。这个组件在被渲染时，已经从它的 props 中接收到了所有它需要的信息：

1. 完整的 `tunnel` 对象 (`sshtunnel.SavedTunnelConfig`)。
2. 可能存在的 `activeTunnel` 对象 (`sshtunnel.ActiveTunnelInfo`)。

因此，当它内部的按钮被点击时，它完全有能力提供正确的参数来调用它收到的“指令”：

```typescriptreact
// 在 SavedTunnelItem.tsx 内部

// 当“Start”按钮被点击时：
<Button onClick={() => onStart(tunnel.id)}>
  Start
</Button>

// 当“Stop”按钮被点击时：
<Button onClick={() => onStop(activeTunnel!.id)}>
  Stop
</Button>

// 当“Edit”按钮被点击时：
<Button onClick={() => onEdit(tunnel)}>
  Edit
</Button>
```

`SavedTunnelItem` 在交互发生的那个瞬间，拥有最完整的上下文，因此由它来负责提供正确的参数是最合理的。

## 3. 为什么这是个好模式？

这种“父组件定义行为，子组件决定何时触发并提供数据”的模式是 React 中**关注点分离**的一个绝佳体现：

- **`App.tsx` (父组件)**: 它的职责是**管理状态和定义业务逻辑**。它知道“如何”启动、停止、编辑隧道，但它不关心用户具体是点击了哪个图标或按钮来触发这些操作的。

- **`SavedTunnelItem` (子组件)**: 它的职责是**展示一个隧道的信息并响应用户的直接交互**。它知道自己代表哪个 `tunnel`，也知道哪个按钮对应哪个操作，但它完全不需要知道点击“Start”后具体会发生什么复杂的业务逻辑。它只需要忠实地“报告”：“嘿，用户想启动 ID 为 `xyz` 的这个隧道了！”

### 带来的好处

1. **代码更清晰**：父组件的 JSX 变得非常干净 (`onEdit={onEditTunnel}` 比 `onEdit={() => handleEdit(tunnel)}` 更能清晰地表达意图)。
2. **解耦与封装**：父组件与子组件的实现细节解耦。如果未来 `SavedTunnelItem` 的内部结构变化，只要它还能提供正确的参数，父组件就无需任何改动。
3. **性能更优**：避免了在父组件的每次渲染中都创建一个新的内联箭头函数实例。这对于使用了 `React.memo` 进行优化的子组件来说至关重要，因为稳定的函数引用是 `memo` 生效的前提。

---

总而言之，这种模式将“做什么”和“何时做”的决定权交给了最合适的组件，从而构建出更清晰、更可维护、性能也更优的 React 应用。
