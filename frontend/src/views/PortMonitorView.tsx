import { useCallback, useEffect, useMemo, useState } from 'react'
import { Copy, Loader2, RefreshCw, Search } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { GetListeningPorts } from '@wailsjs/go/backend/App'
import { backend } from '@wailsjs/go/models'

export function PortMonitorView({ isActive }: { isActive: boolean }) {
  const [ports, setPorts] = useState<backend.ListeningPort[]>([])
  const [query, setQuery] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const refreshPorts = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      setPorts(await GetListeningPorts())
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isActive) return
    void refreshPorts()
    const timer = window.setInterval(() => void refreshPorts(), 10000)
    return () => window.clearInterval(timer)
  }, [isActive, refreshPorts])

  const filteredPorts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const sorted = ports.slice().sort((left, right) => {
      const leftPort = Number(left.port)
      const rightPort = Number(right.port)
      if (leftPort !== rightPort) return leftPort - rightPort
      return left.command.localeCompare(right.command)
    })
    if (!normalizedQuery) return sorted

    return sorted.filter((item) =>
      [item.port, item.address, item.command, item.pid, item.protocol].some(
        (value) => value.toLowerCase().includes(normalizedQuery)
      )
    )
  }, [ports, query])

  const copyPorts = async () => {
    const text = filteredPorts
      .map(
        (item) =>
          `${item.protocol.toUpperCase()}\t${item.address}:${item.port}\t${item.command}\t${item.pid}`
      )
      .join('\n')
    await navigator.clipboard.writeText(text)
    toast.success('Port list copied.')
  }

  const processCount = new Set(ports.map((item) => item.pid)).size

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Port Monitor</h1>
          <p className="text-sm text-muted-foreground">
            Inspect local listening TCP ports and owning processes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => void copyPorts()}
            disabled={!ports.length}
          >
            <Copy className="mr-2 h-4 w-4" />
            Copy
          </Button>
          <Button onClick={() => void refreshPorts()} disabled={isLoading}>
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Metric label="Listening Ports" value={ports.length} />
        <Metric label="Processes" value={processCount} />
        <Metric label="Filtered" value={filteredPorts.length} />
      </div>

      <Card className="min-h-0 flex-1 overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-3">
            <span>Listeners</span>
            <div className="relative w-full max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="pl-9"
                placeholder="Filter by port, process, PID, address..."
              />
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="min-h-0 overflow-auto">
          {error && (
            <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          {filteredPorts.length ? (
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
                {filteredPorts.map((item) => (
                  <TableRow
                    key={`${item.protocol}-${item.address}-${item.port}-${item.pid}`}
                  >
                    <TableCell className="font-mono font-medium">
                      {item.port}
                    </TableCell>
                    <TableCell className="font-mono">{item.address}</TableCell>
                    <TableCell>{item.command}</TableCell>
                    <TableCell className="font-mono">{item.pid}</TableCell>
                    <TableCell className="uppercase">{item.protocol}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
              No listening ports match the current filter.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-muted/40 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  )
}
