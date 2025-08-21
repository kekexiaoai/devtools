import React from 'react'
import { sshtunnel } from '@wailsjs/go/models'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { ArrowRight, Play, Trash2, Pencil, Globe, Loader2 } from 'lucide-react'

interface SavedTunnelItemProps {
  tunnel: sshtunnel.SavedTunnelConfig
  onStart: (id: string) => void
  onDelete: (id: string) => void
  onEdit: (tunnel: sshtunnel.SavedTunnelConfig) => void
  isStarting: boolean
}

// Helper to format the tunnel description
const formatTunnelDescription = (
  tunnel: sshtunnel.SavedTunnelConfig
): React.ReactNode => {
  const localPart = `localhost:${tunnel.localPort}`
  if (tunnel.tunnelType === 'local') {
    const remotePart = `${tunnel.remoteHost}:${tunnel.remotePort}`
    return (
      <div className="flex items-center space-x-2">
        <span className="font-mono text-sm bg-muted px-2 py-1 rounded">
          {localPart}
        </span>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
        <span className="font-mono text-sm bg-muted px-2 py-1 rounded">
          {remotePart}
        </span>
      </div>
    )
  }
  if (tunnel.tunnelType === 'dynamic') {
    return (
      <div className="flex items-center space-x-2">
        <span className="font-mono text-sm bg-muted px-2 py-1 rounded">
          {localPart}
        </span>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
        <span className="font-mono text-sm">SOCKS5 Proxy</span>
      </div>
    )
  }
  return <span className="text-muted-foreground">Unknown Tunnel Type</span>
}

// Helper to format host information
const formatHostInfo = (tunnel: sshtunnel.SavedTunnelConfig): string => {
  if (tunnel.hostSource === 'ssh_config' && tunnel.hostAlias) {
    return `via ${tunnel.hostAlias}`
  }
  if (tunnel.hostSource === 'manual' && tunnel.manualHost) {
    return `via ${tunnel.manualHost.user}@${tunnel.manualHost.hostName}`
  }
  return 'via Unknown Host'
}

export function SavedTunnelItem({
  tunnel,
  onStart,
  onDelete,
  onEdit,
  isStarting,
}: SavedTunnelItemProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle>{tunnel.name}</CardTitle>
            <CardDescription className="pt-2">
              {formatHostInfo(tunnel)}
            </CardDescription>
          </div>
          {tunnel.gatewayPorts && (
            <div
              className="flex items-center text-xs text-muted-foreground"
              title="GatewayPorts enabled"
            >
              <Globe className="h-4 w-4 mr-1" />
              <span>Public</span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>{formatTunnelDescription(tunnel)}</CardContent>
      <CardFooter className="flex justify-end space-x-2">
        <Button variant="outline" size="sm" onClick={() => onEdit(tunnel)}>
          <Pencil className="mr-2 h-4 w-4" /> Edit
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => onDelete(tunnel.id)}
        >
          <Trash2 className="mr-2 h-4 w-4" /> Delete
        </Button>
        <Button
          size="sm"
          onClick={() => onStart(tunnel.id)}
          disabled={isStarting}
        >
          {isStarting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Play className="mr-2 h-4 w-4" />
          )}
          {isStarting ? 'Starting...' : 'Start'}
        </Button>
      </CardFooter>
    </Card>
  )
}
