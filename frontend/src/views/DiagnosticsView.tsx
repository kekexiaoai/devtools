import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { backend, sshgate, sshtunnel } from '@wailsjs/go/models'
import {
  GetDiagnosticsSnapshot,
  GetListeningPorts,
  ReadAppLogTail,
} from '@wailsjs/go/backend/App'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { getTunnelHealthSummary } from '@/lib/tunnel-health'
import { getTunnelPortConflictMap } from '@/lib/tunnel-port-conflicts'
import { buildTunnelFailureDiagnostics } from '@/lib/tunnel-start-diagnostics'
import { Copy, Loader2, RefreshCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

interface DiagnosticsViewProps {
  activeTunnels: sshtunnel.ActiveTunnelInfo[]
  savedTunnels: sshtunnel.SavedTunnelConfig[]
  tunnelProfiles: sshgate.TunnelProfile[]
  tunnelErrors: Map<string, Error>
}

export function DiagnosticsView({
  activeTunnels,
  savedTunnels,
  tunnelProfiles,
  tunnelErrors,
}: DiagnosticsViewProps) {
  const [snapshot, setSnapshot] = useState<backend.DiagnosticsSnapshot | null>(
    null
  )
  const [listeningPorts, setListeningPorts] = useState<backend.ListeningPort[]>(
    []
  )
  const [logLines, setLogLines] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const tunnelHealth = useMemo(() => {
    return getTunnelHealthSummary(activeTunnels)
  }, [activeTunnels])

  const portConflicts = useMemo(() => {
    return getTunnelPortConflictMap(savedTunnels, activeTunnels, listeningPorts)
  }, [savedTunnels, activeTunnels, listeningPorts])

  const tunnelFailureDiagnostics = useMemo(() => {
    return buildTunnelFailureDiagnostics({
      savedTunnels,
      tunnelErrors,
      portConflicts,
    })
  }, [savedTunnels, tunnelErrors, portConflicts])

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
      `Listening ports: ${listeningPorts.length}`,
      `Tunnel startup failures: ${tunnelFailureDiagnostics.length}`,
    ].join('\n')
  }, [
    snapshot,
    tunnelHealth,
    savedTunnels.length,
    tunnelProfiles.length,
    listeningPorts.length,
    tunnelFailureDiagnostics.length,
  ])

  const refresh = useCallback(async () => {
    setIsLoading(true)
    try {
      const [nextSnapshot, nextLogLines, nextListeningPorts] =
        await Promise.all([
          GetDiagnosticsSnapshot(),
          ReadAppLogTail(200),
          GetListeningPorts(),
        ])
      setSnapshot(nextSnapshot)
      setLogLines(nextLogLines)
      setListeningPorts(nextListeningPorts)
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
            <Metric label="Listening Ports" value={listeningPorts.length} />
            <Metric
              label="Startup Failures"
              value={tunnelFailureDiagnostics.length}
            />
          </CardContent>
        </Card>

        <Card className="xl:col-span-3">
          <CardHeader>
            <CardTitle>Recent Tunnel Failures</CardTitle>
          </CardHeader>
          <CardContent>
            {tunnelFailureDiagnostics.length > 0 ? (
              <div className="space-y-3">
                {tunnelFailureDiagnostics.map((entry) => (
                  <div
                    key={entry.tunnelId}
                    className="rounded-md border bg-destructive/5 p-3 text-sm"
                  >
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-medium">{entry.tunnelName}</div>
                        <div className="text-xs text-destructive">
                          {entry.diagnosis.reason}
                        </div>
                      </div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {entry.tunnelId}
                      </div>
                    </div>
                    <p className="whitespace-pre-wrap break-all text-xs text-muted-foreground">
                      {entry.diagnosis.details}
                    </p>
                    <ul className="mt-2 list-disc space-y-1 pl-4 text-xs">
                      {entry.diagnosis.suggestions.map((suggestion) => (
                        <li key={suggestion}>{suggestion}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
                No tunnel startup failures recorded in this session.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="xl:col-span-3">
          <CardHeader>
            <CardTitle>Listening Ports</CardTitle>
          </CardHeader>
          <CardContent>
            {listeningPorts.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Port</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead>Process</TableHead>
                    <TableHead>PID</TableHead>
                    <TableHead>Protocol</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {listeningPorts.map((item) => (
                    <TableRow
                      key={`${item.protocol}-${item.address}-${item.port}-${item.pid}`}
                    >
                      <TableCell className="font-mono font-medium">
                        {item.port}
                      </TableCell>
                      <TableCell className="font-mono">
                        {item.address}
                      </TableCell>
                      <TableCell>{item.command}</TableCell>
                      <TableCell className="font-mono">{item.pid}</TableCell>
                      <TableCell className="uppercase">
                        {item.protocol}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
                No listening ports reported.
              </div>
            )}
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
