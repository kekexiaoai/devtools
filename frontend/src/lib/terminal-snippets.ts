const terminalSnippetsStorageKey = 'devtools:terminal-snippets'

export interface TerminalSnippet {
  id: string
  name: string
  command: string
}

export const defaultTerminalSnippets: TerminalSnippet[] = [
  { id: 'default-list', name: 'List Files', command: 'ls -la' },
  { id: 'default-disk', name: 'Disk Usage', command: 'df -h' },
  { id: 'default-ports', name: 'Listening Ports', command: 'lsof -i -P -n' },
]

export function createTerminalSnippet(
  name: string,
  command: string
): TerminalSnippet {
  return {
    id: `snippet-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: name.trim(),
    command: command.trim(),
  }
}

export function normalizeTerminalSnippets(
  snippets: unknown
): TerminalSnippet[] {
  if (!Array.isArray(snippets)) return []

  return snippets
    .filter(isTerminalSnippetLike)
    .map((snippet) => ({
      id: snippet.id.trim(),
      name: snippet.name.trim(),
      command: snippet.command.trim(),
    }))
    .filter((snippet) => snippet.id && snippet.name && snippet.command)
}

export function updateTerminalSnippet(
  snippets: TerminalSnippet[],
  nextSnippet: TerminalSnippet
): TerminalSnippet[] {
  return snippets.map((snippet) =>
    snippet.id === nextSnippet.id ? nextSnippet : snippet
  )
}

export function deleteTerminalSnippet(
  snippets: TerminalSnippet[],
  id: string
): TerminalSnippet[] {
  return snippets.filter((snippet) => snippet.id !== id)
}

export function loadTerminalSnippets(): TerminalSnippet[] {
  try {
    const raw = window.localStorage.getItem(terminalSnippetsStorageKey)
    if (!raw) return defaultTerminalSnippets
    const snippets = normalizeTerminalSnippets(JSON.parse(raw))
    return snippets.length > 0 ? snippets : defaultTerminalSnippets
  } catch {
    return defaultTerminalSnippets
  }
}

export function saveTerminalSnippets(snippets: TerminalSnippet[]): void {
  window.localStorage.setItem(
    terminalSnippetsStorageKey,
    JSON.stringify(normalizeTerminalSnippets(snippets))
  )
}

function isTerminalSnippetLike(value: unknown): value is TerminalSnippet {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.command === 'string'
  )
}
