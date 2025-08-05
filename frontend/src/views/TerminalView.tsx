import { useEffect, useRef, useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { IntegratedTerminal } from '@/components/sshgate/IntegratedTerminal'
import type { TerminalSession } from '@/App'
import { Button } from '@/components/ui/button'
import { XIcon } from 'lucide-react'

interface TerminalViewProps {
  terminalSessions: TerminalSession[]
  onCloseTerminal: (sessionId: string) => void
  onRenameTerminal: (sessionId: string, newName: string) => void
  currentTerminalId: string | null
  isActive: boolean
}

export function TerminalView({
  terminalSessions,
  onCloseTerminal,
  onRenameTerminal,
  isActive,
  currentTerminalId,
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

  if (terminalSessions.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p>No active terminal sessions. Open one from the SSH Gate.</p>
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
      <TabsList className="flex-shrink-0 m-2">
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
      <div className="flex-grow relative mt-2">
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
