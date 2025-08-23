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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  ArrowRight,
  Trash2,
  Loader2,
  CheckCircle2,
  XCircle,
} from 'lucide-react'

import { CopyableAddress } from '@/components/ui/copyable-address'

type TunnelStatus = 'active' | 'disconnected' | 'stopping'

const isTunnelStatus = (s: string): s is TunnelStatus => {
  return ['active', 'disconnected', 'stopping'].includes(s)
}

function TunnelStatusIndicator({
  status,
  message,
}: {
  status: string
  message: string
}) {
  const statusConfig: Record<
    TunnelStatus,
    { icon: React.JSX.Element; label: string }
  > = {
    active: {
      icon: <CheckCircle2 className="h-4 w-4 text-green-500" />,
      label: 'Active',
    },
    disconnected: {
      icon: <XCircle className="h-4 w-4 text-red-500" />,
      label: 'Disconnected',
    },
    stopping: {
      icon: <Loader2 className="h-4 w-4 animate-spin text-yellow-500" />,
      label: 'Stopping',
    },
  }

  const config = isTunnelStatus(status)
    ? statusConfig[status]
    : statusConfig.disconnected

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-2 text-sm">
            {config.icon}
            <span className="capitalize">{config.label}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>{message}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

const getTunnelTypeLabel = (type: string): string => {
  switch (type.toLowerCase()) {
    case 'local':
      return 'Local Forward (-L)'
    case 'remote':
      return 'Remote Forward (-R)'
    case 'dynamic':
      return 'Dynamic (SOCKS5)'
    default:
      return type.toUpperCase()
  }
}

const formatTunnelDescription = (
  tunnel: sshtunnel.ActiveTunnelInfo
): React.ReactNode => {
  const localPart = <CopyableAddress address={tunnel.localAddr} />
  const remotePart =
    tunnel.type !== 'dynamic' ? (
      <CopyableAddress address={tunnel.remoteAddr} />
    ) : (
      // SOCKS5 Proxy is not an address, so it's not copyable
      <span className="font-mono text-sm bg-muted px-2 py-1 rounded">
        {tunnel.remoteAddr}
      </span>
    )

  return (
    <div className="flex items-center space-x-2">
      {localPart}
      <ArrowRight className="h-4 w-4 text-muted-foreground" />
      {remotePart}
    </div>
  )
}

interface ActiveTunnelItemProps {
  tunnel: sshtunnel.ActiveTunnelInfo
  onStop: (tunnel: sshtunnel.ActiveTunnelInfo) => void
}

export function ActiveTunnelItem({ tunnel, onStop }: ActiveTunnelItemProps) {
  const isStopping = tunnel.status === 'stopping'
  const isDisconnected = tunnel.status === 'disconnected'
  const actionText = isDisconnected ? 'Clear' : 'Stop'
  const actionIcon = isStopping ? (
    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
  ) : (
    <Trash2 className="mr-2 h-4 w-4" />
  )

  return (
    <Card
      data-state={isDisconnected ? 'disconnected' : 'active'}
      className="data-[state=disconnected]:border-dashed data-[state=disconnected]:border-destructive/50 gap-3 py-3"
    >
      <CardHeader className="px-4 pt-0">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="font-mono">{tunnel.alias}</CardTitle>
            <CardDescription className="pt-1.5">
              {getTunnelTypeLabel(tunnel.type)}
            </CardDescription>
          </div>
          <TunnelStatusIndicator
            status={tunnel.status}
            message={tunnel.statusMsg}
          />
        </div>
      </CardHeader>
      <CardContent className="px-4">
        {formatTunnelDescription(tunnel)}
      </CardContent>
      <CardFooter className="px-4 pb-0 flex justify-end">
        <Button
          variant="destructive"
          size="sm"
          onClick={() => onStop(tunnel)}
          disabled={isStopping}
          title={isDisconnected ? 'Clear Disconnected Tunnel' : 'Stop Tunnel'}
        >
          {actionIcon}
          {isStopping ? 'Stopping...' : actionText}
        </Button>
      </CardFooter>
    </Card>
  )
}
