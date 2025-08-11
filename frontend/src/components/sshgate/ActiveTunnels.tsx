import { useEffect, useState, useCallback } from 'react'
import { sshtunnel } from '@wailsjs/go/models'
import { GetActiveTunnels, StopForward } from '@wailsjs/go/sshgate/Service'
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
import { RefreshCw, Trash2 } from 'lucide-react'

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

export function ActiveTunnels() {
  const [tunnels, setTunnels] = useState<sshtunnel.ActiveTunnelInfo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const { showDialog } = useDialog()

  const fetchTunnels = useCallback(async () => {
    setIsLoading(true)
    try {
      const activeTunnels = await GetActiveTunnels()
      setTunnels(activeTunnels)
    } catch (error) {
      await showDialog({
        type: 'error',
        title: 'Error',
        message: `Failed to fetch active tunnels: ${String(error)}`,
      })
    } finally {
      setIsLoading(false)
    }
  }, [showDialog])

  useEffect(() => {
    void fetchTunnels()
    // 当窗口获得焦点时刷新，这比固定间隔轮询体验更好
    const handleFocus = () => void fetchTunnels()
    window.addEventListener('focus', handleFocus)

    // 同时保留一个轮询作为备用
    const interval = setInterval(() => void fetchTunnels(), 5000)

    return () => {
      window.removeEventListener('focus', handleFocus)
      clearInterval(interval)
    }
  }, [fetchTunnels])

  const handleStopTunnel = useCallback(
    async (tunnelId: string) => {
      try {
        await StopForward(tunnelId)
        // 乐观更新：立即从列表中移除，或重新获取以保证数据一致性
        await fetchTunnels()
      } catch (error) {
        await showDialog({
          type: 'error',
          title: 'Error',
          message: `Failed to stop tunnel: ${String(error)}`,
        })
      }
    },
    [fetchTunnels, showDialog]
  )

  return (
    <div className="p-4 h-full flex flex-col gap-4">
      <div className="flex justify-between items-center flex-shrink-0">
        <h2 className="text-lg font-semibold">Active SSH Tunnels</h2>
        <Button
          onClick={() => void fetchTunnels()}
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
                  No active tunnels.
                </TableCell>
              </TableRow>
            ) : (
              tunnels.map((tunnel) => (
                <TableRow key={tunnel.id}>
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
