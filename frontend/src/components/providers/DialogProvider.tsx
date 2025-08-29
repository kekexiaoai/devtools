import React, { useState, ReactNode, useCallback, useMemo } from 'react'
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
  type DialogResult,
} from '@/hooks/useDialog'
import { Button } from '../ui/button'

import { Info, CheckCircle2, XCircle, HelpCircle } from 'lucide-react'
import { Label } from '@radix-ui/react-label'
import { Input } from '../ui/input'
import { Checkbox } from '../ui/checkbox'

// 创建一个 Provider 组件
export function DialogProvider({ children }: { children: ReactNode }) {
  const [dialogConfig, setDialogConfig] = useState<{
    options: DialogOptions
    resolve: (value: DialogResult) => void
  } | null>(null)

  const [inputValue, setInputValue] = useState('')
  const [checkedValues, setCheckedValues] = useState<string[]>([])

  const showDialog: ShowDialogFunction = useCallback((options) => {
    return new Promise((resolve) => {
      // 每次打开新对话框时，重置内部状态
      setInputValue('')
      // 初始化选中状态
      const initialCheckedValues = options.checkboxes
        ? options.checkboxes
            .filter((cb) => cb.CheckedState)
            .map((cb) => cb.value)
        : []
      console.log('showDialog,initialCheckedValues', initialCheckedValues)
      setCheckedValues(initialCheckedValues)
      // 默认类型为 'info'
      const optsWithDefaults: DialogOptions = { type: 'info', ...options }
      setDialogConfig({ options: optsWithDefaults, resolve })
    })
  }, [])

  const dialVisuals = useMemo(() => {
    if (!dialogConfig) return null

    const type = (dialogConfig?.options?.type as string) || 'info'

    switch (type) {
      case 'success':
        return {
          Icon: CheckCircle2,
          colorClass: 'text-green-500',
        }
      case 'error':
        return {
          Icon: XCircle,
          colorClass: 'text-destructive',
        }
      case 'confirm':
        return {
          Icon: HelpCircle,
          colorClass: 'text-amber-500',
        }
      case 'info':
      default:
        return {
          Icon: Info,
          colorClass: 'text-primary',
        }
    }
  }, [dialogConfig])

  const closeDialog = () => {
    setDialogConfig(null)
  }

  const handleClose = (value: string | null) => {
    dialogConfig?.resolve({
      buttonValue: value,
      inputValue: inputValue,
      checkedValues: checkedValues,
    })
    closeDialog()
  }

  const handleCheckboxChange = (checked: boolean, value: string) => {
    setCheckedValues((prev) => {
      if (checked) {
        return [...prev, value]
      } else {
        return prev.filter((item) => item !== value)
      }
    })
  }

  const handleFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault() // 阻止表单默认的页面刷新行为
    // 自动查找第一个非 'outline' 变体的按钮作为确认操作
    const confirmButton = dialogConfig?.options.buttons?.find(
      (b) => b.variant !== 'outline'
    )
    handleClose(confirmButton?.value ?? 'ok')
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
        <AlertDialogContent>
          <form
            onSubmit={handleFormSubmit}
            className="flex flex-col max-h-[80vh]"
          >
            {/* 头部：不允许收缩 */}
            <AlertDialogHeader className="flex-shrink-0">
              {/* 在标题旁边渲染动态的图标和颜色 */}
              {dialVisuals && (
                <dialVisuals.Icon
                  className={`h6 w-6 ${dialVisuals.colorClass}`}
                />
              )}
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
            <div className="py-4 space-y-4">
              {/* 条件渲染输入框 */}
              {dialogConfig?.options.prompt && (
                <div className="flex items-center space-x-2">
                  <Label htmlFor="dialog-prompt" className=" whitespace-nowrap">
                    {dialogConfig.options.prompt.label}
                  </Label>
                  <Input
                    id="dialog-prompt"
                    type={dialogConfig.options.prompt.type}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    className="mt-2 flex-grow"
                    autoFocus
                  />
                </div>
              )}
              {/* 条件渲染选择框 */}
              {dialogConfig?.options.checkboxes &&
                dialogConfig.options.checkboxes.map((cb) => (
                  <div key={cb.value} className="flex items-start space-x-3">
                    <Checkbox
                      id={`dialog-cb-${cb.value}`}
                      onCheckedChange={(checked) =>
                        handleCheckboxChange(Boolean(checked), cb.value)
                      }
                      checked={checkedValues.includes(cb.value)}
                      className="mt-0.5"
                    />
                    <div className="grid gap-1.5 leading-none">
                      <Label
                        htmlFor={`dialog-cb-${cb.value}`}
                        className="font-normal"
                      >
                        {cb.label}
                      </Label>
                      {cb.description && (
                        <p className="text-sm text-muted-foreground">
                          {cb.description}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
            </div>

            {/* 脚部：不允许收缩 */}
            <AlertDialogFooter className="flex-shrink-0">
              {/* 动态渲染按钮 */}
              {dialogConfig?.options.buttons ? (
                dialogConfig.options.buttons.map((button) => (
                  <Button
                    key={button.text}
                    type={button.variant === 'outline' ? 'button' : 'submit'}
                    variant={button.variant}
                    onClick={() => handleClose(button.value)}
                  >
                    {button.text}
                  </Button>
                ))
              ) : (
                // 如果没有定义按钮，则渲染一个默认的 "OK" 按钮
                // 对于没有自定义按钮的简单提示，我们使用语义化的 AlertDialogAction
                <AlertDialogAction
                  type="submit"
                  onClick={() => handleClose('ok')}
                >
                  OK
                </AlertDialogAction>
                // <Button onClick={() => handleClose('ok')}>OK</Button>
              )}
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </DialogContext.Provider>
  )
}

// whitespace-pre-wrap  /* 保持原有的换行符和空格 */
// break-words          /* 强制长单词或URL在任意位置换行 */
// max-h-[60vh]         /* 设置一个最大高度,比如视口高度的60% */
// overflow-y-auto      /* 当内容超出最大高度时，显示垂直滚动条 */

// 用法示例
// import { useDialog } from '../hooks/useDialog';

// export function FileSyncerView() {
//   const { showDialog } = useDialog();

//   const handleSaveConfig = async () => {
//     if (!form.name || !form.name.trim()) {
//       // 调用 'error' 类型的对话框
//       showDialog({
//         title: 'Validation Error',
//         message: 'Configuration Name cannot be empty.',
//         type: 'error'
//       });
//       return;
//     }
//     // ...
//   }
// }
