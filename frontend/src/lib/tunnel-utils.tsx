import React from 'react'
import { sshtunnel } from '@wailsjs/go/models'
import { CopyableAddress } from '@/components/ui/copyable-address'
import { ArrowRight } from 'lucide-react'

// Helper to format the tunnel description, now shared between components.
export const formatTunnelDescription = (
  tunnel: sshtunnel.SavedTunnelConfig
): React.ReactNode => {
  const bindAddr = tunnel.gatewayPorts ? '0.0.0.0' : 'localhost'

  const localPart = (
    <CopyableAddress address={`${bindAddr}:${tunnel.localPort}`} />
  )

  // Use a switch statement for clarity and to ensure all cases are handled.
  switch (tunnel.tunnelType) {
    case 'local':
      return (
        <div className="flex items-center space-x-2">
          {localPart}
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
          <CopyableAddress
            address={`${tunnel.remoteHost}:${tunnel.remotePort}`}
          />
        </div>
      )
    case 'dynamic':
      return (
        <div className="flex items-center space-x-2">
          {localPart}
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
          <span className="font-mono text-sm">SOCKS5 Proxy</span>
        </div>
      )
    default:
      // Provide a fallback for any unknown or future tunnel types.
      return (
        <span className="text-muted-foreground">
          Unknown Tunnel Type: {tunnel.tunnelType}
        </span>
      )
  }
}
