import React, { useState, ReactNode, useCallback } from 'react'
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
import { Button } from '../ui/button'

// 创建一个 Provider 组件
export function DialogProvider({ children }: { children: ReactNode }) {
  const [dialogConfig, setDialogConfig] = useState<{
    options: DialogOptions
    resolve: (value: string | null) => void
  } | null>(null)

  const showDialog: ShowDialogFunction = useCallback((options) => {
    return new Promise((resolve) => {
      setDialogConfig({ options, resolve })
    })
  }, [])

  const closeDialog = () => {
    setDialogConfig(null)
  }

  const handleClose = (value: string | null) => {
    dialogConfig?.resolve(value)
    closeDialog()
  }

  return (
    // 将 showDialog 函数通过Context 提供给所以子组件
    <DialogContext.Provider value={{ showDialog, closeDialog }}>
      {children}
      {/* // 全局只渲染一次 AlertDialog */}
      <AlertDialog
        // !! 是一个简洁的技巧，用来将任何“真值”（truthy）或“假值”（falsy）的变量，强制转换为一个纯粹的布尔值 true 或 false。
        open={!!dialogConfig}
        onOpenChange={(isOpen) => !isOpen && handleClose(null)}
      >
        {/*让 AlertDialogContent 成为一个垂直的、固定高度的 Flexbox 容器*/}
        <AlertDialogContent className="flex flex-col max-h-[80vh]">
          {/* 头部：不允许收缩 */}
          <AlertDialogHeader className="flex-shrink-0">
            <AlertDialogTitle>{dialogConfig?.options.title}</AlertDialogTitle>
          </AlertDialogHeader>

          {/* 内容区：
            - flex-grow: 让它自动伸展，填充所有可用垂直空间
            - overflow-y-auto: 当内容超出时，只在这个区域内出现滚动条
            - my-4: 上下留出一些间距
          */}
          <div className="flex-grow my-4 overflow-y-auto">
            <AlertDialogDescription className="whitespace-pre-wrap break-words">
              {dialogConfig?.options.message}
            </AlertDialogDescription>
          </div>

          {/* 脚部：不允许收缩 */}
          <AlertDialogFooter className="flex-shrink-0">
            {/* 动态渲染按钮 */}
            {dialogConfig?.options.buttons ? (
              dialogConfig.options.buttons.map((button) => (
                <Button
                  key={button.text}
                  variant={button.variant}
                  onClick={() => handleClose(button.value)}
                >
                  {button.text}
                </Button>
              ))
            ) : (
              // 如果没有定义按钮，则渲染一个默认的 "OK" 按钮
              // 对于没有自定义按钮的简单提示，我们使用语义化的 AlertDialogAction
              <AlertDialogAction onClick={() => handleClose('ok')}>
                OK
              </AlertDialogAction>
              // <Button onClick={() => handleClose('ok')}>OK</Button>
            )}
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
