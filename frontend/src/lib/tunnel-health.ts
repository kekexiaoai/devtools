import { sshtunnel } from '@wailsjs/go/models'

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

export function formatTunnelTimestamp(value?: string): string {
  if (!value) return 'Never'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown'

  return dateTimeFormatter.format(date)
}

export function formatTunnelUptime(startedAt?: string): string {
  if (!startedAt) return 'Unknown'

  const start = new Date(startedAt).getTime()
  if (Number.isNaN(start)) return 'Unknown'

  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - start) / 1000))
  const hours = Math.floor(elapsedSeconds / 3600)
  const minutes = Math.floor((elapsedSeconds % 3600) / 60)

  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  if (minutes > 0) {
    return `${minutes}m`
  }
  return `${elapsedSeconds}s`
}

export function getTunnelHealthSummary(
  activeTunnels: sshtunnel.ActiveTunnelInfo[]
) {
  return activeTunnels.reduce(
    (summary, tunnel) => {
      if (tunnel.status === 'active') {
        summary.healthy += 1
      } else if (tunnel.status === 'disconnected') {
        summary.disconnected += 1
      }
      return summary
    },
    { healthy: 0, disconnected: 0 }
  )
}
