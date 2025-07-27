import { createContext, useContext } from 'react'

export type DialogOptions = {
  title: string
  message: string
  type?: 'info' | 'success' | 'error' | 'confirm'
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
