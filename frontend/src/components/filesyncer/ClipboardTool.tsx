import React, { useState, useEffect, useMemo } from 'react'
import type { types } from '@wailsjs/go/models'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

import {
  SaveConfig,
  UpdateRemoteFileFromClipboard,
} from '@wailsjs/go/backend/App'
import { useDialog } from '@/hooks/useDialog'
import { DialogDescription } from '@radix-ui/react-dialog'

interface ClipboardToolProps {
  config: types.SSHConfig
  onConfigUpdate: () => void
}

function ClipboardTool({ config, onConfigUpdate }: ClipboardToolProps) {
  const { showDialog } = useDialog()

  // 这个 state 用于追踪用户是否正在编辑远程文件路径
  const [isEditingPath, setIsEditingPath] = useState(false)
  // 这个 state 专门用于表单，避免直接修改 props
  const [remotePath, setRemotePath] = useState(config.clipboardFilePath || '')

  // 模态框相关状态
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [clipboardContent, setClipboardContent] = useState('')
  const [syncStatus, setSyncStatus] = useState('')

  // 选项状态
  const [syncAsHTML, setSyncAsHTML] = useState(true)
  const [autoSyncOnPaste, setAutoSyncOnPaste] = useState(true)
  const [closeOnSuccess, setCloseOnSuccess] = useState(true)
  const [appendOnPaste, setAppendOnPaste] = useState(false)

  // 使用 useEffect Hook 同步 Props 到 State
  // 当用户在左侧列表切换配置时，props.cofig 会改变
  // 这个 effect 会监听这个变化，并用新的 props 的值来更新组件内部的 state
  useEffect(() => {
    setRemotePath(config.clipboardFilePath || '')
    setIsEditingPath(false) // 切换后总是回到非编辑状态
  }, [config.clipboardFilePath, config.id])

  // --事件处理函数---------------------
  const handleSaveChanges = async () => {
    if (!remotePath.trim()) {
      await showDialog({
        title: 'Validation Error',
        message: 'Remote File Path connot be empty.',
      })
      return
    }

    try {
      // 创建一个新的配置对象来保存，只更新我们修改的字段
      const configToSave = { ...config, clipboardFilePath: remotePath }
      await SaveConfig(configToSave)
      onConfigUpdate() // 通知父组件数据已更新
      setIsEditingPath(false) // 保存成功后，切换回非编辑状态
    } catch (error) {
      await showDialog({
        title: 'Save Error',
        message: `Failed to save path: ${String(error)}`,
      })
    }
  }

  const cancelEdit = () => {
    setRemotePath(config.clipboardFilePath || '') // 恢复原始值
    setIsEditingPath(false)
  }

  const openEditorModal = () => {
    // setClipboardContent('')
    setSyncStatus('')
    setIsModalOpen(true)
  }

  // 处理原生粘贴事件
  const handleNativePaste = async (event: React.ClipboardEvent) => {
    console.log('clipboardContent-0', clipboardContent)

    // 从事件的 clipboardData 属性中直接获取粘贴的文本
    const pastedText = event.clipboardData.getData('text')
    console.log('clipboardContent-1', clipboardContent)
    console.log('pastedText', pastedText)

    if (autoSyncOnPaste && pastedText) {
      // 阻止默认的粘贴行为，我们自己来处理
      event.preventDefault()
      console.log('clipboardContent-2', clipboardContent)

      // 根据 appendOnPaste 状态决定是覆盖还是追加
      const newContent = appendOnPaste
        ? clipboardContent + pastedText
        : pastedText

      // 手动更新 state，让用户能立刻看到粘贴的内容
      setClipboardContent(newContent)

      // 立即使用我们刚生成的新内容执行同步
      await syncContent(newContent, true)
    }
  }

  const syncContent = async (content: string, closeAfter = false) => {
    if (!remotePath.trim())
      return showDialog({
        title: 'Error',
        message: 'Remote file path is not configured.',
      })
    if (!content.trim())
      return showDialog({ title: 'Error', message: 'Content is empty.' })

    setSyncStatus('Syncing...')
    try {
      await UpdateRemoteFileFromClipboard(
        config.id,
        remotePath,
        content,
        syncAsHTML
      )
      setSyncStatus('Success!')
      if (closeAfter && closeOnSuccess) {
        setTimeout(() => setIsModalOpen(false), 1000)
      }
    } catch (error) {
      setSyncStatus(`Error: ${String(error)}`)
    }
  }

  // 创建一个辅助函数来动态计算颜色类
  const getStatusColorClass = useMemo(() => {
    if (syncStatus.startsWith('Error')) {
      return 'text-red-500' // 失败时为红色
    }
    if (syncStatus === 'Success!') {
      return 'text-green-500' // 成功时为绿色
    }
    if (syncStatus === 'Syncing...') {
      return 'text-blue-500' // 进行中时为蓝色
    }
    return 'text-muted-foreground' // 默认使用柔和的前景色
  }, [syncStatus]) // 仅当 syncStatus 变化时才重新计算

  // --- JSX 渲染 ---
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Clipboard to Remote File</CardTitle>
          <CardDescription>
            Sync clipboard content to a specified remote file.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-xs text-muted-foreground">
              Remote File Path
            </Label>
            {isEditingPath ? (
              <div className="flex items-center space-x-2">
                <Input
                  value={remotePath}
                  onChange={(e) => setRemotePath(e.target.value)}
                  placeholder="/home/user/notes.txt"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                />
                <Button onClick={cancelEdit} variant="ghost">
                  Cancel
                </Button>
                <Button onClick={() => void handleSaveChanges()}>Save</Button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <p className="p-2 font-mono text-sm truncate">
                  {remotePath || 'Not set'}
                </p>
                <Button
                  onClick={() => setIsEditingPath(true)}
                  variant="outline"
                  size="sm"
                >
                  Edit
                </Button>
              </div>
            )}
          </div>
          <div className="border-t pt-4">
            <Button
              onClick={openEditorModal}
              disabled={!remotePath || isEditingPath}
            >
              Open Editor & Sync
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 剪贴板编辑和同步的模态框 */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[70vw] h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              Sync to:{' '}
              <span className="font-mono text-primary">{remotePath}</span>
            </DialogTitle>
            <DialogDescription>sync text to remote file</DialogDescription>
          </DialogHeader>
          <div className="flex-grow flex flex-col gap-4 py-4 overflow-y-auto">
            <Textarea
              onPaste={(event) => void handleNativePaste(event)}
              value={clipboardContent}
              //每一次键盘输入都会触发 onChange，并调用 setClipboardContent来更新我们的 state，从而让输入框能够正常编辑。
              onChange={(event) => setClipboardContent(event.target.value)}
              placeholder="Press Ctrl+V (or ⌘+V) to paste..."
              className="flex-grow w-full font-mono text-sm resize-none"
            />
            <div className="space-y-2 text-sm flex-shrink-0">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="sync-html"
                  checked={syncAsHTML}
                  onCheckedChange={(checked) => setSyncAsHTML(Boolean(checked))}
                />
                <Label htmlFor="sync-html">Sync as viewable HTML</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="auto-sync"
                  checked={autoSyncOnPaste}
                  onCheckedChange={(checked) =>
                    setAutoSyncOnPaste(Boolean(checked))
                  }
                />
                <Label htmlFor="auto-sync">Auto-sync on paste</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="close-success"
                  checked={closeOnSuccess}
                  onCheckedChange={(checked) =>
                    setCloseOnSuccess(Boolean(checked))
                  }
                />
                <Label htmlFor="close-success">
                  Close modal on successful sync
                </Label>
              </div>
              {/* 粘贴模式选项 */}
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="append-paste"
                  checked={appendOnPaste}
                  onCheckedChange={(checked) =>
                    setAppendOnPaste(Boolean(checked))
                  }
                />
                <Label htmlFor="append-paste">
                  Append to existing content instead of replacing
                </Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <div className="flex items-center w-full justify-between gap-x-4">
              {/* `flex-1` 和 `min-w-0` 是关键，它告诉这个容器可以伸缩，并且最小宽度可以是0 */}
              <div className="flex-1 min-w-0">
                <TooltipProvider delayDuration={100}>
                  <Tooltip>
                    {/* <TooltipTrigger className="flex-1 min-w-0"> */}
                    {/* truncate 样式依赖父容器有合适的宽度限制，文本超出时才会截断。但由于 TooltipTrigger 渲染了额外的包裹元素，
                    <p> 标签的父容器是这个包裹元素，而非具有 flex-1 min-w-0 样式的外层 <div>。
                    这个包裹元素可能没有正确设置宽度限制，导致 truncate 样式无法正常生效。 */}
                    {/*
                    <div class="flex-1 min-w-0">
                      <div> <!-- TooltipTrigger 渲染的包裹元素 -->
                        <p class="text-sm font-medium truncate text-left text-green-500">
                          Success!
                        </p>
                      </div>
                    </div> 
                    */}
                    {/* 上面的不起作用，下面的asChild起作用 */}
                    {/* 当使用 asChild prop 时，TooltipTrigger 不会渲染额外的包裹元素，而是直接将工具提示的触发逻辑附加到其子元素（即 <p> 标签）上。
                    此时 DOM 结构如下： */}
                    {/* 
                    <div class="flex-1 min-w-0">
                      <p class="text-sm font-medium truncate text-left text-green-500">
                        Success!
                      </p>
                    </div> 
                    */}
                    <TooltipTrigger asChild>
                      {/* `truncate` 会在父容器宽度受限时生效 */}
                      <p
                        className={`text-sm font-medium truncate text-left ${getStatusColorClass}`}
                      >
                        {syncStatus}
                      </p>
                    </TooltipTrigger>
                    <TooltipContent>
                      {/* `break-words` 会强制长文本换行 */}
                      <p className="max-w-md break-words whitespace-normal">
                        {syncStatus}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              {/* 右侧区域：按钮组 */}
              {/* `flex-shrink-0` 确保按钮组不会被压缩 */}
              <div className="flex items-center space-x-3 flex-shrink-0">
                <Button onClick={() => setIsModalOpen(false)} variant="outline">
                  Cancel
                </Button>
                <Button
                  onClick={() => void syncContent(clipboardContent, true)}
                >
                  Sync to Remote
                </Button>
              </div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default ClipboardTool

// <TooltipProvider>: 团队的“经理”
// 职责: 管理其内部所有工具提示的全局行为。它最重要的工作就是通过 delayDuration 属性来统一管理“延迟时间”。

// 为什么需要它？: 如果没有 TooltipProvider，每个 <Tooltip> 都会有自己独立的、默认的延迟。TooltipProvider 就像一个总开关，它确保了您应用中的所有提示框都有统一的、响应灵敏的出现时机，而不会在用户鼠标快速划过时烦人地闪烁。

// 我们的用法: <TooltipProvider :delay-duration="100"> 的意思是：“嘿，我管辖范围内的所有工具提示，请在鼠标悬浮100毫秒后就出现。”

// <Tooltip>: 单个任务的“文件夹”
// 职责: 作为一个容器，它将一个“触发器”和它对应的“提示内容”组合在一起。它本身不做太多事，但它是建立两者之间关联所必需的。

// <TooltipTrigger>: 任务的“启动按钮”或“热点区域”
// 职责: 包裹住那个您希望用户去悬停的UI元素（比如我们那个被截断的文本 <p>）。

// 工作原理: 它是一个特殊的组件，会自动为其内部的子元素添加所有必要的鼠标事件监听器（onMouseEnter, onMouseLeave, onFocus 等）。当用户与这个区域交互时，它会通知“经理” (TooltipProvider)：“嘿，有人在我身上悬停了，准备显示提示内容！”

// <TooltipContent>: 任务的“详细说明”或“提示气泡”
// 职责: 这就是那个实际弹出来的、带有精美样式的提示框。

// 工作原理: 它会监听来自“经理”的指令。当“经理”说“显示”时，它就会以动画的形式出现在“启动按钮” (TooltipTrigger) 的旁边。shadcn 已经为它内置了所有复杂的定位逻辑和样式。我们只需要把我们想要显示的完整内容（syncStatus）放在它里面即可。
