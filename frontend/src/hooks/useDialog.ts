import { createContext, useContext } from 'react'

export type DialogOptions = {
  title: string
  message: string
}

export type ShowDialogFunction = (options: DialogOptions) => void

// 创建一个context对象
export const DialogContext = createContext<ShowDialogFunction | undefined>(
  undefined
)

// 创建一个自定义hook， 让子组件可以方便地使用Context
export function useDialog(): ShowDialogFunction {
  const context = useContext(DialogContext)
  if (context === undefined) {
    throw new Error('useDialog must be used within a DialogProvider')
  }
  return context
}
