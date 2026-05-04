import { sshtunnel } from '@wailsjs/go/models'

export type TunnelStatusFilter = 'all' | 'running' | 'stopped' | 'disconnected'

export interface TunnelFilterOptions {
  query: string
  status: TunnelStatusFilter
  tag: string
  tagsByTunnel: Record<string, string[]>
}

export function parseTunnelTags(value: string): string[] {
  const seen = new Set<string>()
  return value
    .split(',')
    .map((tag) => tag.trim().toLowerCase())
    .filter((tag) => {
      if (!tag || seen.has(tag)) return false
      seen.add(tag)
      return true
    })
}

export function filterTunnels(
  tunnels: sshtunnel.SavedTunnelConfig[],
  activeTunnels: sshtunnel.ActiveTunnelInfo[],
  options: TunnelFilterOptions
): sshtunnel.SavedTunnelConfig[] {
  const activeByConfig = new Map(
    activeTunnels.map((tunnel) => [tunnel.configId, tunnel])
  )
  const query = options.query.trim().toLowerCase()

  return tunnels.filter((tunnel) => {
    const tags = options.tagsByTunnel[tunnel.id] ?? []
    if (options.tag !== 'all' && !tags.includes(options.tag)) return false

    const activeTunnel = activeByConfig.get(tunnel.id)
    if (!matchesStatusFilter(activeTunnel, options.status)) return false

    if (!query) return true
    return getTunnelSearchText(tunnel, tags).includes(query)
  })
}

export function getAllTunnelTags(
  tagsByTunnel: Record<string, string[]>
): string[] {
  return Array.from(new Set(Object.values(tagsByTunnel).flat())).sort()
}

export function loadTunnelTags(): Record<string, string[]> {
  try {
    const raw = window.localStorage.getItem('devtools:tunnel-tags')
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, string[]>
    if (!parsed || typeof parsed !== 'object') return {}
    return Object.fromEntries(
      Object.entries(parsed)
        .filter(([, tags]) => Array.isArray(tags))
        .map(([id, tags]) => [
          id,
          tags.filter((tag) => typeof tag === 'string'),
        ])
    )
  } catch {
    return {}
  }
}

export function saveTunnelTags(tagsByTunnel: Record<string, string[]>): void {
  window.localStorage.setItem(
    'devtools:tunnel-tags',
    JSON.stringify(tagsByTunnel)
  )
}

function matchesStatusFilter(
  activeTunnel: sshtunnel.ActiveTunnelInfo | undefined,
  filter: TunnelStatusFilter
): boolean {
  if (filter === 'all') return true
  if (filter === 'running') return activeTunnel?.status === 'active'
  if (filter === 'disconnected') return activeTunnel?.status === 'disconnected'
  return !activeTunnel
}

function getTunnelSearchText(
  tunnel: sshtunnel.SavedTunnelConfig,
  tags: string[]
): string {
  return [
    tunnel.name,
    tunnel.hostAlias,
    tunnel.manualHost?.hostName,
    tunnel.manualHost?.user,
    tunnel.localPort,
    tunnel.remoteHost,
    tunnel.remotePort,
    tunnel.tunnelType,
    ...tags,
  ]
    .filter((value) => value !== undefined && value !== null)
    .join(' ')
    .toLowerCase()
}
