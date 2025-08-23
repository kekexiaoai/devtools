import React from 'react'
import { Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

type TunnelStatus = 'active' | 'disconnected' | 'stopping'

const isTunnelStatus = (s: string): s is TunnelStatus => {
  return ['active', 'disconnected', 'stopping'].includes(s)
}

export function TunnelStatusIndicator({ status }: { status: string }) {
  const statusConfig: Record<
    TunnelStatus,
    { icon: React.JSX.Element; label: string; className: string }
  > = {
    active: {
      icon: <CheckCircle2 className="h-4 w-4" />,
      label: 'Active',
      className:
        'border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400',
    },
    disconnected: {
      icon: <XCircle className="h-4 w-4" />,
      label: 'Disconnected',
      className:
        'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400',
    },
    stopping: {
      icon: <Loader2 className="h-4 w-4 animate-spin" />,
      label: 'Stopping',
      className:
        'border-yellow-500/40 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400',
    },
  }

  const config = isTunnelStatus(status)
    ? statusConfig[status]
    : {
        ...statusConfig.disconnected,
        label: 'Unknown',
      }

  return (
    <Badge
      variant="outline"
      className={`gap-1.5 px-2.5 py-1 text-sm font-medium ${config.className}`}
    >
      {config.icon}
      <span className="capitalize">{config.label}</span>
    </Badge>
  )
}
