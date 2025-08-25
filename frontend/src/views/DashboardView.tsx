import React, { useMemo } from 'react'
import { sshtunnel } from '@wailsjs/go/models'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Loader2,
  Play,
  PlusCircle,
  FileJson,
  Terminal,
  RefreshCw,
  StopCircle,
} from 'lucide-react'
import { type ToolId } from '@/types'
import { formatTunnelDescription } from '@/lib/tunnel-utils'

interface DashboardViewProps {
  onNavigate: (toolId: ToolId) => void
  onStartTunnel: (id: string) => void
  onStopTunnel: (runtimeId: string) => void
  savedTunnels: sshtunnel.SavedTunnelConfig[]
  activeTunnels: sshtunnel.ActiveTunnelInfo[]
  startingTunnelIds: string[]
  onOpenCreateTunnel: () => void
  activeSyncsCount: number
}

export function DashboardView({
  onNavigate,
  onStartTunnel,
  savedTunnels,
  activeTunnels,
  startingTunnelIds,
  onStopTunnel,
  onOpenCreateTunnel,
  activeSyncsCount,
}: DashboardViewProps) {
  const systemStatus = {
    activeTunnels: activeTunnels.length,
    activeSyncs: activeSyncsCount,
  }

  const activeTunnelMap = useMemo(() => {
    // Map by config ID for easier lookup
    return new Map(activeTunnels.map((t) => [t.configId, t]))
  }, [activeTunnels])

  const recentTunnels = useMemo(() => {
    return savedTunnels.slice(0, 5) // Show the 5 most recent tunnels
  }, [savedTunnels])

  return (
    <div className="px-6 h-full overflow-y-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome back! Here's a quick overview of your workspace.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content area */}
        <div className="lg:col-span-2 space-y-6">
          {/* Quick Actions Card */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Button
                variant="outline"
                className="flex flex-col h-24"
                onClick={onOpenCreateTunnel}
              >
                <PlusCircle className="h-6 w-6 mb-2" />
                <span>New Tunnel</span>
              </Button>
              <Button
                variant="outline"
                className="flex flex-col h-24"
                onClick={() => onNavigate('FileSyncer')}
              >
                <RefreshCw className="h-6 w-6 mb-2" />
                <span>New Sync</span>
              </Button>
              <Button
                variant="outline"
                className="flex flex-col h-24"
                onClick={() => onNavigate('JsonTools')}
              >
                <FileJson className="h-6 w-6 mb-2" />
                <span>JSON Tools</span>
              </Button>
              <Button
                variant="outline"
                className="flex flex-col h-24"
                onClick={() => onNavigate('Terminal')}
              >
                <Terminal className="h-6 w-6 mb-2" />
                <span>New Terminal</span>
              </Button>
            </CardContent>
          </Card>

          {/* Recent Tunnels Card */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Tunnels</CardTitle>
              <CardDescription>
                Quickly start one of your most recently used tunnels.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {recentTunnels.length > 0 ? (
                <div className="space-y-2">
                  {recentTunnels.map((tunnel) => {
                    const activeTunnel = activeTunnelMap.get(tunnel.id)
                    const isStarting = startingTunnelIds.includes(tunnel.id)
                    const isRunning = activeTunnel?.status === 'active'
                    const isStopping = activeTunnel?.status === 'stopping'
                    const isBusy = isStarting || isStopping

                    let statusColorClass = 'bg-gray-400'
                    if (isRunning) {
                      statusColorClass = 'bg-green-500'
                    } else if (isBusy) {
                      statusColorClass = 'bg-yellow-500 animate-pulse'
                    } else if (activeTunnel?.status === 'disconnected') {
                      statusColorClass = 'bg-red-500'
                    }

                    return (
                      <div
                        key={tunnel.id}
                        className="flex items-center justify-between px-3 py-2 bg-muted rounded-md"
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className={`h-2 w-2 rounded-full mr-3 shrink-0 ${statusColorClass}`}
                          />
                          <div className="flex flex-col">
                            <span className="font-medium">{tunnel.name}</span>
                            <div className="text-xs text-muted-foreground">
                              {formatTunnelDescription(tunnel)}
                            </div>
                          </div>
                        </div>
                        {isRunning ? (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => onStopTunnel(activeTunnel.id)}
                            disabled={isBusy}
                          >
                            {isStopping ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <StopCircle className="mr-2 h-4 w-4" />
                            )}
                            {isStopping ? 'Stopping' : 'Stop'}
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => onStartTunnel(tunnel.id)}
                            disabled={isBusy}
                          >
                            {isStarting ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <Play className="mr-2 h-4 w-4" />
                            )}
                            {isStarting ? 'Starting' : 'Start'}
                          </Button>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-4">
                  <p>No saved tunnels yet.</p>
                  <Button
                    variant="link"
                    className="mt-1"
                    onClick={() => onNavigate('Tunnels')}
                  >
                    Create your first tunnel
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar area for status */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>System Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <button
                className="flex items-center justify-between w-full p-3 -m-3 rounded-lg hover:bg-accent text-left"
                onClick={() => onNavigate('Tunnels')}
              >
                <span className="text-muted-foreground">Active Tunnels</span>
                <span className="font-bold text-lg">
                  {systemStatus.activeTunnels}
                </span>
              </button>
              <button
                className="flex items-center justify-between w-full p-3 -m-3 rounded-lg hover:bg-accent text-left"
                onClick={() => onNavigate('FileSyncer')}
              >
                <span className="text-muted-foreground">Active Syncs</span>
                <span className="font-bold text-lg">
                  {systemStatus.activeSyncs}
                </span>
              </button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
