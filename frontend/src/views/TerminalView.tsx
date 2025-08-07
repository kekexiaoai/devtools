import { useEffect, useRef, useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { IntegratedTerminal } from '@/components/sshgate/IntegratedTerminal'
import type { TerminalSession } from '@/App'
import { Button } from '@/components/ui/button'
import { Plus, XIcon } from 'lucide-react'
import { useDialog } from '@/hooks/useDialog'
import { StartLocalSession as StartLocalTerminalSession } from '@wailsjs/go/terminal/Service'

interface TerminalViewProps {
  terminalSessions: TerminalSession[]
  onCloseTerminal: (sessionId: string) => void
  onRenameTerminal: (sessionId: string, newName: string) => void
  onOpenTerminal: (session: TerminalSession) => void // 这是 addTerminalSession
  activeTerminalId: string | null
  onActiveTerminalChange: (sessionId: string | null) => void // 这是 setActiveTerminalId
  isActive: boolean
}
export function TerminalView({
  terminalSessions,
  onCloseTerminal,
  onRenameTerminal,
  onOpenTerminal,
  activeTerminalId,
  onActiveTerminalChange,
  isActive,
}: TerminalViewProps) {
  // 新增 state，用于追踪哪个 Tab 正在被编辑
  const [editingTabId, setEditingTabId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingTabId && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editingTabId])

  const handleStartRename = (session: TerminalSession) => {
    setEditingTabId(session.id)
    setRenameValue(session.displayName)
  }

  const handleCommitRename = (sessionId: string) => {
    if (renameValue.trim()) {
      onRenameTerminal(sessionId, renameValue.trim())
    }
    setEditingTabId(null)
  }

  const { showDialog } = useDialog()

  const handleOpenLocalTerminal = async () => {
    try {
      const sessionInfo = await StartLocalTerminalSession()
      const baseName = sessionInfo.alias
      let displayName = baseName
      let counter = 1
      while (terminalSessions.some((s) => s.displayName === displayName)) {
        counter++
        displayName = `${baseName} (${counter})`
      }
      onOpenTerminal({ ...sessionInfo, displayName })
    } catch (error) {
      await showDialog({
        title: 'Error',
        message: `Failed to start local terminal: ${String(error)}`,
      })
    }
  }

  // 如果没有活动的终端会话，我们显示一个欢迎界面，并提供“新建”按钮
  if (terminalSessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <p className="mb-4">No active terminal sessions.</p>
        <Button onClick={() => void handleOpenLocalTerminal()}>
          <Plus className="mr-2 h-4 w-4" /> New Local Terminal
        </Button>
      </div>
    )
  }

  return (
    <Tabs
      // 当 activeTerminalId 为 null 时，不设置 value，
      // 让 Tabs 组件自己处理默认状态，避免不必要的重渲染
      value={activeTerminalId ?? undefined}
      onValueChange={onActiveTerminalChange}
      className="h-full flex flex-col"
    >
      <div className="flex items-center pl-2 pr-2">
        {/* 标签列表 - 添加横向滚动和 flex-shrink: 1 */}
        <TabsList className="flex-shrink-1 overflow-x-auto m-0 mr-2">
          {terminalSessions.map((session) => (
            <TabsTrigger
              key={session.id}
              value={session.id}
              className="relative pr-8"
              onDoubleClick={() => handleStartRename(session)}
            >
              {editingTabId === session.id ? (
                <input
                  ref={inputRef}
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={() => handleCommitRename(session.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCommitRename(session.id)
                    if (e.key === 'Escape') setEditingTabId(null)
                  }}
                  className="bg-transparent outline-none ring-0"
                />
              ) : (
                session.displayName
              )}
              <span
                role="button"
                aria-label="Close Tab"
                tabIndex={0}
                className="absolute right-1 top-1/2 -translate-y-1/2 h-5 w-5 rounded-full flex items-center justify-center hover:bg-muted"
                onClick={(e) => {
                  e.stopPropagation()
                  onCloseTerminal(session.id)
                }}
                onKeyDown={(e) => {
                  // 优化：让它也能响应空格键
                  if (e.key === ' ' || e.key === 'Enter') {
                    e.preventDefault()
                    e.stopPropagation()
                    onCloseTerminal(session.id)
                  }
                }}
              >
                <XIcon className="h-3 w-3" />
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
        {/* 在 Tab 列表旁边，始终显示“新建”按钮 */}
        {/* 新建按钮 - 使用 ml-auto 固定在右侧 */}
        <Button
          onClick={() => void handleOpenLocalTerminal()}
          variant="ghost"
          size="icon"
          className="ml-auto flex-shrink-0"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-grow relative ml-1 mr-1 mb-2">
        {terminalSessions.map((session) => (
          // 添加 forceMount 属性！
          // 这会强制 shadcn/ui 始终渲染所有的 Tab 内容，
          // 只是用 CSS 隐藏非激活的，而不是销毁它们。
          <TabsContent
            key={session.id}
            value={session.id}
            forceMount
            className="absolute inset-0 h-full w-full"
          >
            <div
              // 避免 display: none，改为 visibility: hidden 或 absolute + hidden
              // 有时 xterm 渲染容器不能完全隐藏
              // display: none 会让 clientWidth 为 0，导致 fit() 计算出错。
              // className={`h-full w-full ${activeTerminalId === session.id ? 'block' : 'hidden'}`}
              className={`h-full w-full ${activeTerminalId === session.id ? 'relative visible' : 'absolute invisible pointer-events-none'}`}
            >
              <IntegratedTerminal
                websocketUrl={session.url}
                id={session.id}
                displayName={session.displayName}
                isVisible={isActive && activeTerminalId === session.id}
              />
            </div>
          </TabsContent>
        ))}
      </div>
    </Tabs>
  )
}

// debug 日志 1
// 使用 className={`h-full w-full ${activeTerminalId === session.id ? 'block' : 'hidden'}`}

// 第一次点击按钮，新增了 tab 'local'
// IntegratedTerminal.tsx:30 [useEffect]isVisible, id: e1e1362f-20ec-4e19-8e86-ed40cc414296, displayName: local, visible: true
// IntegratedTerminal.tsx:30 [useEffect]isVisible, id: e1e1362f-20ec-4e19-8e86-ed40cc414296, displayName: local, visible: true
// IntegratedTerminal.tsx:96 [ResizeObserver]FitAddon resize, id: e1e1362f-20ec-4e19-8e86-ed40cc414296, displayName: local, visible: true, rows: 45, cols: 138
// IntegratedTerminal.tsx:126 [useEffect]FitAddon resize, id: e1e1362f-20ec-4e19-8e86-ed40cc414296, displayName: local, visible: true, rows: 45, cols: 138
// IntegratedTerminal.tsx:50 Terminal WebSocket connected.

// 第二次点击按钮，新增了 tab 'local(2)'
// 可以看到，在 className={`h-full w-full ${activeTerminalId === session.id ? 'block' : 'hidden'}`}，
// 会触发 'local' 这个 tab fit，变为  rows: 6, cols: 11，因为 xterm 并没有完全隐藏 ResizeObserver 观察到了变化 所以会触发 fitAddon.fit()，此时 visible 是 ture？，证明 xterm 是可见的？
// IntegratedTerminal.tsx:30 [useEffect]isVisible, id: e1e1362f-20ec-4e19-8e86-ed40cc414296, displayName: local, visible: false
// IntegratedTerminal.tsx:30 [useEffect]isVisible, id: 2d04cce5-87be-4238-9d4f-d023ea6d4528, displayName: local (2), visible: true
// IntegratedTerminal.tsx:30 [useEffect]isVisible, id: 2d04cce5-87be-4238-9d4f-d023ea6d4528, displayName: local (2), visible: true
// IntegratedTerminal.tsx:96 [ResizeObserver]FitAddon resize, id: e1e1362f-20ec-4e19-8e86-ed40cc414296, displayName: local, visible: true, rows: 6, cols: 11
// IntegratedTerminal.tsx:96 [ResizeObserver]FitAddon resize, id: 2d04cce5-87be-4238-9d4f-d023ea6d4528, displayName: local (2), visible: true, rows: 45, cols: 138
// IntegratedTerminal.tsx:50 Terminal WebSocket connected.
// IntegratedTerminal.tsx:126 [useEffect]FitAddon resize, id: 2d04cce5-87be-4238-9d4f-d023ea6d4528, displayName: local (2), visible: true, rows: 45, cols: 138

// debug 日志 2
// 使用 className={`h-full w-full ${activeTerminalId === session.id ? 'block' : 'absolute invisible'}`}

// 第一次点击按钮，新增了 tab 'local'
// IntegratedTerminal.tsx:30 [useEffect]isVisible, id: 90ec7ad7-c0f5-41eb-8290-36d481d9ccc1, displayName: local, visible: true
// IntegratedTerminal.tsx:30 [useEffect]isVisible, id: 90ec7ad7-c0f5-41eb-8290-36d481d9ccc1, displayName: local, visible: true
// IntegratedTerminal.tsx:96 [ResizeObserver]FitAddon resize, id: 90ec7ad7-c0f5-41eb-8290-36d481d9ccc1, displayName: local, visible: true, rows: 45, cols: 138
// IntegratedTerminal.tsx:50 Terminal WebSocket connected.
// IntegratedTerminal.tsx:126 [useEffect]FitAddon resize, id: 90ec7ad7-c0f5-41eb-8290-36d481d9ccc1, displayName: local, visible: true, rows: 45, cols: 138

// 第二次点击按钮，新增了 tab 'local(2)'
// 对比使用 hidden 的日志情况，明显观察到缺少了 IntegratedTerminal.tsx:96 [ResizeObserver]FitAddon resize, id: e1e1362f-20ec-4e19-8e86-ed40cc414296, displayName: local, visible: true, rows: 6, cols: 11
// 可以证明 使用 absolute invisible 完全隐藏了 xterm, 可以避免 fitAddon.fit() 触发
// IntegratedTerminal.tsx:30 [useEffect]isVisible, id: 90ec7ad7-c0f5-41eb-8290-36d481d9ccc1, displayName: local, visible: false
// IntegratedTerminal.tsx:30 [useEffect]isVisible, id: 9346eb92-1cd1-4157-9d70-8a190ab85fb3, displayName: local (2), visible: true
// IntegratedTerminal.tsx:30 [useEffect]isVisible, id: 9346eb92-1cd1-4157-9d70-8a190ab85fb3, displayName: local (2), visible: true
// IntegratedTerminal.tsx:96 [ResizeObserver]FitAddon resize, id: 9346eb92-1cd1-4157-9d70-8a190ab85fb3, displayName: local (2), visible: true, rows: 45, cols: 138
// IntegratedTerminal.tsx:50 Terminal WebSocket connected.
// IntegratedTerminal.tsx:126 [useEffect]FitAddon resize, id: 9346eb92-1cd1-4157-9d70-8a190ab85fb3, displayName: local (2), visible: true, rows: 45, cols: 138
