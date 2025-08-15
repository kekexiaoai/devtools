import React, { useCallback } from 'react'
import { sshtunnel } from '@wailsjs/go/models'
import { toast } from 'sonner'
import { StopForward } from '@wailsjs/go/sshgate/Service'
import { useDialog } from '@/hooks/useDialog'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { RefreshCw, Trash2, Plus } from 'lucide-react'

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

interface TunnelViewProps {
  tunnels: sshtunnel.ActiveTunnelInfo[]
  isLoading: boolean
  onRefresh: () => void
  onCreateTunnel: () => void // 新增：创建 Tunnel 的回调函数
}

export function TunnelView({
  tunnels,
  isLoading,
  onRefresh,
  onCreateTunnel,
}: TunnelViewProps) {
  const { showDialog } = useDialog()

  const handleStopTunnel = useCallback(
    async (tunnelId: string) => {
      // Find the tunnel to be stopped for notification purposes
      const tunnelToStop = tunnels.find((t) => t.id === tunnelId)
      try {
        await StopForward(tunnelId)
        // The 'tunnels:changed' event will handle the refresh automatically.
        if (tunnelToStop) {
          toast.success('Tunnel Stopped', {
            description: `Stopped forwarding from ${tunnelToStop.localAddr}`,
          })
        } else {
          toast.success('Tunnel stopped successfully.')
        }
      } catch (error) {
        await showDialog({
          type: 'error',
          title: 'Error',
          message: `Failed to stop tunnel: ${String(error)}`,
        })
      }
    },
    [showDialog, tunnels]
  )

  return (
    <div className="p-4 h-full flex flex-col gap-4">
      <div className="flex justify-between items-center flex-shrink-0">
        <h2 className="text-lg font-semibold">Active SSH Tunnels</h2>
        <div>
          <Button
            onClick={onCreateTunnel} // 新增：调用创建 Tunnel 的回调函数
            variant="outline"
            size="icon"
            className="mr-2"
            title="Create New Tunnel"
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button
            onClick={onRefresh}
            variant="outline"
            size="icon"
            disabled={isLoading}
            title="Refresh Tunnels"
          >
            <RefreshCw
              className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`}
            />
          </Button>
        </div>
      </div>
      <div className="border rounded-lg overflow-y-auto flex-1">
        <Table>
          <TableHeader>
            <TableRow>
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
                <TableCell colSpan={5} className="h-24 text-center">
                  Loading...
                </TableCell>
              </TableRow>
            ) : tunnels.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  <div className="flex flex-col items-center justify-center gap-4">
                    <p className="text-muted-foreground">
                      No active tunnels. Create one to get started.
                    </p>
                    <Button onClick={onCreateTunnel}>
                      <Plus className="mr-2 h-4 w-4" /> Create New Tunnel
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              tunnels.map((tunnel) => (
                <TableRow key={tunnel.id}>
                  <TableCell className="font-mono">{tunnel.alias}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {getTunnelTypeLabel(tunnel.type)}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono">
                    {tunnel.localAddr}
                  </TableCell>
                  <TableCell className="font-mono">
                    {tunnel.remoteAddr}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      onClick={() => void handleStopTunnel(tunnel.id)}
                      variant="ghost"
                      size="icon"
                      className="hover:text-destructive"
                      title="Stop Tunnel"
                    >
                      <Trash2 className="h-4 w-4" />
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
