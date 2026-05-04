import React, { useCallback, useMemo, useEffect, useState } from 'react'
import { backend, sshgate, sshtunnel } from '@wailsjs/go/models'
import { GetListeningPorts } from '@wailsjs/go/backend/App'
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
  FolderKanban,
  Settings2,
  Activity,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react'
import { type ToolId } from '@/types'

import { formatTunnelDescription } from '@/lib/tunnel-utils'
import { appLogger, logMeta } from '@/lib/logger'
import { debounce } from '@/lib/utils'
import { getTunnelPortConflictMap } from '@/lib/tunnel-port-conflicts'
import { buildTunnelOverview } from '@/lib/tunnel-overview'

interface DashboardViewProps {
  onNavigate: (toolId: ToolId) => void
  onStartTunnel: (id: string) => void
  onStopTunnel: (runtimeId: string) => void
  savedTunnels: sshtunnel.SavedTunnelConfig[]
  activeTunnels: sshtunnel.ActiveTunnelInfo[]
  startingTunnelIds: string[]
  onOpenCreateTunnel: () => void
  onOpenProfileManager: () => void
  onStartTunnelProfile: (profileId: string) => void
  onStopTunnelProfile: (profileId: string) => void
  activeSyncsCount: number
  tunnelProfiles: sshgate.TunnelProfile[]
  tunnelEvents: sshgate.TunnelEventFeedItem[]
  startingProfileIds: string[]
  stoppingProfileIds: string[]
}

export function DashboardView({
  onNavigate,
  onStartTunnel,
  savedTunnels,
  activeTunnels,
  startingTunnelIds,
  onStopTunnel,
  onOpenCreateTunnel,
  onOpenProfileManager,
  onStartTunnelProfile,
  onStopTunnelProfile,
  activeSyncsCount,
  tunnelProfiles,
  tunnelEvents,
  startingProfileIds,
  stoppingProfileIds,
}: DashboardViewProps) {
  const logger = useMemo(() => {
    return appLogger.withPrefix('DashboardView')
  }, [])
  const [listeningPorts, setListeningPorts] = useState<backend.ListeningPort[]>(
    []
  )

  const refreshListeningPorts = useCallback(async () => {
    try {
      setListeningPorts(await GetListeningPorts())
    } catch (error) {
      logger.warn('Failed to refresh dashboard listening ports', error)
    }
  }, [logger])

  const activeTunnelMap = useMemo(() => {
    // Map by config ID for easier lookup
    return new Map(activeTunnels.map((t) => [t.configId, t]))
  }, [activeTunnels])

  // --- Window Size Logging ---
  useEffect(() => {
    // Create a debounced version of our Go backend call
    const debouncedLogSize = debounce((width: number, height: number) => {
      logger.info('Logging window size', { width, height }, logMeta)
    }, 500) // Wait 500ms after the last resize event before sending

    const handleResize = () => {
      debouncedLogSize(window.innerWidth, window.innerHeight)
    }

    // Log the initial size when the component mounts
    handleResize()

    // Add the event listener for window resize
    window.addEventListener('resize', handleResize)

    // Cleanup: remove the event listener when the component unmounts
    return () => window.removeEventListener('resize', handleResize)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // The empty dependency array [] means this effect runs only once on mount.

  const recentTunnels = useMemo(() => {
    return savedTunnels.slice(0, 5) // Show the 5 most recent tunnels
  }, [savedTunnels])

  const savedTunnelIds = useMemo(() => {
    return new Set(savedTunnels.map((tunnel) => tunnel.id))
  }, [savedTunnels])

  const portConflicts = useMemo(() => {
    return getTunnelPortConflictMap(savedTunnels, activeTunnels, listeningPorts)
  }, [savedTunnels, activeTunnels, listeningPorts])

  const tunnelOverview = useMemo(() => {
    return buildTunnelOverview({
      savedTunnels,
      activeTunnels,
      portConflicts,
      events: tunnelEvents,
    })
  }, [savedTunnels, activeTunnels, portConflicts, tunnelEvents])

  useEffect(() => {
    void refreshListeningPorts()
    const timer = window.setInterval(() => {
      void refreshListeningPorts()
    }, 15000)
    return () => window.clearInterval(timer)
  }, [refreshListeningPorts])

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
                <span>Tools</span>
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

          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
                <CardTitle>Tunnel Profiles</CardTitle>
                <CardDescription>
                  Start grouped tunnels for a workspace.
                </CardDescription>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={onOpenProfileManager}
              >
                <Settings2 className="mr-2 h-4 w-4" />
                Manage
              </Button>
            </CardHeader>
            <CardContent>
              {tunnelProfiles.length > 0 ? (
                <div className="space-y-2">
                  {tunnelProfiles.map((profile) => {
                    const validTunnelCount = profile.tunnelIds.filter((id) =>
                      savedTunnelIds.has(id)
                    ).length
                    const isStarting = startingProfileIds.includes(profile.id)
                    const isStopping = stoppingProfileIds.includes(profile.id)
                    const runningCount = activeTunnels.filter(
                      (tunnel) =>
                        profile.tunnelIds.includes(tunnel.configId) &&
                        tunnel.status === 'active'
                    ).length
                    return (
                      <div
                        key={profile.id}
                        className="flex items-center justify-between px-3 py-2 bg-muted rounded-md"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <FolderKanban className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <div className="font-medium truncate">
                              {profile.name}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {validTunnelCount} tunnels
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onStopTunnelProfile(profile.id)}
                            disabled={isStopping || runningCount === 0}
                          >
                            {isStopping ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <StopCircle className="mr-2 h-4 w-4" />
                            )}
                            {isStopping ? 'Stopping' : 'Stop'}
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => onStartTunnelProfile(profile.id)}
                            disabled={isStarting || validTunnelCount === 0}
                          >
                            {isStarting ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <Play className="mr-2 h-4 w-4" />
                            )}
                            {isStarting ? 'Starting' : 'Start'}
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-4">
                  <p>No tunnel profiles yet.</p>
                  <Button
                    variant="link"
                    className="mt-1"
                    onClick={onOpenProfileManager}
                  >
                    Create your first profile
                  </Button>
                </div>
              )}
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
              <CardTitle>Tunnel Overview</CardTitle>
              <CardDescription>
                Runtime health and recent issues.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <OverviewMetric
                  label="Running"
                  value={tunnelOverview.stats.running}
                  tone="success"
                />
                <OverviewMetric
                  label="Stopped"
                  value={tunnelOverview.stats.stopped}
                />
                <OverviewMetric
                  label="Disconnected"
                  value={tunnelOverview.stats.disconnected}
                  tone={
                    tunnelOverview.stats.disconnected > 0 ? 'danger' : 'muted'
                  }
                />
                <OverviewMetric
                  label="Conflicts"
                  value={tunnelOverview.stats.conflictTunnels}
                  tone={
                    tunnelOverview.stats.conflictTunnels > 0
                      ? 'warning'
                      : 'muted'
                  }
                />
              </div>
              <button
                className="flex items-center justify-between w-full p-3 -m-3 rounded-lg hover:bg-accent text-left"
                onClick={() => onNavigate('Tunnels')}
              >
                <span className="flex items-center gap-2 text-muted-foreground">
                  {tunnelOverview.healthTone === 'healthy' ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : tunnelOverview.healthTone === 'warning' ? (
                    <AlertTriangle className="h-4 w-4 text-yellow-600" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                  )}
                  Overall Health
                </span>
                <span className="font-semibold capitalize">
                  {tunnelOverview.healthTone}
                </span>
              </button>
              <button
                className="flex items-center justify-between w-full p-3 -m-3 rounded-lg hover:bg-accent text-left"
                onClick={() => onNavigate('FileSyncer')}
              >
                <span className="text-muted-foreground">Active Syncs</span>
                <span className="font-bold text-lg">{activeSyncsCount}</span>
              </button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Event Feed</CardTitle>
              <CardDescription>Latest tunnel lifecycle events.</CardDescription>
            </CardHeader>
            <CardContent>
              {tunnelOverview.recentEvents.length > 0 ? (
                <div className="space-y-2">
                  {tunnelOverview.recentEvents.map((event) => (
                    <div
                      key={`${event.sequence}-${event.configId}`}
                      className="rounded-md border border-border bg-muted/40 p-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <Activity
                            className={`h-3.5 w-3.5 shrink-0 ${getEventIconClass(event.level)}`}
                          />
                          <span className="truncate text-sm font-medium">
                            {event.tunnelName}
                          </span>
                        </div>
                        <span className="text-[11px] text-muted-foreground">
                          {formatEventTime(event.timestamp)}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {event.message}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                  No tunnel events yet.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function OverviewMetric({
  label,
  tone = 'muted',
  value,
}: {
  label: string
  tone?: 'success' | 'warning' | 'danger' | 'muted'
  value: number
}) {
  const toneClass = {
    success: 'text-green-600',
    warning: 'text-yellow-600',
    danger: 'text-destructive',
    muted: 'text-foreground',
  }[tone]

  return (
    <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
      <div className={`text-xl font-bold ${toneClass}`}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  )
}

function getEventIconClass(level: string): string {
  switch (level) {
    case 'ERROR':
      return 'text-destructive'
    case 'WARN':
      return 'text-yellow-600'
    case 'SUCCESS':
      return 'text-green-600'
    default:
      return 'text-muted-foreground'
  }
}

function formatEventTime(value: string): string {
  if (!value) return ''

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}
