import type { TerminalSession } from '@/App'

export const terminalSessionRestoreKey = 'devtools-terminal-sessions'

export interface RestorableTerminalSession {
  id: string
  alias: string
  type: 'local' | 'remote'
  displayName: string
}

export function serializeRestorableTerminalSessions(
  sessions: TerminalSession[]
): string {
  return JSON.stringify(
    sessions.map<RestorableTerminalSession>((session) => ({
      id: session.id,
      alias: session.alias,
      type: session.type as 'local' | 'remote',
      displayName: session.displayName,
    }))
  )
}

export function parseRestorableTerminalSessions(
  value: string | null
): RestorableTerminalSession[] {
  if (!value) return []

  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) return []

    return parsed.filter(isRestorableTerminalSession)
  } catch {
    return []
  }
}

export function getAutoRestorableTerminalSessions(
  sessions: RestorableTerminalSession[]
): RestorableTerminalSession[] {
  return sessions.filter((session) => session.type === 'local')
}

function isRestorableTerminalSession(
  value: unknown
): value is RestorableTerminalSession {
  if (!value || typeof value !== 'object') return false
  const session = value as RestorableTerminalSession
  return (
    typeof session.id === 'string' &&
    session.id.length > 0 &&
    typeof session.alias === 'string' &&
    (session.type === 'local' || session.type === 'remote') &&
    typeof session.displayName === 'string' &&
    session.displayName.length > 0
  )
}
