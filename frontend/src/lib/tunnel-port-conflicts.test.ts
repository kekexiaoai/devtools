import { describe, expect, it } from 'vitest'
import { backend, sshtunnel } from '@wailsjs/go/models'
import {
  formatTunnelPortConflictSummary,
  formatTunnelPortConflict,
  getTunnelPortConflictMap,
} from './tunnel-port-conflicts'

function makeTunnel(
  id: string,
  localPort: number,
  overrides: Partial<sshtunnel.SavedTunnelConfig> = {}
): sshtunnel.SavedTunnelConfig {
  return {
    id,
    name: `Tunnel ${id}`,
    tunnelType: 'local',
    localPort,
    gatewayPorts: false,
    remoteHost: 'localhost',
    remotePort: 80,
    hostSource: 'ssh_config',
    hostAlias: 'server',
    ...overrides,
  } as sshtunnel.SavedTunnelConfig
}

function makeActiveTunnel(configId: string): sshtunnel.ActiveTunnelInfo {
  return {
    id: `runtime-${configId}`,
    configId,
    status: 'active',
  } as sshtunnel.ActiveTunnelInfo
}

function makeListeningPort(
  port: string,
  address = '127.0.0.1'
): backend.ListeningPort {
  return {
    command: 'postgres',
    pid: '42',
    address,
    port,
    protocol: 'tcp',
  }
}

describe('getTunnelPortConflictMap', () => {
  it('reports an external listener on the same local port', () => {
    const conflicts = getTunnelPortConflictMap(
      [makeTunnel('db', 5432)],
      [],
      [makeListeningPort('5432')]
    )

    expect(conflicts.get('db')).toEqual([
      expect.objectContaining({
        kind: 'listening',
        port: 5432,
        process: 'postgres',
        pid: '42',
      }),
    ])
  })

  it('does not report the listener for an already active tunnel', () => {
    const conflicts = getTunnelPortConflictMap(
      [makeTunnel('db', 5432)],
      [makeActiveTunnel('db')],
      [makeListeningPort('5432')]
    )

    expect(conflicts.has('db')).toBe(false)
  })

  it('reports duplicate local ports across saved tunnels', () => {
    const conflicts = getTunnelPortConflictMap(
      [makeTunnel('api', 8080), makeTunnel('admin', 8080)],
      [],
      []
    )

    expect(conflicts.get('api')).toEqual([
      expect.objectContaining({
        kind: 'duplicate',
        port: 8080,
        peerName: 'Tunnel admin',
      }),
    ])
    expect(conflicts.get('admin')).toEqual([
      expect.objectContaining({
        kind: 'duplicate',
        port: 8080,
        peerName: 'Tunnel api',
      }),
    ])
  })

  it('treats a wildcard listener as conflicting with a loopback tunnel', () => {
    const conflicts = getTunnelPortConflictMap(
      [makeTunnel('web', 3000)],
      [],
      [makeListeningPort('3000', '*')]
    )

    expect(conflicts.has('web')).toBe(true)
  })

  it('formats conflict messages for UI and confirmations', () => {
    expect(
      formatTunnelPortConflict({
        kind: 'duplicate',
        port: 8080,
        peerId: 'admin',
        peerName: 'Admin',
      })
    ).toBe('Local port 8080 is also used by "Admin".')

    expect(
      formatTunnelPortConflict({
        kind: 'listening',
        port: 5432,
        address: '127.0.0.1',
        process: 'postgres',
        pid: '42',
      })
    ).toBe('Local port 5432 is already used by postgres (PID 42) on 127.0.0.1.')
  })

  it('formats grouped conflict summaries for profile startup', () => {
    expect(
      formatTunnelPortConflictSummary([
        {
          tunnelName: 'Database',
          conflicts: [
            {
              kind: 'listening',
              port: 5432,
              address: '127.0.0.1',
              process: 'postgres',
              pid: '42',
            },
          ],
        },
        {
          tunnelName: 'Admin',
          conflicts: [
            {
              kind: 'duplicate',
              port: 8080,
              peerId: 'api',
              peerName: 'API',
            },
          ],
        },
      ])
    ).toBe(
      [
        'Database:',
        '- Local port 5432 is already used by postgres (PID 42) on 127.0.0.1.',
        'Admin:',
        '- Local port 8080 is also used by "API".',
      ].join('\n')
    )
  })
})
