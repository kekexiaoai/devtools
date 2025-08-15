import { JSX, useCallback } from 'react'
import { sshtunnel } from '@wailsjs/go/models'
import { toast } from 'sonner'
import { StopForward } from '@wailsjs/go/sshgate/Service'
import { useDialog } from '@/hooks/useDialog'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { RefreshCw, Trash2, CheckCircle2, XCircle, Loader2 } from 'lucide-react'

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

type TunnelStatus = 'active' | 'disconnected' | 'stopping'

const isTunnelStatus = (s: string): s is TunnelStatus => {
  return ['active', 'disconnected', 'stopping'].includes(s)
}

function TunnelStatusIndicator({
  status,
  message,
}: {
  status: TunnelStatus
  message: string
}) {
  const statusConfig: Record<
    TunnelStatus,
    { icon: JSX.Element; label: string }
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

  // const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.disconnected;

  const config = isTunnelStatus(status)
    ? statusConfig[status]
    : statusConfig.disconnected

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-2">
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

interface ActiveTunnelsProps {
  tunnels: sshtunnel.ActiveTunnelInfo[]
  isLoading: boolean
  onRefresh: () => void
}

export function ActiveTunnels({
  tunnels,
  isLoading,
  onRefresh,
}: ActiveTunnelsProps) {
  const { showDialog } = useDialog()

  const handleStopTunnel = useCallback(
    async (tunnel: sshtunnel.ActiveTunnelInfo) => {
      // 停止隧道前找到它的信息，以便在通知中使用
      const isDisconnected = tunnel.status === 'disconnected'
      const actionText = isDisconnected ? 'Clearing' : 'Stopping'
      const successText = isDisconnected ? 'cleared' : 'stopped'

      try {
        await StopForward(tunnel.id)
        // 刷新列表的逻辑现在由 'tunnels:changed' 事件监听器自动处理
        toast.success(`Tunnel ${successText}`, {
          description: isDisconnected
            ? `Entry for ${tunnel.alias} removed.`
            : `Stopped forwarding from ${tunnel.localAddr}`,
        })
      } catch (error) {
        await showDialog({
          type: 'error',
          title: `${actionText} Error`,
          message: `Failed to ${
            isDisconnected ? 'clear' : 'stop'
          } tunnel: ${String(error)}`,
        })
      }
    },
    [showDialog]
  )

  return (
    <div className="p-4 h-full flex flex-col gap-4">
      <div className="flex justify-between items-center flex-shrink-0">
        <h2 className="text-lg font-semibold">Active SSH Tunnels</h2>
        <Button
          onClick={onRefresh}
          variant="outline"
          size="icon"
          disabled={isLoading}
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      </div>
      <div className="border rounded-lg overflow-y-auto flex-1">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[150px]">Status</TableHead>
              <TableHead>Alias</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Local Address</TableHead>
              <TableHead>Remote Address</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && tunnels.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  Loading...
                </TableCell>
              </TableRow>
            ) : tunnels.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  No active tunnels.
                </TableCell>
              </TableRow>
            ) : (
              tunnels.map((tunnel) => (
                <TableRow
                  key={tunnel.id}
                  data-state={
                    tunnel.status === 'disconnected' ? 'disconnected' : 'active'
                  }
                >
                  <TableCell>
                    <TunnelStatusIndicator
                      status={tunnel.status as TunnelStatus}
                      message={tunnel.statusMsg}
                    />
                  </TableCell>
                  <TableCell className="font-mono">{tunnel.alias}</TableCell>
                  <TableCell>
                    <span className="px-2 py-1 text-xs font-semibold rounded-full bg-secondary text-secondary-foreground">
                      {getTunnelTypeLabel(tunnel.type)}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono">
                    {tunnel.localAddr}
                  </TableCell>
                  <TableCell className="font-mono">
                    {tunnel.remoteAddr}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      onClick={() => void handleStopTunnel(tunnel)}
                      variant="ghost"
                      size="icon"
                      className="hover:text-destructive"
                      disabled={tunnel.status === 'stopping'}
                      title={
                        tunnel.status === 'disconnected'
                          ? 'Clear Disconnected Tunnel'
                          : 'Stop Tunnel'
                      }
                    >
                      {tunnel.status === 'stopping' ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
