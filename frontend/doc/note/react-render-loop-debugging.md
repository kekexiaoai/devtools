# React 渲染陷阱深度解析：一次 `Maximum update depth exceeded` 的连锁反应

在 React 开发中，`Maximum update depth exceeded` 是一个常见的错误，但其背后的原因有时非常隐蔽。最近，我们遇到了一个由 `await` 和 `setState` 交互引发的经典案例，它完美地展示了 React 状态和渲染周期的核心工作机制。

## 案发现场：一个无法结束的 `useEffect`

**问题场景**：当 SSH 连接失败后，我们希望弹出一个错误对话框。代码在 `useSshConnection` hook 的 `useEffect` 中大致如下：

```typescript
case 'failure': {
  const { context, error } = state
  // 问题代码：
  await showDialog({
    type: 'error',
    title: 'Connection Failed',
    message: error.message,
  })
  context.reject(error)
  setState({ status: 'idle' }) // 理论上，这里会重置状态
  break
}
```

**观察到的现象**：应用白屏，控制台报错 `Maximum update depth exceeded`。通过日志发现，程序在 `const { context, error } = state` 和 `await showDialog(...)` 这两行之间反复执行，形成死循环。

## 核心疑问：为什么会循环？重渲染到底做了什么？

用户的调试和疑问非常精准，直击要害：

1. **`showDialog` 确实触发了重渲染，如何证明？**
2. **如果组件重渲染了，`useSshConnection` 这个 Hook 的函数体不会重新执行吗？** (是的，它会)
3. **`const [state, setState] = useState({ status: 'idle' })` 这个 state 在重渲染时，为什么没有被重置回 `'idle'`？** (因为 `useState` 有记忆)
4. **`connect` 函数为什么没有在重渲染时被再次调用？** (因为它被 `useCallback` 稳定了，且它是一个事件处理器，不是一个在渲染期间执行的函数)

要回答这些问题，我们必须理解 React 的两个核心法则。

### 法则一：`useState` 具有“记忆”

把 `useState` 想象成组件向 React “租用”的一个记忆存储柜。

- **首次渲染 (Mount)**：当组件第一次运行时，它调用 `useState({ status: 'idle' })`。React 会开辟一个新的存储柜，把 `{ status: 'idle' }` 这个初始值放进去，然后把这个值和一把用于修改它的钥匙 (`setState`) 交给组件。
- **后续重渲染 (Re-render)**：当 `setState` 被调用后，React 会安排一次重渲染。当组件函数**再次执行**到 `useState(...)` 这一行时，React **不会**再看括号里的初始值了。相反，它会根据这个组件的身份，找到之前租给它的那个存储柜，把里面**最新的值**取出来，交还给组件。

**结论**：**`useState` 的初始值只在组件首次挂载时使用一次。在后续的所有重渲染中，它返回的都是 React 为你“记住”的当前状态值。** 这就是为什么在我们的 Bug 循环中，`state.status` 始终是 `'failure'`，而不是被重置为 `'idle'`。

### 法则二：`useCallback` 稳定了函数

`connect` 函数被 `useCallback` 包裹，并且其依赖项数组是空的 (`[]`)。

```typescript
const connect = useCallback(
  (options: ConnectOptions): Promise<string | null> => {
    // ...
  },
  [] // 空依赖数组
)
```

这意味着：

- **首次渲染**：React 执行 `useCallback` 的内部函数，创建出 `connect` 函数，并把这个函数实例“记住”。
- **后续重渲染**：当组件重渲染时，React 看到 `useCallback` 的依赖项数组 `[]` 没有变化，它就会**跳过**内部函数的执行，直接返回它上次“记住”的那个 `connect` 函数实例。

**结论**：**`connect` 函数本身只被创建了一次。重渲染仅仅是让 `SavedTunnelsView` 组件重新拿到了对同一个 `connect` 函数的引用，而不会重新执行 `connect` 函数的内部逻辑。** `connect` 的逻辑只有在用户**点击按钮**时才会被触发。

### 总结：重渲染到底做了什么？

结合以上两点，我们可以清晰地回答这个问题：

当一个组件（如 `SavedTunnelsView`）重渲染时：

1. **组件函数体会被完整地重新执行一遍。**
2. 所有在函数体内部调用的 Hooks（如 `useSshConnection`）也会**被重新调用**。
3. 在 `useSshConnection` 内部：
   - `useState` 会被调用，但它返回的是 React **记住的当前状态值**（比如 `failure`），而不是初始值。
   - `useCallback` 会被调用，但由于依赖项 `[]` 未变，它返回的是 React **记住的旧的函数实例**，并不会重新创建 `connect` 函数。
   - `useEffect` 的回调函数**不会**立即执行。React 会在渲染完成后，比较其依赖项（`state`），如果发现变化，才会**在稍后**调度执行 `useEffect` 的回调。

这就是为什么在循环中，我们看到 `useSshConnection hook is running, current status: failure` 的日志不断出现，但 `connect` 函数的逻辑并未执行，且 `state` 也未被重置。

## 连锁反应剖析：致命循环是如何形成的

现在，我们可以结合日志，一步步追踪这个 Bug 的发生过程：

1. **用户点击，`connect` 被调用**：`setState({ status: 'connecting', ... })` 被执行。
2. **第一次重渲染**：`useSshConnection` hook 重新运行，`useState` 返回了新状态 `{ status: 'connecting', ... }`。渲染完成后，`useEffect` 看到 `status` 变化，开始执行连接逻辑。
3. **连接失败**：后端 Promise 被 `reject`，`catch` 块被触发，执行 `setState({ status: 'failure', ... })`。
4. **第二次重渲染（循环开始点）**：
   - `SavedTunnelsView` 组件重渲染。
   - `useSshConnection` hook 再次运行。日志打印：`useSshConnection hook is running, current status: failure`。
   - `useState` 返回了**当前**的状态：`{ status: 'failure', ... }`。
5. **`useEffect` 运行并暂停**：
   - 渲染完成后，`useEffect` 看到 `status` 从 `connecting` 变为 `failure`，其回调函数被执行。日志打印：`useEffect is running, current status: failure`。
   - `switch` 语句进入 `case 'failure':` 分支。
   - 代码执行到 `await showDialog(...)`。`useEffect` 的执行流在这里**暂停**，等待 `showDialog` 的 Promise 完成。
6. **`showDialog` 触发第三次重渲染**：
   - `showDialog` 函数为了显示对话框，会调用它自己的 `setState` 来更新 UI。
   - 这个 `setState` 调用，导致了 `SavedTunnelsView` 组件（以及 `useSshConnection` hook）**再一次重渲染**。
7. **回到第 4 步，形成无限循环**：
   - `SavedTunnelsView` 再次重渲染。
   - `useSshConnection` hook 再次运行。日志再次打印：`useSshConnection hook is running, current status: failure`。
   - `useState` 依然返回 `{ status: 'failure', ... }`，因为被 `await` 卡住的 `useEffect` 根本没机会执行到 `setState({ status: 'idle' })`。
   - 渲染完成后，`useEffect` 看到依赖项 `state` 的引用虽然变了（因为组件重渲染了），但 `status` 字段没变。它**可能**会再次运行（取决于 React 的具体优化），并再次卡在 `await showDialog(...)`，再次触发重渲染……

这个 “`useEffect` 运行 -> `await` 一个会触发重渲染的函数 -> 导致自身再次重渲染” 的模式，就是 `Maximum update depth exceeded` 的根源。

## 解决方案：打破循环

您注释掉 `await` 的做法是完全正确的。我们只需要“触发”对话框显示，而不需要“等待”它关闭。

```typescript
// 解决方案
case 'failure': {
  const { context, error } = state

  // "发射后不管"，我们不等待 showDialog 完成
  void showDialog({
    type: 'error',
    title: 'Connection Failed',
    message: error.message,
  })

  // useEffect 的逻辑可以立即向下执行
  context.reject(error)
  setState({ status: 'idle' }) // 关键：立即将状态设置为 'idle'
  break
}
```

**为什么这样能行？**

1. `showDialog` 被调用，它内部的 `setState` 仍然会触发一次重渲染。
2. 但是，我们的 `useEffect` **没有被 `await` 暂停**，它会立即执行 `setState({ status: 'idle' })`。
3. React 非常智能，它会批处理（batch）这两个（或多个）在同一次事件循环中发生的 `setState` 调用。当最终重渲染发生时，`useSshConnection` 的状态已经是 `'idle'` 了。
4. `useEffect` 再次运行时，看到 `status` 是 `'idle'`，就不会再进入 `failure` 分支，循环被成功打破。

## 如何证明？

在代码中加入 `console.log` 是最好的证明方式：

```typescript
// 在 SavedTunnelsView.tsx
export const SavedTunnelsView = forwardRef(...) => {
  console.log('SavedTunnelsView is rendering');
  const connect = useCallback(() => {
    console.log('Connect function is being CALLED');
    // ...
  }, []);
  // ...
}

// 在 useSshConnection.ts
export function useSshConnection(...) {
  const [state, setState] = useState(...);
  console.log('useSshConnection hook is running, current status:', state.status);

  useEffect(() => {
    console.log('useEffect is running, current status:', state.status);
    // ...
  }, [state, ...]);
}
```

通过观察控制台的输出，您将能清晰地看到上述的渲染和状态变化流程，从而验证我们的分析。

---

这次的 Bug 是一个绝佳的学习案例，它深刻地揭示了 React 中状态、副作用和渲染周期之间微妙而重要的关系。

希望这篇笔记能帮助您更深入地理解 React 的工作原理！
