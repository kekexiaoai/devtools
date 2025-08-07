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
  currentTerminalId: string | null
  onOpenTerminal: (session: TerminalSession) => void
  isActive: boolean
}

export function TerminalView({
  terminalSessions,
  onCloseTerminal,
  onRenameTerminal,
  isActive,
  currentTerminalId,
  onOpenTerminal,
}: TerminalViewProps) {
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(
    terminalSessions.length > 0 ? terminalSessions[0].id : null
  )

  // 新增 state，用于追踪哪个 Tab 正在被编辑
  const [editingTabId, setEditingTabId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setActiveTerminalId(currentTerminalId)
  }, [currentTerminalId])
  // 当会话列表变化时，确保 activeTerminalId 仍然有效
  useEffect(() => {
    // 这个 effect 只在“会话列表”或“组件可见性”发生变化时运行

    // 如果当前视图不可见，则不执行任何操作
    if (!isActive) return

    // 检查当前选中的 Tab 是否还存在
    const activeTabExists = terminalSessions.some(
      (s) => s.id === activeTerminalId
    )

    if (terminalSessions.length > 0 && !activeTabExists) {
      // 如果会话列表不为空，但当前选中的 Tab 已不存在（比如被关闭了），
      // 则自动切换到最后一个 Tab。
      setActiveTerminalId(terminalSessions[terminalSessions.length - 1].id)
    } else if (terminalSessions.length === 0) {
      // 如果会话列表为空，则清空选中状态
      setActiveTerminalId(null)
    }
  }, [terminalSessions, isActive, activeTerminalId, currentTerminalId])

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
      // 为新会话生成唯一的显示名称
      const baseName = sessionInfo.alias
      let displayName = baseName
      let counter = 1
      while (terminalSessions.some((s) => s.displayName === displayName)) {
        counter++
        displayName = `${baseName} (${counter})`
      }
      onOpenTerminal({
        ...sessionInfo,
        displayName: displayName,
      })
    } catch (error) {
      await showDialog({
        type: 'error',
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
      onValueChange={setActiveTerminalId}
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
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-5 w-5 rounded-full"
                onClick={(e) => {
                  e.stopPropagation()
                  onCloseTerminal(session.id)
                }}
              >
                <XIcon className="h-3 w-3" />
              </Button>
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
              className={`h-full w-full ${activeTerminalId === session.id ? 'block' : 'hidden'}`}
            >
              <IntegratedTerminal
                websocketUrl={session.url}
                isVisible={activeTerminalId === session.id}
              />
            </div>
          </TabsContent>
        ))}
      </div>
    </Tabs>
  )
}
