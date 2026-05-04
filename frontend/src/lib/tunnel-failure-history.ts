const tunnelFailureHistoryKey = 'devtools:tunnel-failure-history'
export const tunnelFailureHistoryLimit = 50

export interface TunnelFailureHistoryEntry {
  id: string
  tunnelId: string
  tunnelName: string
  failedAt: string
  errorMessage: string
  reason: string
  details: string
  suggestions: string[]
}

export function addTunnelFailureHistoryEntry(
  current: TunnelFailureHistoryEntry[],
  entry: TunnelFailureHistoryEntry,
  limit = tunnelFailureHistoryLimit
): TunnelFailureHistoryEntry[] {
  return [entry, ...current].slice(0, limit)
}

export function loadTunnelFailureHistory(): TunnelFailureHistoryEntry[] {
  try {
    const raw = window.localStorage.getItem(tunnelFailureHistoryKey)
    if (!raw) return []
    const parsed = JSON.parse(raw) as TunnelFailureHistoryEntry[]
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isTunnelFailureHistoryEntry)
  } catch {
    return []
  }
}

export function saveTunnelFailureHistory(
  entries: TunnelFailureHistoryEntry[]
): void {
  window.localStorage.setItem(tunnelFailureHistoryKey, JSON.stringify(entries))
}

export function clearTunnelFailureHistory(): void {
  window.localStorage.removeItem(tunnelFailureHistoryKey)
}

function isTunnelFailureHistoryEntry(
  value: unknown
): value is TunnelFailureHistoryEntry {
  if (!value || typeof value !== 'object') return false
  const entry = value as Partial<TunnelFailureHistoryEntry>
  return (
    typeof entry.id === 'string' &&
    typeof entry.tunnelId === 'string' &&
    typeof entry.tunnelName === 'string' &&
    typeof entry.failedAt === 'string' &&
    typeof entry.errorMessage === 'string' &&
    typeof entry.reason === 'string' &&
    typeof entry.details === 'string' &&
    Array.isArray(entry.suggestions)
  )
}
