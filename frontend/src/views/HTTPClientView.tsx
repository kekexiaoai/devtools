import { useMemo, useState, type ReactNode } from 'react'
import { Clock, Copy, History, Loader2, Send } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { SendHTTPRequest } from '@wailsjs/go/backend/App'
import { backend } from '@wailsjs/go/models'
import {
  createHTTPClientHistoryItem,
  formatHTTPHeaders,
  loadHTTPClientHistory,
  parseHTTPHeadersText,
  saveHTTPClientHistory,
  type HTTPClientHistoryItem,
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

  const responseHeadersText = useMemo(() => {
    return response ? formatHTTPHeaders(response.headers) : ''
  }, [response])

  const handleSend = async () => {
    setIsSending(true)
    setError('')
    try {
      const headers = parseHTTPHeadersText(headersText)
      const nextResponse = await SendHTTPRequest(
        new backend.HTTPClientRequest({
          method,
          url,
          headers,
          body,
          timeoutSeconds: Number(timeoutSeconds) || 30,
        })
      )
      setResponse(nextResponse)
      const nextHistory = [
        createHTTPClientHistoryItem(method, url, nextResponse),
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

      <div
        data-testid="http-client-workspace"
        className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[18rem_minmax(440px,0.9fr)_minmax(520px,1.1fr)]"
      >
        <Card
          data-testid="http-history-panel"
          className="min-h-0 overflow-hidden"
        >
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="h-4 w-4" />
              History
            </CardTitle>
          </CardHeader>
          <CardContent className="h-full min-h-0 overflow-auto pb-6">
            {history.length ? (
              <div className="space-y-2">
                {history.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setMethod(item.method as typeof method)
                      setUrl(item.url)
                    }}
                    className="grid w-full gap-1 rounded-md border p-2 text-left text-sm hover:bg-muted"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">
                        {item.method} {item.statusCode}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {item.durationMs} ms
                      </span>
                    </div>
                    <span className="truncate font-mono text-xs text-muted-foreground">
                      {item.url}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
                No requests sent yet.
              </div>
            )}
          </CardContent>
        </Card>

        <Card
          data-testid="http-request-panel"
          className="min-h-0 overflow-hidden"
        >
          <CardHeader className="pb-3">
            <CardTitle>Request</CardTitle>
          </CardHeader>
          <CardContent className="grid h-full min-h-0 grid-rows-[auto_minmax(110px,0.34fr)_minmax(150px,0.66fr)] gap-3 pb-6">
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
            <Textarea
              value={headersText}
              onChange={(event) => setHeadersText(event.target.value)}
              className="h-full min-h-0 resize-none font-mono text-sm"
              placeholder="Header-Name: value"
            />
            <Textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              className="h-full min-h-0 resize-none font-mono text-sm"
              placeholder="Request body..."
            />
          </CardContent>
        </Card>

        <Card
          data-testid="http-response-panel"
          className="min-h-0 overflow-hidden"
        >
          <CardHeader className="pb-3">
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
          <CardContent className="grid h-full min-h-0 grid-rows-[auto_auto_minmax(220px,1fr)] gap-3 pb-6">
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
                  value={responseHeadersText}
                  className="h-28 resize-none font-mono text-xs"
                  placeholder="Response headers"
                />
                <Textarea
                  readOnly
                  value={response.body}
                  data-testid="http-response-body"
                  className="h-full min-h-0 resize-none font-mono text-sm"
                  placeholder="Response body"
                />
              </>
            ) : (
              <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
                Send a request to see the response.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
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
