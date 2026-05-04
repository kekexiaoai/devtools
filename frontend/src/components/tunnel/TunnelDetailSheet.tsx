import React from 'react'
import { sshgate, sshtunnel } from '@wailsjs/go/models'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { ScrollText, Activity, Loader2, Play, StopCircle } from 'lucide-react'
import { formatTunnelDescription } from '@/lib/tunnel-utils'
import { formatTunnelTimestamp, formatTunnelUptime } from '@/lib/tunnel-health'
import { cn } from '@/lib/utils'

interface TunnelDetailSheetProps {
  open: boolean
  detail: sshgate.TunnelDetail | null
  isLoading: boolean
  isCheckingHealth: boolean
  onOpenChange: (open: boolean) => void
  onRefresh: () => void
  onStart: (configId: string) => void
  onStop: (runtimeId: string) => void
  onCheckHealth: (runtimeId: string) => void
}

const getHostLabel = (tunnel: sshtunnel.SavedTunnelConfig): string => {
  if (tunnel.hostSource === 'ssh_config') {
    return tunnel.hostAlias || 'SSH config host'
  }
  if (tunnel.manualHost) {
    return `${tunnel.manualHost.user}@${tunnel.manualHost.hostName}:${tunnel.manualHost.port || '22'}`
  }
  return 'Unknown host'
}

const getStatusTone = (status?: string): string => {
  switch (status) {
    case 'active':
      return 'bg-green-500/10 text-green-700 dark:text-green-400'
    case 'disconnected':
      return 'bg-red-500/10 text-red-700 dark:text-red-400'
    case 'stopping':
      return 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

const getLogTone = (level: string): string => {
  switch (level) {
    case 'SUCCESS':
      return 'text-green-600 dark:text-green-400'
    case 'ERROR':
      return 'text-red-600 dark:text-red-400'
    case 'WARN':
      return 'text-yellow-700 dark:text-yellow-400'
    default:
      return 'text-muted-foreground'
  }
}

export function TunnelDetailSheet({
  open,
  detail,
  isLoading,
  isCheckingHealth,
  onOpenChange,
  onRefresh,
  onStart,
  onStop,
  onCheckHealth,
}: TunnelDetailSheetProps) {
  const config = detail?.config
  const runtime = detail?.runtime
  const activeTunnel = runtime?.activeTunnel
  const health = runtime?.health
  const logs = runtime?.logs ?? []
  const isRunning = activeTunnel?.status === 'active'
  const isStopping = activeTunnel?.status === 'stopping'

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[560px] sm:max-w-[560px] gap-0 p-0">
        <SheetHeader className="border-b px-5 py-4">
          <div className="flex items-start justify-between gap-3 pr-8">
            <div className="min-w-0">
              <SheetTitle className="truncate">
                {config?.name || 'Tunnel Details'}
              </SheetTitle>
              <SheetDescription className="truncate">
                {config ? getHostLabel(config) : 'Loading tunnel details'}
              </SheetDescription>
            </div>
            {health && (
              <Badge className={cn('capitalize', getStatusTone(health.status))}>
                {health.status}
              </Badge>
            )}
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {isLoading ? (
            <div className="flex h-40 items-center justify-center text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading details...
            </div>
          ) : config && runtime && health ? (
            <div className="space-y-5">
              <section className="space-y-2">
                <div className="text-sm font-medium">Route</div>
                <div className="rounded-md border bg-muted/30 p-3">
                  {formatTunnelDescription(config)}
                </div>
              </section>

              <section className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Activity className="h-4 w-4" />
                    Health
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={onRefresh}>
                      Refresh
                    </Button>
                    {activeTunnel && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isCheckingHealth || isStopping}
                        onClick={() => onCheckHealth(activeTunnel.id)}
                      >
                        {isCheckingHealth ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Activity className="mr-2 h-4 w-4" />
                        )}
                        Check
                      </Button>
                    )}
                    {isRunning && activeTunnel ? (
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={isStopping}
                        onClick={() => onStop(activeTunnel.id)}
                      >
                        <StopCircle className="mr-2 h-4 w-4" />
                        Stop
                      </Button>
                    ) : (
                      <Button size="sm" onClick={() => onStart(config.id)}>
                        <Play className="mr-2 h-4 w-4" />
                        Start
                      </Button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm">
                  <Metric label="Status" value={health.status} />
                  <Metric
                    label="Uptime"
                    value={
                      activeTunnel
                        ? formatTunnelUptime(activeTunnel.startedAt)
                        : 'Not running'
                    }
                  />
                  <Metric
                    label="Last State Change"
                    value={formatTunnelTimestamp(health.lastStateChangeAt)}
                  />
                  <Metric
                    label="Last Health Check"
                    value={formatTunnelTimestamp(health.lastHealthCheckAt)}
                  />
                  <Metric
                    label="Check Count"
                    value={String(health.checkCount)}
                  />
                  <Metric label="Runtime ID" value={activeTunnel?.id || '-'} />
                </div>

                {health.statusMsg && (
                  <div className="rounded-md bg-muted/40 p-3 text-sm text-muted-foreground">
                    {health.statusMsg}
                  </div>
                )}
                {health.lastHealthCheckError && (
                  <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                    {health.lastHealthCheckError}
                  </div>
                )}
              </section>

              <section className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <ScrollText className="h-4 w-4" />
                  Tunnel Logs
                </div>
                <div className="min-h-48 rounded-md border bg-muted/20 p-3 font-mono text-xs">
                  {logs.length > 0 ? (
                    <div className="space-y-2">
                      {logs.map((entry) => (
                        <div
                          key={entry.sequence}
                          className="grid grid-cols-[8.5rem_4rem_1fr] gap-2"
                        >
                          <span className="text-muted-foreground">
                            {formatTunnelTimestamp(entry.timestamp)}
                          </span>
                          <span
                            className={cn(
                              'font-semibold',
                              getLogTone(entry.level)
                            )}
                          >
                            {entry.level}
                          </span>
                          <span className="whitespace-pre-wrap break-words">
                            {entry.message}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-muted-foreground">
                      No tunnel-specific logs yet.
                    </div>
                  )}
                </div>
              </section>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              Select a tunnel to view details.
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border bg-background px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="truncate font-medium">{value}</div>
    </div>
  )
}
