import { useMemo, useRef, useState } from 'react'
import { Copy, FileInput, FileText, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import {
  diffEnvEntries,
  formatEnvEntries,
  parseEnvText,
} from '@/lib/environment'

const sampleEnv = [
  'APP_ENV=development',
  'API_URL=https://api.example.com',
  'DEBUG=true',
  'DATABASE_URL="postgres://localhost:5432/devtools"',
].join('\n')

export function EnvironmentView() {
  const [envText, setEnvText] = useState(sampleEnv)
  const [compareText, setCompareText] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const parsed = useMemo(() => parseEnvText(envText), [envText])
  const compareParsed = useMemo(() => parseEnvText(compareText), [compareText])
  const diff = useMemo(
    () => diffEnvEntries(parsed.entries, compareParsed.entries),
    [compareParsed.entries, parsed.entries]
  )
  const normalized = useMemo(
    () => formatEnvEntries(parsed.entries),
    [parsed.entries]
  )

  const loadFile = async (file: File | undefined) => {
    if (!file) return
    setEnvText(await file.text())
    toast.success(`${file.name} loaded.`)
  }

  const copyNormalized = async () => {
    await navigator.clipboard.writeText(normalized)
    toast.success('Normalized .env copied.')
  }

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3 overflow-hidden p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Environment</h1>
          <p className="text-sm text-muted-foreground">
            Parse, inspect, normalize, and compare .env files locally.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".env,text/plain"
            className="hidden"
            onChange={(event) => void loadFile(event.target.files?.[0])}
          />
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
          >
            <FileInput className="mr-2 h-4 w-4" />
            Import
          </Button>
          <Button variant="outline" onClick={() => setEnvText(sampleEnv)}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Sample
          </Button>
          <Button
            onClick={() => void copyNormalized()}
            disabled={!parsed.entries.length}
          >
            <Copy className="mr-2 h-4 w-4" />
            Copy Normalized
          </Button>
        </div>
      </div>

      <div className="grid min-h-0 gap-3 xl:grid-cols-[minmax(420px,0.9fr)_minmax(520px,1.1fr)]">
        <div className="grid min-h-0 grid-rows-2 gap-3">
          <Card className="min-h-0 overflow-hidden">
            <CardHeader>
              <CardTitle>Primary .env</CardTitle>
            </CardHeader>
            <CardContent className="h-full min-h-0">
              <Textarea
                value={envText}
                onChange={(event) => setEnvText(event.target.value)}
                className="h-full min-h-64 resize-none font-mono text-sm"
                placeholder="KEY=value"
              />
            </CardContent>
          </Card>

          <Card className="min-h-0 overflow-hidden">
            <CardHeader>
              <CardTitle>Compare Against</CardTitle>
            </CardHeader>
            <CardContent className="h-full min-h-0">
              <Textarea
                value={compareText}
                onChange={(event) => setCompareText(event.target.value)}
                className="h-full min-h-48 resize-none font-mono text-sm"
                placeholder="Paste another .env file to compare..."
              />
            </CardContent>
          </Card>
        </div>

        <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_minmax(0,0.8fr)] gap-3">
          <div className="grid gap-3 md:grid-cols-3">
            <Metric label="Variables" value={parsed.entries.length} />
            <Metric label="Issues" value={parsed.issues.length} />
            <Metric label="Diffs" value={compareText ? diff.length : 0} />
          </div>

          <Card className="min-h-0 overflow-hidden">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Variables
              </CardTitle>
            </CardHeader>
            <CardContent className="min-h-0 overflow-auto">
              {parsed.entries.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Key</TableHead>
                      <TableHead>Value</TableHead>
                      <TableHead>Line</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsed.entries.map((entry) => (
                      <TableRow key={`${entry.key}-${entry.line}`}>
                        <TableCell className="font-mono font-medium">
                          {entry.key}
                          {entry.duplicate && (
                            <span className="ml-2 rounded bg-destructive/10 px-1.5 py-0.5 text-xs text-destructive">
                              duplicate
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-sm truncate font-mono">
                          {entry.value}
                        </TableCell>
                        <TableCell className="font-mono">
                          {entry.line}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
                  No variables parsed.
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="min-h-0 overflow-hidden">
            <CardHeader>
              <CardTitle>{compareText ? 'Diff' : 'Issues'}</CardTitle>
            </CardHeader>
            <CardContent className="min-h-0 overflow-auto">
              {compareText ? (
                diff.length ? (
                  <div className="space-y-2">
                    {diff.map((entry) => (
                      <div
                        key={entry.key}
                        className="rounded-md border bg-muted/30 p-2 text-sm"
                      >
                        <div className="font-mono font-medium">
                          {entry.key}{' '}
                          <span className="text-xs text-muted-foreground">
                            {entry.type}
                          </span>
                        </div>
                        <div className="mt-1 grid gap-1 font-mono text-xs text-muted-foreground">
                          {entry.left !== undefined && (
                            <div>left: {entry.left}</div>
                          )}
                          {entry.right !== undefined && (
                            <div>right: {entry.right}</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState label="No differences found." />
                )
              ) : parsed.issues.length ? (
                <div className="space-y-2">
                  {parsed.issues.map((issue) => (
                    <div
                      key={`${issue.line}-${issue.message}`}
                      className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive"
                    >
                      Line {issue.line}: {issue.message}
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState label="No issues found." />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
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

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
      {label}
    </div>
  )
}
