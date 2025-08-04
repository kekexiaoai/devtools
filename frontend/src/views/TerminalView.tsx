import { useEffect, useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { IntegratedTerminal } from '@/components/sshgate/IntegratedTerminal'
import type { TerminalSession } from '@/App'
import { Button } from '@/components/ui/button'
import { XIcon } from 'lucide-react'

interface TerminalViewProps {
  terminalSessions: TerminalSession[]
  onCloseTerminal: (sessionId: string) => void
}

export function TerminalView({
  terminalSessions,
  onCloseTerminal,
}: TerminalViewProps) {
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(
    terminalSessions.length > 0 ? terminalSessions[0].id : null
  )

  // 当会话列表变化时，确保 activeTerminalId 仍然有效
  useEffect(() => {
    if (
      terminalSessions.length > 0 &&
      !terminalSessions.some((s) => s.id === activeTerminalId)
    ) {
      setActiveTerminalId(terminalSessions[terminalSessions.length - 1].id)
    } else {
      setActiveTerminalId(null)
    }
  }, [terminalSessions, activeTerminalId])

  if (terminalSessions.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p>No active terminal sessions. Open one from the SSH Gate.</p>
      </div>
    )
  }

  return (
    <Tabs
      value={activeTerminalId ?? ''}
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
