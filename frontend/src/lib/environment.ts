export interface EnvEntry {
  key: string
  value: string
  line: number
  duplicate: boolean
}

export interface EnvIssue {
  line: number
  message: string
}

export interface EnvParseResult {
  entries: EnvEntry[]
  issues: EnvIssue[]
}

export interface EnvDiffEntry {
  key: string
  left?: string
  right?: string
  type: 'added' | 'removed' | 'changed'
}

const envKeyPattern = /^[A-Za-z_][A-Za-z0-9_]*$/

export function parseEnvText(value: string): EnvParseResult {
  const seen = new Map<string, number>()
  const duplicateKeys = new Set<string>()
  const entries: EnvEntry[] = []
  const issues: EnvIssue[] = []

  value
    .replaceAll('\r\n', '\n')
    .split('\n')
    .forEach((line, index) => {
      const lineNumber = index + 1
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) return

      const withoutExport = trimmed.startsWith('export ')
        ? trimmed.slice('export '.length).trim()
        : trimmed
      const separatorIndex = withoutExport.indexOf('=')
      if (separatorIndex <= 0) {
        issues.push({
          line: lineNumber,
          message: 'Expected KEY=value format.',
        })
        return
      }

      const key = withoutExport.slice(0, separatorIndex).trim()
      if (!envKeyPattern.test(key)) {
        issues.push({
          line: lineNumber,
          message: `Invalid key "${key}".`,
        })
        return
      }

      if (seen.has(key)) {
        duplicateKeys.add(key)
        issues.push({
          line: lineNumber,
          message: `Duplicate key "${key}".`,
        })
      } else {
        seen.set(key, lineNumber)
      }

      entries.push({
        key,
        value: unquoteEnvValue(withoutExport.slice(separatorIndex + 1).trim()),
        line: lineNumber,
        duplicate: false,
      })
    })

  return {
    entries: entries.map((entry) => ({
      ...entry,
      duplicate: duplicateKeys.has(entry.key),
    })),
    issues,
  }
}

export function formatEnvEntries(entries: EnvEntry[]): string {
  return entries
    .slice()
    .sort((left, right) => left.key.localeCompare(right.key))
    .map((entry) => `${entry.key}=${quoteEnvValue(entry.value)}`)
    .join('\n')
}

export function diffEnvEntries(
  leftEntries: EnvEntry[],
  rightEntries: EnvEntry[]
): EnvDiffEntry[] {
  const left = new Map(leftEntries.map((entry) => [entry.key, entry.value]))
  const right = new Map(rightEntries.map((entry) => [entry.key, entry.value]))
  const keys = Array.from(new Set([...left.keys(), ...right.keys()])).sort()

  return keys.flatMap((key): EnvDiffEntry[] => {
    const leftValue = left.get(key)
    const rightValue = right.get(key)
    if (leftValue === rightValue) return []
    if (leftValue === undefined) {
      return [{ key, right: rightValue, type: 'added' as const }]
    }
    if (rightValue === undefined) {
      return [{ key, left: leftValue, type: 'removed' as const }]
    }
    return [
      {
        key,
        left: leftValue,
        right: rightValue,
        type: 'changed' as const,
      },
    ]
  })
}

function unquoteEnvValue(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }
  return value
}

function quoteEnvValue(value: string): string {
  if (!value || /[\s#"'=]/.test(value)) {
    return JSON.stringify(value)
  }
  return value
}
