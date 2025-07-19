import React, { useState, ReactNode } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

import {
  DialogContext,
  type DialogOptions,
  type ShowDialogFunction,
} from '@/hooks/useDialog'

// 创建一个 Provider 组件
export function DialogProvider({ children }: { children: ReactNode }) {
  const [dialogConfig, setDialogConfig] = useState<DialogOptions | null>(null)

  const showDialog: ShowDialogFunction = ({ title, message }) => {
    setDialogConfig({ title, message })
  }

  const closeDialog = () => {
    setDialogConfig(null)
  }

  return (
    // 将 showDialog 函数通过Context 提供给所以子组件
    <DialogContext.Provider value={{ showDialog, closeDialog }}>
      {children}
      {/* // 全局只渲染一次 AlertDialog */}
      <AlertDialog
        // !! 是一个简洁的技巧，用来将任何“真值”（truthy）或“假值”（falsy）的变量，强制转换为一个纯粹的布尔值 true 或 false。
        open={!!dialogConfig}
        onOpenChange={(isOpen) => !isOpen && closeDialog()}
      >
        {/*让 AlertDialogContent 成为一个垂直的、固定高度的 Flexbox 容器*/}
        <AlertDialogContent className="flex flex-col max-h-[80vh]">
          {/* 头部：不允许收缩 */}
          <AlertDialogHeader className="flex-shrink-0">
            <AlertDialogTitle>{dialogConfig?.title}</AlertDialogTitle>
          </AlertDialogHeader>

          {/* 内容区：
            - flex-grow: 让它自动伸展，填充所有可用垂直空间
            - overflow-y-auto: 当内容超出时，只在这个区域内出现滚动条
            - my-4: 上下留出一些间距
          */}
          <div className="flex-grow my-4 overflow-y-auto">
            <AlertDialogDescription className="whitespace-pre-wrap break-words">
              {dialogConfig?.message}
            </AlertDialogDescription>
          </div>

          {/* 脚部：不允许收缩 */}
          <AlertDialogFooter className="flex-shrink-0">
            <AlertDialogAction onClick={closeDialog}>OK</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DialogContext.Provider>
  )
}

// whitespace-pre-wrap  /* 保持原有的换行符和空格 */
// break-words          /* 强制长单词或URL在任意位置换行 */
// max-h-[60vh]         /* 设置一个最大高度,比如视口高度的60% */
// overflow-y-auto      /* 当内容超出最大高度时，显示垂直滚动条 */
