import { describe, expect, it } from 'vitest'
import {
  getAutoRestorableTerminalSessions,
  parseRestorableTerminalSessions,
  serializeRestorableTerminalSessions,
} from './terminal-session-restore'
import type { TerminalSession } from '@/App'

describe('terminal session restore', () => {
  it('serializes only restorable terminal metadata', () => {
    const sessions = [
      {
        id: 'local-1',
        alias: 'local',
        type: 'local',
        displayName: 'local',
        status: 'connected',
        url: 'ws://localhost/ws/terminal/local-1',
      },
    ] as TerminalSession[]

    expect(serializeRestorableTerminalSessions(sessions)).toBe(
      '[{"id":"local-1","alias":"local","type":"local","displayName":"local"}]'
    )
  })

  it('ignores invalid stored sessions', () => {
    const sessions = parseRestorableTerminalSessions(
      JSON.stringify([
        { id: 'local-1', alias: 'local', type: 'local', displayName: 'local' },
        { id: '', alias: 'bad', type: 'local', displayName: 'bad' },
        { id: 'remote-1', alias: 'prod', type: 'remote', displayName: 'prod' },
      ])
    )

    expect(sessions.map((session) => session.id)).toEqual([
      'local-1',
      'remote-1',
    ])
  })

  it('auto restores local sessions only', () => {
    const sessions = parseRestorableTerminalSessions(
      JSON.stringify([
        { id: 'local-1', alias: 'local', type: 'local', displayName: 'local' },
        { id: 'remote-1', alias: 'prod', type: 'remote', displayName: 'prod' },
      ])
    )

    expect(
      getAutoRestorableTerminalSessions(sessions).map((session) => session.id)
    ).toEqual(['local-1'])
  })
})
