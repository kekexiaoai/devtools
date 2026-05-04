import { backend } from '@wailsjs/go/models'

export const httpClientHistoryKey = 'devtools-http-client-history'
export const httpClientSavedRequestsKey = 'devtools-http-client-saved-requests'

export interface HTTPClientHistoryItem {
  id: string
  method: string
  url: string
  headersText?: string
  body?: string
  timeoutSeconds?: string
  statusCode: number
  durationMs: number
  createdAt: string
}

export interface HTTPSavedRequest {
  id: string
  name: string
  method: string
  url: string
  headersText: string
  body: string
  timeoutSeconds: string
  updatedAt: string
}

export function parseHTTPHeadersText(value: string): backend.HTTPHeader[] {
  return value
    .replaceAll('\r\n', '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const separatorIndex = line.indexOf(':')
      if (separatorIndex <= 0) {
        throw new Error('Headers must use "Name: value" format.')
      }
      return new backend.HTTPHeader({
        name: line.slice(0, separatorIndex).trim(),
        value: line.slice(separatorIndex + 1).trim(),
      })
    })
}

export function formatHTTPHeaders(headers: backend.HTTPHeader[]): string {
  return headers.map((header) => `${header.name}: ${header.value}`).join('\n')
}

export function loadHTTPClientHistory(): HTTPClientHistoryItem[] {
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(httpClientHistoryKey) ?? '[]'
    ) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isHTTPClientHistoryItem)
  } catch {
    return []
  }
}

export function saveHTTPClientHistory(items: HTTPClientHistoryItem[]) {
  window.localStorage.setItem(
    httpClientHistoryKey,
    JSON.stringify(items.slice(0, 20))
  )
}

export function loadHTTPSavedRequests(): HTTPSavedRequest[] {
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(httpClientSavedRequestsKey) ?? '[]'
    ) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isHTTPSavedRequest)
  } catch {
    return []
  }
}

export function saveHTTPSavedRequests(items: HTTPSavedRequest[]) {
  window.localStorage.setItem(
    httpClientSavedRequestsKey,
    JSON.stringify(items.slice(0, 50))
  )
}

export function createHTTPSavedRequest(input: {
  name: string
  method: string
  url: string
  headersText: string
  body: string
  timeoutSeconds: string
}): HTTPSavedRequest {
  return {
    ...input,
    id: crypto.randomUUID(),
    updatedAt: new Date().toISOString(),
  }
}

export function createHTTPClientHistoryItem(
  method: string,
  url: string,
  response: backend.HTTPClientResponse,
  request?: {
    headersText: string
    body: string
    timeoutSeconds: string
  }
): HTTPClientHistoryItem {
  return {
    id: crypto.randomUUID(),
    method,
    url,
    headersText: request?.headersText,
    body: request?.body,
    timeoutSeconds: request?.timeoutSeconds,
    statusCode: response.statusCode,
    durationMs: response.durationMs,
    createdAt: new Date().toISOString(),
  }
}

function isHTTPClientHistoryItem(
  value: unknown
): value is HTTPClientHistoryItem {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return (
    typeof item.id === 'string' &&
    typeof item.method === 'string' &&
    typeof item.url === 'string' &&
    typeof item.statusCode === 'number' &&
    typeof item.durationMs === 'number' &&
    typeof item.createdAt === 'string'
  )
}

function isHTTPSavedRequest(value: unknown): value is HTTPSavedRequest {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return (
    typeof item.id === 'string' &&
    typeof item.name === 'string' &&
    typeof item.method === 'string' &&
    typeof item.url === 'string' &&
    typeof item.headersText === 'string' &&
    typeof item.body === 'string' &&
    typeof item.timeoutSeconds === 'string' &&
    typeof item.updatedAt === 'string'
  )
}
