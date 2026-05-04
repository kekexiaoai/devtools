import { useMemo, useState, type ReactNode } from 'react'
import {
  ChevronDown,
  Clock,
  Copy,
  History,
  Loader2,
  Save,
  Send,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { SendHTTPRequest } from '@wailsjs/go/backend/App'
import { backend } from '@wailsjs/go/models'
import { applyEnvTemplate, loadPrimaryEnvEntries } from '@/lib/environment'
import {
  createHTTPClientHistoryItem,
  createHTTPSavedRequest,
  formatHTTPHeaders,
  loadHTTPClientHistory,
  loadHTTPSavedRequests,
  parseHTTPHeadersText,
  saveHTTPClientHistory,
  saveHTTPSavedRequests,
  type HTTPClientHistoryItem,
  type HTTPSavedRequest,
} from '@/lib/http-client'

const httpMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'] as const

export function HTTPClientView() {
  const [method, setMethod] = useState<(typeof httpMethods)[number]>('GET')
  const [url, setUrl] = useState('https://httpbin.org/get')
  const [headersText, setHeadersText] = useState('Accept: application/json')
  const [body, setBody] = useState('')
  const [timeoutSeconds, setTimeoutSeconds] = useState('30')
  const [response, setResponse] = useState<backend.HTTPClientResponse | null>(
    null
  )
  const [error, setError] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [history, setHistory] = useState<HTTPClientHistoryItem[]>(() =>
    loadHTTPClientHistory()
  )
  const [savedRequests, setSavedRequests] = useState<HTTPSavedRequest[]>(() =>
    loadHTTPSavedRequests()
  )
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [isRequestHeadersOpen, setIsRequestHeadersOpen] = useState(false)
  const [isRequestBodyOpen, setIsRequestBodyOpen] = useState(false)
  const [isResponseHeadersOpen, setIsResponseHeadersOpen] = useState(false)
  const [selectedHistoryItem, setSelectedHistoryItem] =
    useState<HTTPClientHistoryItem | null>(null)

  const responseHeadersText = useMemo(() => {
    return response ? formatHTTPHeaders(response.headers) : ''
  }, [response])

  const handleSend = async () => {
    setIsSending(true)
    setError('')
    try {
      const envEntries = loadPrimaryEnvEntries()
      const renderedUrl = applyEnvTemplate(url, envEntries)
      const renderedHeadersText = applyEnvTemplate(headersText, envEntries)
      const renderedBody = applyEnvTemplate(body, envEntries)
      const headers = parseHTTPHeadersText(renderedHeadersText)
      const nextResponse = await SendHTTPRequest(
        new backend.HTTPClientRequest({
          method,
          url: renderedUrl,
          headers,
          body: renderedBody,
          timeoutSeconds: Number(timeoutSeconds) || 30,
        })
      )
      setResponse(nextResponse)
      const nextHistory = [
        createHTTPClientHistoryItem(method, url, nextResponse, {
          headersText,
          body,
          timeoutSeconds,
        }),
        ...history,
      ].slice(0, 20)
      setHistory(nextHistory)
      saveHTTPClientHistory(nextHistory)
    } catch (caught) {
      setResponse(null)
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setIsSending(false)
    }
  }

  const copyResponse = async () => {
    if (!response) return
    await navigator.clipboard.writeText(response.body)
    toast.success('Response body copied.')
  }

  const saveCurrentRequest = () => {
    const saved = createHTTPSavedRequest({
      name: `${method} ${url}`,
      method,
      url,
      headersText,
      body,
      timeoutSeconds,
    })
    const nextSavedRequests = [
      saved,
      ...savedRequests.filter(
        (item) => !(item.method === method && item.url === url)
      ),
    ].slice(0, 50)
    setSavedRequests(nextSavedRequests)
    saveHTTPSavedRequests(nextSavedRequests)
    toast.success('Request saved.')
  }

  const loadHistoryItem = () => {
    if (!selectedHistoryItem) return
    setMethod(selectedHistoryItem.method as typeof method)
    setUrl(selectedHistoryItem.url)
    setHeadersText(selectedHistoryItem.headersText ?? '')
    setBody(selectedHistoryItem.body ?? '')
    setTimeoutSeconds(selectedHistoryItem.timeoutSeconds ?? '30')
    setIsRequestHeadersOpen(Boolean(selectedHistoryItem.headersText))
    setIsRequestBodyOpen(Boolean(selectedHistoryItem.body))
    setSelectedHistoryItem(null)
    setIsHistoryOpen(false)
  }

  const loadSavedRequest = (item: HTTPSavedRequest) => {
    setMethod(item.method as typeof method)
    setUrl(item.url)
    setHeadersText(item.headersText)
    setBody(item.body)
    setTimeoutSeconds(item.timeoutSeconds)
    setIsRequestHeadersOpen(Boolean(item.headersText))
    setIsRequestBodyOpen(Boolean(item.body))
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">HTTP Client</h1>
          <p className="text-sm text-muted-foreground">
            Send HTTP requests through the desktop backend.
          </p>
        </div>
        <Button onClick={() => void handleSend()} disabled={isSending || !url}>
          {isSending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Send className="mr-2 h-4 w-4" />
          )}
          Send
        </Button>
      </div>

      <Collapsible
        open={isHistoryOpen}
        onOpenChange={setIsHistoryOpen}
        className="shrink-0 rounded-md border bg-muted/20"
      >
        <CollapsibleTrigger asChild>
          <button
            data-testid="http-history-trigger"
            className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted/50"
          >
            <span className="flex items-center gap-2 font-medium">
              <History className="h-4 w-4" />
              History
              <span className="text-xs text-muted-foreground">
                {history.length} saved
              </span>
            </span>
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform ${
                isHistoryOpen ? 'rotate-180' : ''
              }`}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div
            data-testid="http-history-panel"
            className="max-h-44 overflow-auto border-t p-2"
          >
            {history.length ? (
              <div
                data-testid="http-history-list"
                className="min-w-[720px] divide-y rounded-md border bg-background"
              >
                <div className="grid grid-cols-[6rem_5rem_6rem_minmax(0,1fr)_10rem] gap-3 px-3 py-2 text-xs font-medium uppercase text-muted-foreground">
                  <span>Method</span>
                  <span>Status</span>
                  <span>Duration</span>
                  <span>URL</span>
                  <span>Time</span>
                </div>
                {history.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedHistoryItem(item)}
                    className="grid w-full grid-cols-[6rem_5rem_6rem_minmax(0,1fr)_10rem] gap-3 px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    <span className="font-medium">{item.method}</span>
                    <span className="font-mono">{item.statusCode}</span>
                    <span className="font-mono text-muted-foreground">
                      {item.durationMs} ms
                    </span>
                    <span className="truncate font-mono text-xs text-muted-foreground">
                      {item.url}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {new Date(item.createdAt).toLocaleString()}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="rounded-md border bg-background p-3 text-sm text-muted-foreground">
                No requests sent yet.
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      <div
        data-testid="http-client-workspace"
        className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(460px,0.95fr)_minmax(560px,1.05fr)]"
      >
        <Card
          data-testid="http-request-panel"
          className="min-h-0 gap-0 overflow-hidden py-0"
        >
          <CardHeader
            data-testid="http-request-panel-header"
            className="border-b px-4 py-3"
          >
            <CardTitle className="flex items-center justify-between gap-3">
              <span>Request</span>
              <Button
                variant="outline"
                size="sm"
                onClick={saveCurrentRequest}
                disabled={!url}
              >
                <Save className="mr-2 h-4 w-4" />
                Save Request
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex h-full min-h-0 flex-col gap-2 p-4">
            {savedRequests.length > 0 && (
              <div
                data-testid="http-saved-requests"
                className="max-h-24 overflow-auto rounded-md border bg-muted/20 p-1"
              >
                {savedRequests.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => loadSavedRequest(item)}
                    className="flex w-full items-center justify-between gap-3 rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
                  >
                    <span className="truncate font-medium">{item.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {new Date(item.updatedAt).toLocaleDateString()}
                    </span>
                  </button>
                ))}
              </div>
            )}
            <div className="grid gap-2 md:grid-cols-[8rem_1fr_5rem]">
              <select
                value={method}
                onChange={(event) =>
                  setMethod(event.target.value as typeof method)
                }
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {httpMethods.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
              <Input
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://api.example.com/resource"
              />
              <Input
                value={timeoutSeconds}
                onChange={(event) => setTimeoutSeconds(event.target.value)}
                inputMode="numeric"
                placeholder="30"
                title="Timeout seconds"
              />
            </div>
            <CompactSection
              open={isRequestHeadersOpen}
              onOpenChange={setIsRequestHeadersOpen}
              title="Request Headers"
              summary={
                headersText
                  ? `${headersText.split('\n').length} lines`
                  : 'empty'
              }
              triggerTestId="http-request-headers-trigger"
            >
              <Textarea
                value={headersText}
                onChange={(event) => setHeadersText(event.target.value)}
                className="h-28 resize-none font-mono text-sm"
                placeholder="Header-Name: value"
              />
            </CompactSection>
            <CompactSection
              open={isRequestBodyOpen}
              onOpenChange={setIsRequestBodyOpen}
              title="Request Body"
              summary={body ? `${body.length} bytes` : 'empty'}
              triggerTestId="http-request-body-trigger"
            >
              <Textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                className="h-48 resize-none font-mono text-sm"
                placeholder="Request body..."
              />
            </CompactSection>
          </CardContent>
        </Card>

        <Card
          data-testid="http-response-panel"
          className="min-h-0 gap-0 overflow-hidden py-0"
        >
          <CardHeader
            data-testid="http-response-panel-header"
            className="border-b px-4 py-3"
          >
            <CardTitle className="flex items-center justify-between gap-3">
              <span>Response</span>
              {response && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void copyResponse()}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Copy Body
                </Button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex h-full min-h-0 flex-col gap-2 p-4">
            {error && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
            {response ? (
              <>
                <div className="grid gap-2 md:grid-cols-3">
                  <Metric label="Status" value={response.status} />
                  <Metric
                    label="Duration"
                    value={`${response.durationMs} ms`}
                    icon={<Clock className="h-4 w-4" />}
                  />
                  <Metric label="Size" value={`${response.sizeBytes} bytes`} />
                </div>
                <Textarea
                  readOnly
                  value={response.body}
                  data-testid="http-response-body"
                  className="min-h-0 flex-1 resize-none font-mono text-sm"
                  placeholder="Response body"
                />
                <CompactSection
                  open={isResponseHeadersOpen}
                  onOpenChange={setIsResponseHeadersOpen}
                  title="Response Headers"
                  summary={`${response.headers.length} headers`}
                >
                  <Textarea
                    readOnly
                    value={responseHeadersText}
                    className="h-28 resize-none font-mono text-xs"
                    placeholder="Response headers"
                  />
                </CompactSection>
              </>
            ) : (
              <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
                Send a request to see the response.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={!!selectedHistoryItem}
        onOpenChange={(open) => {
          if (!open) setSelectedHistoryItem(null)
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Replay Request</DialogTitle>
            <DialogDescription>
              Review the saved request before loading it into the editor.
            </DialogDescription>
          </DialogHeader>
          {selectedHistoryItem && (
            <div className="grid gap-3">
              <div className="grid gap-2 rounded-md border bg-muted/30 p-3 text-sm">
                <HistoryDetailRow
                  label="Method"
                  value={selectedHistoryItem.method}
                />
                <HistoryDetailRow
                  label="Status"
                  value={String(selectedHistoryItem.statusCode)}
                />
                <HistoryDetailRow
                  label="Duration"
                  value={`${selectedHistoryItem.durationMs} ms`}
                />
                <HistoryDetailRow
                  label="Time"
                  value={new Date(
                    selectedHistoryItem.createdAt
                  ).toLocaleString()}
                />
                <div className="grid gap-1">
                  <span className="text-xs font-medium text-muted-foreground">
                    URL
                  </span>
                  <span className="break-all font-mono text-sm">
                    {selectedHistoryItem.url}
                  </span>
                </div>
              </div>
              {(selectedHistoryItem.headersText ||
                selectedHistoryItem.body) && (
                <div className="grid gap-2 md:grid-cols-2">
                  <Textarea
                    readOnly
                    value={selectedHistoryItem.headersText ?? ''}
                    className="h-32 resize-none font-mono text-xs"
                    placeholder="No saved request headers."
                  />
                  <Textarea
                    readOnly
                    value={selectedHistoryItem.body ?? ''}
                    className="h-32 resize-none font-mono text-xs"
                    placeholder="No saved request body."
                  />
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSelectedHistoryItem(null)}
            >
              Cancel
            </Button>
            <Button onClick={loadHistoryItem}>Load Request</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function HistoryDetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-3">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="truncate font-mono text-sm">{value}</span>
    </div>
  )
}

function CompactSection({
  children,
  onOpenChange,
  open,
  summary,
  title,
  triggerTestId,
}: {
  children: ReactNode
  onOpenChange: (open: boolean) => void
  open: boolean
  summary: string
  title: string
  triggerTestId?: string
}) {
  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          data-testid={triggerTestId}
          className="flex h-9 w-full items-center justify-between gap-3 rounded-md border bg-muted/20 px-3 text-left text-sm hover:bg-muted/50"
        >
          <span className="font-medium">{title}</span>
          <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
            <span className="truncate">{summary}</span>
            <ChevronDown
              className={`h-4 w-4 shrink-0 transition-transform ${
                open ? 'rotate-180' : ''
              }`}
            />
          </span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2">{children}</CollapsibleContent>
    </Collapsible>
  )
}

function Metric({
  icon,
  label,
  value,
}: {
  icon?: ReactNode
  label: string
  value: string
}) {
  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 truncate font-mono text-sm font-medium">{value}</div>
    </div>
  )
}
