import { useCallback } from 'react'
import { sshtunnel } from '@wailsjs/go/models'
import { toast } from 'sonner'
import { StopForward } from '@wailsjs/go/sshgate/Service'
import { useDialog } from '@/hooks/useDialog'
import { Button } from '@/components/ui/button'
import { RefreshCw, Loader2 } from 'lucide-react'
import { ActiveTunnelItem } from './ActiveTunnelItem'

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

  if (isLoading && tunnels.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

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
      {tunnels.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <p>No active tunnels.</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto pr-2 space-y-4">
          {tunnels.map((tunnel) => (
            <ActiveTunnelItem
              key={tunnel.id}
              tunnel={tunnel}
              onStop={() => void handleStopTunnel(tunnel)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
