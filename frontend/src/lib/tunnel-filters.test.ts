import { describe, expect, it } from 'vitest'
import { sshtunnel } from '@wailsjs/go/models'
import { filterTunnels, parseTunnelTags } from './tunnel-filters'

function makeTunnel(
  id: string,
  overrides: Partial<sshtunnel.SavedTunnelConfig> = {}
): sshtunnel.SavedTunnelConfig {
  return {
    id,
    name: `Tunnel ${id}`,
    tunnelType: 'local',
    localPort: 8000,
    gatewayPorts: false,
    remoteHost: 'localhost',
    remotePort: 5432,
    hostSource: 'ssh_config',
    hostAlias: `host-${id}`,
    ...overrides,
  } as sshtunnel.SavedTunnelConfig
}

describe('parseTunnelTags', () => {
  it('normalizes comma separated tags', () => {
    expect(parseTunnelTags(' db, Prod,db ,, api ')).toEqual([
      'db',
      'prod',
      'api',
    ])
  })
})

describe('filterTunnels', () => {
  it('matches query against name, host, ports, and tags', () => {
    const tunnels = [
      makeTunnel('db', { name: 'Database', localPort: 5432 }),
      makeTunnel('redis', { name: 'Cache', localPort: 6379 }),
    ]
    const tagsByTunnel = { redis: ['cache'] }

    expect(
      filterTunnels(tunnels, [], {
        query: 'database',
        status: 'all',
        tag: 'all',
        tagsByTunnel,
      }).map((tunnel) => tunnel.id)
    ).toEqual(['db'])
    expect(
      filterTunnels(tunnels, [], {
        query: '6379',
        status: 'all',
        tag: 'all',
        tagsByTunnel,
      }).map((tunnel) => tunnel.id)
    ).toEqual(['redis'])
    expect(
      filterTunnels(tunnels, [], {
        query: 'cache',
        status: 'all',
        tag: 'all',
        tagsByTunnel,
      }).map((tunnel) => tunnel.id)
    ).toEqual(['redis'])
  })

  it('filters by runtime status', () => {
    const tunnels = [makeTunnel('running'), makeTunnel('stopped')]
    const activeTunnels = [
      { configId: 'running', status: 'active' },
    ] as sshtunnel.ActiveTunnelInfo[]

    expect(
      filterTunnels(tunnels, activeTunnels, {
        query: '',
        status: 'running',
        tag: 'all',
        tagsByTunnel: {},
      }).map((tunnel) => tunnel.id)
    ).toEqual(['running'])
    expect(
      filterTunnels(tunnels, activeTunnels, {
        query: '',
        status: 'stopped',
        tag: 'all',
        tagsByTunnel: {},
      }).map((tunnel) => tunnel.id)
    ).toEqual(['stopped'])
  })
})
