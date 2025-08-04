import { useEffect, useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { IntegratedTerminal } from '@/components/sshgate/IntegratedTerminal'
import type { TerminalSession } from '@/App'
import { Button } from '@/components/ui/button'
import { XIcon } from 'lucide-react'

interface TerminalViewProps {
  terminalSessions: TerminalSession[]
  onCloseTerminal: (sessionId: string) => void
  isActive: boolean
}

export function TerminalView({
  terminalSessions,
  onCloseTerminal,
  isActive,
}: TerminalViewProps) {
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(
    terminalSessions.length > 0 ? terminalSessions[0].id : null
  )

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
  }, [terminalSessions, isActive, activeTerminalId]) // 依赖项现在更精确

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
          >
            {session.alias}
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-5 w-5"
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
      {terminalSessions.map((session) => (
        <TabsContent key={session.id} value={session.id} className="flex-grow">
          <IntegratedTerminal websocketUrl={session.url} />
        </TabsContent>
      ))}
    </Tabs>
  )
}
