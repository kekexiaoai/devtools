import React from 'react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Loader2, CheckCircle2, XCircle } from 'lucide-react'

type TunnelStatus = 'active' | 'disconnected' | 'stopping'

const isTunnelStatus = (s: string): s is TunnelStatus => {
  return ['active', 'disconnected', 'stopping'].includes(s)
}

export function TunnelStatusIndicator({
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
