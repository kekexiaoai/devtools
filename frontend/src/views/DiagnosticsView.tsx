import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { backend, sshgate, sshtunnel } from '@wailsjs/go/models'
import { GetDiagnosticsSnapshot, ReadAppLogTail } from '@wailsjs/go/backend/App'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { getTunnelHealthSummary } from '@/lib/tunnel-health'
import { Copy, Loader2, RefreshCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

interface DiagnosticsViewProps {
  activeTunnels: sshtunnel.ActiveTunnelInfo[]
  savedTunnels: sshtunnel.SavedTunnelConfig[]
  tunnelProfiles: sshgate.TunnelProfile[]
}

export function DiagnosticsView({
  activeTunnels,
  savedTunnels,
  tunnelProfiles,
}: DiagnosticsViewProps) {
  const [snapshot, setSnapshot] = useState<backend.DiagnosticsSnapshot | null>(
    null
  )
  const [logLines, setLogLines] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const tunnelHealth = useMemo(() => {
    return getTunnelHealthSummary(activeTunnels)
  }, [activeTunnels])

  const diagnosticSummary = useMemo(() => {
    return [
      `Platform: ${snapshot?.platform ?? 'Unknown'}`,
      `Debug: ${snapshot?.debug ? 'yes' : 'no'}`,
      `Config dir: ${snapshot?.configDir ?? 'Unknown'}`,
      `Log file: ${snapshot?.logFilePath ?? 'Unknown'}`,
      `Healthy tunnels: ${tunnelHealth.healthy}`,
      `Disconnected tunnels: ${tunnelHealth.disconnected}`,
      `Saved tunnels: ${savedTunnels.length}`,
      `Tunnel profiles: ${tunnelProfiles.length}`,
    ].join('\n')
  }, [snapshot, tunnelHealth, savedTunnels.length, tunnelProfiles.length])

  const refresh = useCallback(async () => {
    setIsLoading(true)
    try {
      const [nextSnapshot, nextLogLines] = await Promise.all([
        GetDiagnosticsSnapshot(),
        ReadAppLogTail(200),
      ])
      setSnapshot(nextSnapshot)
      setLogLines(nextLogLines)
    } catch (error) {
      toast.error(`Failed to load diagnostics: ${String(error)}`)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const copySummary = async () => {
    try {
      await navigator.clipboard.writeText(diagnosticSummary)
      toast.success('Diagnostics summary copied.')
    } catch (error) {
      toast.error(`Failed to copy diagnostics summary: ${String(error)}`)
    }
  }

  return (
    <div className="p-4 h-full overflow-y-auto">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Diagnostics</h1>
          <p className="text-muted-foreground">
            Inspect runtime state and recent application logs.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void refresh()}>
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void copySummary()}
          >
            <Copy className="mr-2 h-4 w-4" />
            Copy Summary
          </Button>
          <Button variant="outline" size="sm" onClick={() => setLogLines([])}>
            <Trash2 className="mr-2 h-4 w-4" />
            Clear View
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-1">
          <CardHeader>
            <CardTitle>Snapshot</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              <DiagnosticRow label="Platform" value={snapshot?.platform} />
              <DiagnosticRow
                label="Debug"
                value={snapshot ? (snapshot.debug ? 'Yes' : 'No') : undefined}
              />
              <DiagnosticRow label="Config Dir" value={snapshot?.configDir} />
              <DiagnosticRow label="Log File" value={snapshot?.logFilePath} />
            </dl>
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Tunnel State</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Metric label="Healthy" value={tunnelHealth.healthy} />
            <Metric label="Disconnected" value={tunnelHealth.disconnected} />
            <Metric label="Saved" value={savedTunnels.length} />
            <Metric label="Profiles" value={tunnelProfiles.length} />
          </CardContent>
        </Card>

        <Card className="xl:col-span-3">
          <CardHeader>
            <CardTitle>Recent App Log</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              readOnly
              value={logLines.join('\n')}
              className="min-h-[420px] resize-none font-mono text-xs"
              placeholder="No log lines loaded."
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function DiagnosticRow({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-all font-medium">{value || 'Unknown'}</dd>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-muted/40 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  )
}
