import { describe, expect, it } from 'vitest'
import { sshtunnel } from '@wailsjs/go/models'
import {
  buildTunnelFailureDiagnostics,
  diagnoseTunnelStartFailure,
} from './tunnel-start-diagnostics'
import type { TunnelPortConflict } from './tunnel-port-conflicts'

function makeTunnel(
  overrides: Partial<sshtunnel.SavedTunnelConfig> = {}
): sshtunnel.SavedTunnelConfig {
  return {
    id: 'db',
    name: 'Database',
    tunnelType: 'local',
    localPort: 5432,
    gatewayPorts: false,
    remoteHost: 'localhost',
    remotePort: 5432,
    hostSource: 'ssh_config',
    hostAlias: 'bastion',
    ...overrides,
  } as sshtunnel.SavedTunnelConfig
}

describe('diagnoseTunnelStartFailure', () => {
  it('prioritizes current local port conflicts', () => {
    const conflicts: TunnelPortConflict[] = [
      {
        kind: 'listening',
        port: 5432,
        address: '127.0.0.1',
        process: 'postgres',
        pid: '42',
      },
    ]

    const diagnosis = diagnoseTunnelStartFailure({
      tunnel: makeTunnel(),
      error: new Error('the local port is already in use'),
      portConflicts: conflicts,
    })

    expect(diagnosis.reason).toBe('Local port conflict')
    expect(diagnosis.details).toContain('postgres')
    expect(diagnosis.suggestions).toContain(
      'Stop the process using this port or change the tunnel local port.'
    )
  })

  it('detects authentication failures', () => {
    const diagnosis = diagnoseTunnelStartFailure({
      tunnel: makeTunnel(),
      error: new Error(
        "authentication failed for 'bastion', please check your password or SSH key"
      ),
      portConflicts: [],
    })

    expect(diagnosis.reason).toBe('SSH authentication failed')
    expect(diagnosis.suggestions).toContain(
      'Verify the password, SSH key, agent, and ssh_config entry for bastion.'
    )
  })

  it('detects SSH endpoint connectivity failures', () => {
    const diagnosis = diagnoseTunnelStartFailure({
      tunnel: makeTunnel({ hostAlias: 'prod-bastion' }),
      error: new Error(
        "connection refused by 'prod-bastion', check the server's IP/port and firewall"
      ),
      portConflicts: [],
    })

    expect(diagnosis.reason).toBe('SSH host is unreachable')
    expect(diagnosis.suggestions).toContain(
      'Check that prod-bastion is reachable and accepting SSH connections.'
    )
  })

  it('falls back to a generic diagnosis with tunnel context', () => {
    const diagnosis = diagnoseTunnelStartFailure({
      tunnel: makeTunnel({ tunnelType: 'dynamic', remoteHost: undefined }),
      error: new Error('unexpected EOF'),
      portConflicts: [],
    })

    expect(diagnosis.reason).toBe('Tunnel startup failed')
    expect(diagnosis.details).toBe('unexpected EOF')
    expect(diagnosis.suggestions).toContain(
      'Open Diagnostics and review the recent application log for this startup attempt.'
    )
  })
})

describe('buildTunnelFailureDiagnostics', () => {
  it('builds diagnostics for saved tunnels with startup errors', () => {
    const tunnel = makeTunnel({ id: 'db', name: 'Database' })
    const entries = buildTunnelFailureDiagnostics({
      savedTunnels: [tunnel],
      tunnelErrors: new Map([
        ['db', new Error('the local port is already in use')],
        ['missing', new Error('ignored')],
      ]),
      portConflicts: new Map([
        [
          'db',
          [
            {
              kind: 'listening',
              port: 5432,
              address: '127.0.0.1',
              process: 'postgres',
              pid: '42',
            },
          ],
        ],
      ]),
    })

    expect(entries).toHaveLength(1)
    expect(entries[0].tunnelId).toBe('db')
    expect(entries[0].tunnelName).toBe('Database')
    expect(entries[0].diagnosis.reason).toBe('Local port conflict')
  })
})
