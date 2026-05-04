import { describe, expect, it } from 'vitest'
import { backend, sshtunnel } from '@wailsjs/go/models'
import { getTunnelPortConflictMap } from './tunnel-port-conflicts'

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
})
