import { backend, sshtunnel } from '@wailsjs/go/models'

export type TunnelPortConflict =
  | {
      kind: 'listening'
      port: number
      address: string
      process: string
      pid: string
    }
  | {
      kind: 'duplicate'
      port: number
      peerId: string
      peerName: string
    }

export function getTunnelPortConflictMap(
  savedTunnels: sshtunnel.SavedTunnelConfig[],
  activeTunnels: sshtunnel.ActiveTunnelInfo[],
  listeningPorts: backend.ListeningPort[]
): Map<string, TunnelPortConflict[]> {
  const conflicts = new Map<string, TunnelPortConflict[]>()
  const activeConfigIds = new Set(
    activeTunnels
      .filter((tunnel) => tunnel.status === 'active')
      .map((tunnel) => tunnel.configId)
  )

  savedTunnels.forEach((tunnel) => {
    if (activeConfigIds.has(tunnel.id)) return

    listeningPorts
      .filter((port) => isPortConflict(tunnel, port))
      .forEach((port) => {
        addConflict(conflicts, tunnel.id, {
          kind: 'listening',
          port: tunnel.localPort,
          address: port.address,
          process: port.command,
          pid: port.pid,
        })
      })
  })

  for (let i = 0; i < savedTunnels.length; i += 1) {
    for (let j = i + 1; j < savedTunnels.length; j += 1) {
      const first = savedTunnels[i]
      const second = savedTunnels[j]
      if (first.localPort !== second.localPort) continue

      addConflict(conflicts, first.id, {
        kind: 'duplicate',
        port: first.localPort,
        peerId: second.id,
        peerName: second.name,
      })
      addConflict(conflicts, second.id, {
        kind: 'duplicate',
        port: second.localPort,
        peerId: first.id,
        peerName: first.name,
      })
    }
  }

  return conflicts
}

export function formatTunnelPortConflict(conflict: TunnelPortConflict): string {
  if (conflict.kind === 'duplicate') {
    return `Local port ${conflict.port} is also used by "${conflict.peerName}".`
  }

  return `Local port ${conflict.port} is already used by ${conflict.process} (PID ${conflict.pid}) on ${conflict.address}.`
}

export function formatTunnelPortConflictSummary(
  groups: Array<{ tunnelName: string; conflicts: TunnelPortConflict[] }>
): string {
  return groups
    .flatMap((group) => [
      `${group.tunnelName}:`,
      ...group.conflicts.map(
        (conflict) => `- ${formatTunnelPortConflict(conflict)}`
      ),
    ])
    .join('\n')
}

function addConflict(
  conflicts: Map<string, TunnelPortConflict[]>,
  tunnelId: string,
  conflict: TunnelPortConflict
) {
  const existing = conflicts.get(tunnelId) ?? []
  existing.push(conflict)
  conflicts.set(tunnelId, existing)
}

function isPortConflict(
  tunnel: sshtunnel.SavedTunnelConfig,
  listeningPort: backend.ListeningPort
) {
  if (Number(listeningPort.port) !== tunnel.localPort) return false
  if (tunnel.gatewayPorts) return true

  return isLoopbackCompatibleAddress(listeningPort.address)
}

function isLoopbackCompatibleAddress(address: string) {
  const normalized = address.toLowerCase()
  return ['*', '0.0.0.0', '::', '127.0.0.1', 'localhost', '::1'].includes(
    normalized
  )
}
