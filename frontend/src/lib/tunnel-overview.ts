import { sshgate, sshtunnel } from '@wailsjs/go/models'
import type { TunnelPortConflict } from './tunnel-port-conflicts'

export type TunnelOverviewTone = 'healthy' | 'warning' | 'error'

export interface TunnelOverviewStats {
  total: number
  running: number
  disconnected: number
  stopping: number
  stopped: number
  conflictTunnels: number
  errorEvents: number
  warningEvents: number
}

export interface TunnelOverview {
  stats: TunnelOverviewStats
  healthTone: TunnelOverviewTone
  recentEvents: sshgate.TunnelEventFeedItem[]
}

export function buildTunnelOverview({
  activeTunnels,
  events,
  portConflicts,
  savedTunnels,
}: {
  savedTunnels: sshtunnel.SavedTunnelConfig[]
  activeTunnels: sshtunnel.ActiveTunnelInfo[]
  portConflicts: Map<string, TunnelPortConflict[]>
  events: sshgate.TunnelEventFeedItem[]
}): TunnelOverview {
  const activeByConfigId = new Map(
    activeTunnels.map((tunnel) => [tunnel.configId, tunnel])
  )

  const stats = savedTunnels.reduce<TunnelOverviewStats>(
    (summary, tunnel) => {
      const activeTunnel = activeByConfigId.get(tunnel.id)
      if (!activeTunnel) {
        summary.stopped += 1
      } else if (activeTunnel.status === 'active') {
        summary.running += 1
      } else if (activeTunnel.status === 'disconnected') {
        summary.disconnected += 1
      } else if (activeTunnel.status === 'stopping') {
        summary.stopping += 1
      }
      return summary
    },
    {
      total: savedTunnels.length,
      running: 0,
      disconnected: 0,
      stopping: 0,
      stopped: 0,
      conflictTunnels: portConflicts.size,
      errorEvents: events.filter((event) => event.level === 'ERROR').length,
      warningEvents: events.filter((event) => event.level === 'WARN').length,
    }
  )

  return {
    stats,
    healthTone: getOverviewTone(stats),
    recentEvents: events.slice(0, 8),
  }
}

function getOverviewTone(stats: TunnelOverviewStats): TunnelOverviewTone {
  if (stats.disconnected > 0 || stats.errorEvents > 0) {
    return 'error'
  }
  if (stats.conflictTunnels > 0 || stats.warningEvents > 0) {
    return 'warning'
  }
  return 'healthy'
}
