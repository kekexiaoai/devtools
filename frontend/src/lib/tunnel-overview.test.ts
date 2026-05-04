import { describe, expect, it } from 'vitest'
import { sshgate, sshtunnel } from '@wailsjs/go/models'
import { buildTunnelOverview } from './tunnel-overview'
import type { TunnelPortConflict } from './tunnel-port-conflicts'

function makeSavedTunnel(
  id: string,
  name: string
): sshtunnel.SavedTunnelConfig {
  return {
    id,
    name,
    tunnelType: 'local',
    localPort: 1000,
    gatewayPorts: false,
    remoteHost: '127.0.0.1',
    remotePort: 80,
    hostSource: 'ssh_config',
    hostAlias: 'server',
  } as sshtunnel.SavedTunnelConfig
}

function makeActiveTunnel(
  configId: string,
  status: sshtunnel.ActiveTunnelInfo['status']
): sshtunnel.ActiveTunnelInfo {
  return {
    id: `runtime-${configId}`,
    configId,
    status,
  } as sshtunnel.ActiveTunnelInfo
}

describe('buildTunnelOverview', () => {
  it('summarizes tunnel runtime, conflicts, and recent event levels', () => {
    const conflicts = new Map<string, TunnelPortConflict[]>([
      [
        'redis',
        [
          {
            kind: 'duplicate',
            port: 6379,
            peerId: 'other',
            peerName: 'Other',
          },
        ],
      ],
    ])

    const overview = buildTunnelOverview({
      savedTunnels: [
        makeSavedTunnel('db', 'Database'),
        makeSavedTunnel('redis', 'Redis'),
        makeSavedTunnel('api', 'API'),
      ],
      activeTunnels: [
        makeActiveTunnel('db', 'active'),
        makeActiveTunnel('api', 'disconnected'),
      ],
      portConflicts: conflicts,
      events: [
        {
          level: 'ERROR',
          message: 'api disconnected',
        },
        {
          level: 'WARN',
          message: 'redis conflict',
        },
        {
          level: 'SUCCESS',
          message: 'db started',
        },
      ] as sshgate.TunnelEventFeedItem[],
    })

    expect(overview.stats).toMatchObject({
      total: 3,
      running: 1,
      disconnected: 1,
      stopping: 0,
      stopped: 1,
      conflictTunnels: 1,
      errorEvents: 1,
      warningEvents: 1,
    })
    expect(overview.healthTone).toBe('error')
    expect(overview.recentEvents).toHaveLength(3)
  })
})
