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
  Play,
  PlusCircle,
  FileJson,
  Terminal,
  TrainFrontTunnel,
  RefreshCw,
} from 'lucide-react'
import { type toolIds } from '@/App'

interface DashboardViewProps {
  onNavigate: (toolId: (typeof toolIds)[number]) => void
  onStartTunnel: (id: string) => void
  savedTunnels: sshtunnel.SavedTunnelConfig[]
  activeTunnels: sshtunnel.ActiveTunnelInfo[]
  onOpenCreateTunnel: () => void
}

export function DashboardView({
  onNavigate,
  onStartTunnel,
  savedTunnels,
  activeTunnels,
  onOpenCreateTunnel,
}: DashboardViewProps) {
  // In a real implementation, activeSyncs would come from props.
  const systemStatus = {
    activeTunnels: activeTunnels.length,
    activeSyncs: 1,
  }

  const recentTunnels = useMemo(() => {
    return savedTunnels.slice(0, 5) // Show the 5 most recent tunnels
  }, [savedTunnels])

  return (
    <div className="p-6 h-full overflow-y-auto">
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
                  {recentTunnels.map((tunnel) => (
                    <div
                      key={tunnel.id}
                      className="flex items-center justify-between p-3 bg-muted rounded-md"
                    >
                      <div className="flex items-center">
                        <TrainFrontTunnel className="h-5 w-5 mr-3 text-muted-foreground" />
                        <span className="font-medium">{tunnel.name}</span>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => onStartTunnel(tunnel.id)}
                      >
                        <Play className="mr-2 h-4 w-4" />
                        Start
                      </Button>
                    </div>
                  ))}
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
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Active Tunnels</span>
                <span className="font-bold text-lg">
                  {systemStatus.activeTunnels}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Active Syncs</span>
                <span className="font-bold text-lg">
                  {systemStatus.activeSyncs}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
