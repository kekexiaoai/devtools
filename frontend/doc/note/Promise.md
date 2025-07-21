# React 异步编程深度解析：精通 `Promise`, `resolve` 与 `reject`

这份笔记旨在彻底厘清 JavaScript 中 `Promise` 的工作原理，特别是 `resolve` 和 `reject` 这两个核心函数的职责与调用时机。

## 核心模型：“未来餐厅”的订单系统

为了理解 `Promise`，让我们想象一个未来餐厅的自动化点餐流程。

- **您 (调用异步函数的组件)**: 顾客。
- **异步函数 (如 `showDialog`)**: 餐厅的“点餐系统”。
- **`new Promise(...)`**: 当您点餐时，系统为您创建了一个全新的”**订单流程**“。这个流程代表了一个**承诺**——餐厅承诺最终会给您一个结果。
- **`resolve` 函数**: 这个订单流程中，系统专门为您指派了一位“**传菜员**”。这位传菜员的**唯一职责**，就是当您的菜（用户的选择）**成功**准备好后，把它端给您。**`resolve` 就是这位传菜员。**
- **`reject` 函数**: 同时，系统也指派了一位“**大堂经理**”。如果厨房在做菜过程中发生了意外（比如食材用完了），大堂经理的职责就是过来向您**报告这个坏消息**。**`reject` 就是这位大堂经理。**
- **`await` 关键字**: 就是您，这位顾客，在点完餐后，**耐心等待**“传菜员”把菜端上来，**或者**“大堂经理”过来通知您坏消息的那个过程。

---

## 疑难解答
### Q1: `resolve` 到底是什么？是 `Promise` 固定的语法吗？

**A:** 是的，`resolve` 是 `new Promise` 构造函数固定的语法。

当您写 `new Promise((resolve, reject) => { ... })` 时，JavaScript 引擎会自动创建两个函数 `resolve` 和 `reject`，并将它们作为参数传递给您的回调函数。

- 调用 `resolve(value)`: 意味着这个 Promise **成功完成**，`value` 就是它的最终结果。
- 调用 `reject(error)`: 意味着这个 Promise **失败了**，`error` 就是失败的原因。

### Q2: `resolve` 的真实处理逻辑在哪儿？是用户自定义的吗？

**A:** 它的处理逻辑是**内置固定**的。`resolve(value)` 的唯一作用，就是将这个 Promise 的状态从“进行中 (pending)”变为“已完成 (fulfilled)”，并将 `value` 作为这个 Promise 的最终结果。任何正在 `await` 这个 Promise 的代码，都会在此时“苏醒”，并拿到这个 `value`。

### Q3: 为什么 `resolve(value)` 后，`const choice = await ...` 中的 `choice` 就等于 `value` 了？

**A:** 这正是 `await` 与 `resolve` 协同工作的核心。

我们来看这个流程：
1.  用户点击 `<Button onClick={() => handleClose('yes')}>`。
2.  `handleClose('yes')` 被调用，此时 `value` 就是字符串 `'yes'`。
3.  函数内部执行 `dialogConfig.resolve('yes')`。
4.  这个 `resolve` 函数，正是我们之前在 `showDialog` 中为 `await` 创建的那个“传菜员”。
5.  `resolve('yes')` 执行，它告诉对应的 Promise：“你的任务完成了，结果是字符串 `'yes'`”。
6.  `const choice = await showDialog(...)` 这一行代码结束等待，并将 Promise 的结果 `'yes'` 赋值给了 `choice`。

所以，`choice` 的值，就是我们调用 `resolve` 时传递给它的那个值。

- 如果点击了 `value` 为 `'yes'` 的按钮，`choice` 就是 `'yes'`。
- 如果用户按 `Esc` 键关闭，`onOpenChange` 会触发 `handleClose(null)`，那么 `choice` 就是 `null`。


### Q4: `resolve` 和 `reject` 到底是谁调用的？

**A:** 它们是由 `Promise` 构造函数**提供**的工具，但最终是由**我们自己撰写的逻辑**来**调用**的。

当我们写 `new Promise((resolve, reject) => { ... })` 时，JavaScript 引擎会自动创建 `resolve` 和 `reject` 这两个函数，并把它们作为参数传给我们。

我们的职责，就是在 `...` 这段逻辑中，根据我们的业务情况，来决定是该调用 `resolve`（上菜！），还是该调用 `reject`（出错了！）。

### Q5: 在我们的 `DialogProvider` 中，`reject` 应该在哪儿？如何使用？

**A:** 在一个简单的对话框中，`reject` 似乎没有用武之地，因为“显示一个对话框”这个操作本身很难失败。但为了代码的完整性和健壮性，我们可以设想一种情况：如果 `showDialog` 在被调用时，已经有一个对话框在显示了，我们可以认为这是一次“失败”的调用。

下面是一个更完整的 `DialogProvider` 实现，它同时使用了 `resolve` 和 `reject`。

---

## 代码示例：一个更健壮的 `DialogProvider`

### 1. `hooks/useDialog.ts` (保持不变)

这个文件定义了我们系统的“契约”，无需改动。
```tsx
import { createContext, useContext } from 'react'

export type DialogOptions = {
  title: string
  message: string
  type?: 'info' | 'error' | 'confirm'
  // 允许自定义按钮
  buttons?: {
    text: string
    variant:
      | 'default'
      | 'destructive'
      | 'outline'
      | 'secondary'
      | 'ghost'
      | 'link'
    value: string // 点击 Promise resolve 的值
  }[]
}

export type ShowDialogFunction = (
  options: DialogOptions
) => Promise<string | null>

// 定义 Context 值的类型
export type DialogContextValue = {
  showDialog: ShowDialogFunction
  closeDialog: () => void
  // 可添加更多属性
}

// 创建一个context对象
export const DialogContext = createContext<DialogContextValue | undefined>(
  undefined
)

// 创建一个自定义hook， 让子组件可以方便地使用Context
export function useDialog(): DialogContextValue {
  const context = useContext(DialogContext)
  if (context === undefined) {
    throw new Error('useDialog must be used within a DialogProvider')
  }
  return context
}

```

### 2. `components/providers/DialogProvider.tsx` (重构后)

```tsx
// file: frontend/src/components/providers/DialogProvider.tsx

import React, { useState, ReactNode, useCallback } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { DialogContext, type DialogOptions } from '@/hooks/useDialog';

export function DialogProvider({ children }: { children: ReactNode }) {
  const [dialogState, setDialogState] = useState<{
    options: DialogOptions;
    resolve: (value: string | null) => void;
    reject: (reason?: any) => void; // 我们现在也保存 reject 函数
  } | null>(null);

  const showDialog = useCallback((options: DialogOptions) => {
    // 如果当前已经有一个对话框在显示，则立即 reject 新的请求
    if (dialogState) {
      return Promise.reject(new Error("Another dialog is already open."));
    }
    
    return new Promise<string | null>((resolve, reject) => {
      setDialogState({ options, resolve, reject });
    });
  }, [dialogState]); // 依赖 dialogState 来检查是否已打开

  const handleClose = (value: string | null) => {
    // 无论是哪个按钮被点击，我们都认为是“成功”地获取了用户的选择
    dialogState?.resolve(value);
    setDialogState(null);
  };

  return (
    <DialogContext.Provider value={{ showDialog }}>
      {children}

      <AlertDialog open={!!dialogState} onOpenChange={(isOpen) => {
        // 当用户通过 Esc 或点击遮罩层关闭时，我们认为是“取消”
        if (!isOpen) {
          handleClose(null); 
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dialogState?.options.title}</AlertDialogTitle>
            <AlertDialogDescription className="whitespace-pre-wrap break-words max-h-[60vh] overflow-y-auto">
              {dialogState?.options.message}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {dialogState?.options.buttons ? (
              dialogState.options.buttons.map(button => (
                <Button key={button.text} variant={button.variant} onClick={() => handleClose(button.value)}>
                  {button.text}
                </Button>
              ))
            ) : (
              <AlertDialogAction onClick={() => handleClose('ok')}>OK</AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DialogContext.Provider>
  );
}
```

### 3. `如何在组件中消费这个 Promise`
```tsx
// 在 FileSyncerView.tsx 或其他组件中
// 解构赋值获取所需属性
const { showDialog } = useDialog();

const handleDelete = async (id: string) => {
  try {
    const choice = await showDialog({
      title: 'Confirm Deletion',
      message: 'Are you sure?',
      buttons: [
        { text: 'Cancel', variant: 'outline', value: 'cancel' },
        { text: 'Yes, Delete', variant: 'destructive', value: 'yes' },
      ],
    });

    // `resolve` 成功后，这里的代码会执行
    if (choice === 'yes') {
      console.log('User confirmed deletion!');
      // ... 执行删除逻辑 ...
    } else {
      console.log('User cancelled deletion.');
    }

  } catch (error) {
    // 如果 `reject` 被调用 (比如另一个对话框已打开)，这里的代码会执行
    console.error(`Could not show dialog: ${String(error)}`);
  }
};
```
