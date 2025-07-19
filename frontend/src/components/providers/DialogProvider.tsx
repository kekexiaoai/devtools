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
    <DialogContext.Provider value={showDialog}>
      {children}
      {/* // 全局只渲染一次 AlertDialog */}
      <AlertDialog
        // !! 是一个简洁的技巧，用来将任何“真值”（truthy）或“假值”（falsy）的变量，强制转换为一个纯粹的布尔值 true 或 false。
        open={!!dialogConfig}
        onOpenChange={(isOpen) => !isOpen && closeDialog()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dialogConfig?.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {dialogConfig?.message}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={closeDialog}>OK</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DialogContext.Provider>
  )
}
