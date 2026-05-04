import { describe, expect, it } from 'vitest'
import {
  addTunnelFailureHistoryEntry,
  type TunnelFailureHistoryEntry,
} from './tunnel-failure-history'

function makeEntry(id: string): TunnelFailureHistoryEntry {
  return {
    id,
    tunnelId: `tunnel-${id}`,
    tunnelName: `Tunnel ${id}`,
    failedAt: `2026-05-04T00:00:${id.padStart(2, '0')}Z`,
    errorMessage: 'failed',
    reason: 'Tunnel startup failed',
    details: 'failed',
    suggestions: ['Check diagnostics.'],
  }
}

describe('addTunnelFailureHistoryEntry', () => {
  it('prepends new entries', () => {
    const next = addTunnelFailureHistoryEntry([makeEntry('1')], makeEntry('2'))

    expect(next.map((entry) => entry.id)).toEqual(['2', '1'])
  })

  it('keeps only the newest configured number of entries', () => {
    const current = [makeEntry('1'), makeEntry('2')]
    const next = addTunnelFailureHistoryEntry(current, makeEntry('3'), 2)

    expect(next.map((entry) => entry.id)).toEqual(['3', '1'])
  })
})
