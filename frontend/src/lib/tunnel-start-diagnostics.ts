import { sshtunnel } from '@wailsjs/go/models'
import {
  formatTunnelPortConflict,
  type TunnelPortConflict,
} from './tunnel-port-conflicts'

export interface TunnelStartFailureDiagnosis {
  reason: string
  details: string
  suggestions: string[]
}

export interface TunnelFailureDiagnosticEntry {
  tunnelId: string
  tunnelName: string
  error: Error
  diagnosis: TunnelStartFailureDiagnosis
}

interface DiagnoseTunnelStartFailureInput {
  tunnel: sshtunnel.SavedTunnelConfig
  error: Error
  portConflicts: TunnelPortConflict[]
}

interface BuildTunnelFailureDiagnosticsInput {
  savedTunnels: sshtunnel.SavedTunnelConfig[]
  tunnelErrors: Map<string, Error>
  portConflicts: Map<string, TunnelPortConflict[]>
}

export function diagnoseTunnelStartFailure({
  tunnel,
  error,
  portConflicts,
}: DiagnoseTunnelStartFailureInput): TunnelStartFailureDiagnosis {
  const message = error.message || String(error)
  const normalized = message.toLowerCase()
  const sshTarget = formatSshTarget(tunnel)

  if (
    portConflicts.length > 0 ||
    normalized.includes('local port is already in use') ||
    normalized.includes('address already in use')
  ) {
    return {
      reason: 'Local port conflict',
      details:
        portConflicts.length > 0
          ? portConflicts.map(formatTunnelPortConflict).join('\n')
          : `Local port ${tunnel.localPort} is already in use.`,
      suggestions: [
        'Stop the process using this port or change the tunnel local port.',
        'Use Diagnostics > Listening Ports to identify the owning process.',
      ],
    }
  }

  if (
    normalized.includes('authentication failed') ||
    normalized.includes('permission denied') ||
    normalized.includes('unable to authenticate')
  ) {
    return {
      reason: 'SSH authentication failed',
      details: message,
      suggestions: [
        `Verify the password, SSH key, agent, and ssh_config entry for ${sshTarget}.`,
        'If the host key changed, reconnect from SSH Gate and trust the updated key if appropriate.',
      ],
    }
  }

  if (
    normalized.includes('connection refused') ||
    normalized.includes('timed out') ||
    normalized.includes('could not resolve hostname') ||
    normalized.includes('no such host') ||
    normalized.includes('host is down') ||
    normalized.includes('network is unreachable')
  ) {
    return {
      reason: 'SSH host is unreachable',
      details: message,
      suggestions: [
        `Check that ${sshTarget} is reachable and accepting SSH connections.`,
        'Confirm the SSH host, port, VPN, proxy, and firewall settings.',
      ],
    }
  }

  if (
    normalized.includes('manual host info is missing') ||
    normalized.includes('unsupported tunnel type') ||
    normalized.includes('unknown host source') ||
    normalized.includes('configuration') ||
    normalized.includes('config')
  ) {
    return {
      reason: 'Tunnel configuration issue',
      details: message,
      suggestions: [
        'Edit the tunnel and verify its host source, local port, and forwarding settings.',
        'If this tunnel belongs to a profile, confirm the profile references a saved tunnel.',
      ],
    }
  }

  return {
    reason: 'Tunnel startup failed',
    details: message,
    suggestions: [
      'Open Diagnostics and review the recent application log for this startup attempt.',
      'Try starting the equivalent SSH command from the tunnel card to compare the raw SSH output.',
    ],
  }
}

export function buildTunnelFailureDiagnostics({
  savedTunnels,
  tunnelErrors,
  portConflicts,
}: BuildTunnelFailureDiagnosticsInput): TunnelFailureDiagnosticEntry[] {
  return savedTunnels.flatMap((tunnel) => {
    const error = tunnelErrors.get(tunnel.id)
    if (!error) return []

    return [
      {
        tunnelId: tunnel.id,
        tunnelName: tunnel.name,
        error,
        diagnosis: diagnoseTunnelStartFailure({
          tunnel,
          error,
          portConflicts: portConflicts.get(tunnel.id) ?? [],
        }),
      },
    ]
  })
}

function formatSshTarget(tunnel: sshtunnel.SavedTunnelConfig): string {
  if (tunnel.hostSource === 'ssh_config' && tunnel.hostAlias) {
    return tunnel.hostAlias
  }

  if (tunnel.hostSource === 'manual' && tunnel.manualHost) {
    return `${tunnel.manualHost.user}@${tunnel.manualHost.hostName}`
  }

  return tunnel.name
}
