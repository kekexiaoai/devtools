const base64Pattern =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

export function encodeBase64Text(value: string): string {
  return bytesToBase64(new TextEncoder().encode(value))
}

export function decodeBase64Text(value: string): string {
  const normalized = value.trim()
  if (!normalized || !base64Pattern.test(normalized)) {
    throw new Error('Invalid Base64 input.')
  }

  try {
    const bytes = base64ToBytes(normalized)
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new Error('Invalid Base64 input.')
  }
}

export function encodeUrlText(value: string): string {
  return encodeURIComponent(value)
}

export function decodeUrlText(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    throw new Error('Invalid URL encoded input.')
  }
}

export type HashAlgorithm = 'MD5' | 'SHA-1' | 'SHA-256' | 'SHA-512'

export async function hashText(
  value: string,
  algorithm: HashAlgorithm
): Promise<string> {
  if (algorithm === 'MD5') {
    return md5(value)
  }

  const digest = await crypto.subtle.digest(
    algorithm,
    new TextEncoder().encode(value)
  )
  return bytesToHex(new Uint8Array(digest))
}

export interface DecodedJwt {
  header: Record<string, unknown>
  payload: Record<string, unknown>
  signature: string
  expiresAt?: string
  expired?: boolean
}

export function decodeJwt(token: string): DecodedJwt {
  const parts = token.trim().split('.')
  if (parts.length !== 3) {
    throw new Error('Invalid JWT input.')
  }

  try {
    const header = JSON.parse(decodeBase64Url(parts[0])) as Record<
      string,
      unknown
    >
    const payload = JSON.parse(decodeBase64Url(parts[1])) as Record<
      string,
      unknown
    >
    const exp = typeof payload.exp === 'number' ? payload.exp : undefined
    return {
      header,
      payload,
      signature: parts[2],
      expiresAt: exp ? new Date(exp * 1000).toISOString() : undefined,
      expired: exp ? Date.now() > exp * 1000 : undefined,
    }
  } catch {
    throw new Error('Invalid JWT input.')
  }
}

export interface TimestampConversion {
  seconds: number
  milliseconds: number
  utc: string
  local: string
}

export type TimestampInputFormat =
  | 'unix-seconds'
  | 'unix-milliseconds'
  | 'iso-8601'
  | 'local-datetime'

export interface TimestampDetails extends TimestampConversion {
  microseconds: string
  nanoseconds: string
  isoUtc: string
  utcDateTime: string
  localDateTime: string
  rfc2822: string
  sqlUtc: string
  sqlLocal: string
  dateUtc: string
  dateLocal: string
  timeUtc: string
  relative: string
  dayOfYearUtc: number
  isoWeek: number
  isLeapYear: boolean
  weekdayUtc: string
  timezoneOffset: string
  timezoneName: string
  yearUtc: number
  monthUtc: number
  quarterUtc: number
}

export function convertUnixTimestamp(value: string): TimestampConversion {
  const trimmed = value.trim()
  if (!/^\d+$/.test(trimmed)) {
    throw new Error('Invalid Unix timestamp.')
  }

  const raw = Number(trimmed)
  const milliseconds = trimmed.length >= 13 ? raw : raw * 1000
  const date = new Date(milliseconds)
  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid Unix timestamp.')
  }

  return {
    seconds: Math.floor(milliseconds / 1000),
    milliseconds,
    utc: date.toISOString(),
    local: date.toLocaleString(),
  }
}

export function convertTimestampInput(
  value: string,
  format: TimestampInputFormat,
  now = new Date()
): TimestampDetails {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error('Invalid timestamp input.')
  }

  const date = parseTimestampInput(trimmed, format)
  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid timestamp input.')
  }

  const milliseconds = date.getTime()
  const seconds = Math.floor(milliseconds / 1000)

  return {
    seconds,
    milliseconds,
    microseconds: (BigInt(milliseconds) * 1000n).toString(),
    nanoseconds: (BigInt(milliseconds) * 1000000n).toString(),
    utc: date.toISOString(),
    local: date.toLocaleString(),
    isoUtc: date.toISOString(),
    utcDateTime: formatUtcDateTime(date),
    localDateTime: formatLocalDateTime(date),
    rfc2822: date.toUTCString(),
    sqlUtc: formatUtcDateTime(date).replace(' UTC', ''),
    sqlLocal: formatLocalDateTime(date),
    dateUtc: formatDateUtc(date),
    dateLocal: formatDateLocal(date),
    timeUtc: formatTimeUtc(date),
    relative: formatRelativeTime(date, now),
    dayOfYearUtc: getDayOfYearUtc(date),
    isoWeek: getIsoWeek(date),
    isLeapYear: isLeapYear(date.getUTCFullYear()),
    weekdayUtc: formatWeekdayUtc(date),
    timezoneOffset: formatTimezoneOffset(date),
    timezoneName: getTimezoneName(),
    yearUtc: date.getUTCFullYear(),
    monthUtc: date.getUTCMonth() + 1,
    quarterUtc: Math.floor(date.getUTCMonth() / 3) + 1,
  }
}

export function generateUuidV4(count: number): string[] {
  const safeCount = Math.min(Math.max(Math.floor(count), 1), 100)
  return Array.from({ length: safeCount }, () => crypto.randomUUID())
}

export interface ParsedUrlDetails {
  href: string
  origin: string
  protocol: string
  username: string
  passwordPresent: boolean
  host: string
  hostname: string
  port: string
  pathname: string
  search: string
  hash: string
  queryParams: Array<{ name: string; value: string }>
}

export function parseUrlText(value: string): ParsedUrlDetails {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error('Invalid URL input.')
  }

  try {
    const url = new URL(trimmed)
    return {
      href: url.href,
      origin: url.origin,
      protocol: url.protocol,
      username: url.username,
      passwordPresent: Boolean(url.password),
      host: url.host,
      hostname: url.hostname,
      port: url.port,
      pathname: url.pathname,
      search: url.search,
      hash: url.hash,
      queryParams: Array.from(url.searchParams.entries()).map(
        ([name, paramValue]) => ({
          name,
          value: paramValue,
        })
      ),
    }
  } catch {
    throw new Error('Invalid URL input.')
  }
}

export interface RegexTestResult {
  pattern: string
  flags: string
  count: number
  matches: Array<{
    match: string
    index: number
    captures: string[]
    namedGroups?: Record<string, string>
  }>
}

export function testRegexText(value: string): RegexTestResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new Error('Regex tester input must be valid JSON.')
  }

  if (!isRegexTesterInput(parsed)) {
    throw new Error(
      'Regex tester input must include string pattern and text fields.'
    )
  }

  const flags = normalizeRegexFlags(parsed.flags ?? '')
  let regex: RegExp
  try {
    regex = new RegExp(
      parsed.pattern,
      flags.includes('g') ? flags : `${flags}g`
    )
  } catch {
    throw new Error('Invalid regular expression.')
  }

  const matches: RegexTestResult['matches'] = []
  let match: RegExpExecArray | null
  while ((match = regex.exec(parsed.text)) !== null) {
    matches.push({
      match: match[0],
      index: match.index,
      captures: match.slice(1),
      namedGroups: match.groups,
    })

    if (match[0] === '') {
      regex.lastIndex += 1
    }
  }

  return {
    pattern: parsed.pattern,
    flags: regex.flags,
    count: matches.length,
    matches,
  }
}

export type TextDiffLineType = 'unchanged' | 'added' | 'removed'

export interface TextDiffLine {
  type: TextDiffLineType
  text: string
  oldLine?: number
  newLine?: number
}

export interface TextDiffResult {
  summary: {
    added: number
    removed: number
    unchanged: number
  }
  lines: TextDiffLine[]
}

export function diffText(value: string): TextDiffResult {
  const normalized = value.replaceAll('\r\n', '\n')
  const delimiter = '\n---\n'
  const delimiterIndex = normalized.indexOf(delimiter)
  if (delimiterIndex === -1) {
    throw new Error(
      'Text diff input must contain a line with --- between old and new text.'
    )
  }

  const oldLines = normalized.slice(0, delimiterIndex).split('\n')
  const newLines = normalized
    .slice(delimiterIndex + delimiter.length)
    .split('\n')
  const lines = buildLineDiff(oldLines, newLines)
  const summary = lines.reduce(
    (acc, line) => {
      acc[line.type] += 1
      return acc
    },
    { added: 0, removed: 0, unchanged: 0 }
  )

  return { summary, lines }
}

export interface JsonPathMatch {
  path: string
  value: unknown
}

export function queryJsonPathText(value: string): JsonPathMatch[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new Error('JSONPath input must be valid JSON.')
  }

  if (!isJsonPathInput(parsed)) {
    throw new Error('JSONPath input must include path and json fields.')
  }

  return queryJsonPath(parsed.json, parsed.path)
}

export type JsonDiffType = 'added' | 'removed' | 'changed'

export interface JsonDiffEntry {
  path: string
  type: JsonDiffType
  before?: unknown
  after?: unknown
}

export function diffJsonText(value: string): JsonDiffEntry[] {
  const normalized = value.replaceAll('\r\n', '\n')
  const delimiter = '\n---\n'
  const delimiterIndex = normalized.indexOf(delimiter)
  if (delimiterIndex === -1) {
    throw new Error(
      'JSON diff input must contain a line with --- between old and new JSON.'
    )
  }

  let before: unknown
  let after: unknown
  try {
    before = JSON.parse(normalized.slice(0, delimiterIndex))
    after = JSON.parse(normalized.slice(delimiterIndex + delimiter.length))
  } catch {
    throw new Error('JSON diff input must contain valid JSON documents.')
  }

  const changes: JsonDiffEntry[] = []
  collectJsonDiff('$', before, after, changes)
  return changes
}

export interface CronParseResult {
  expression: string
  description: string
  nextRuns: string[]
}

export function parseCronExpression(
  expression: string,
  now = new Date()
): CronParseResult {
  const trimmed = expression.trim()
  const parts = trimmed.split(/\s+/)
  if (parts.length !== 5) {
    throw new Error('Cron expression must contain 5 fields.')
  }

  const [minuteRaw, hourRaw, dayRaw, monthRaw, weekdayRaw] = parts
  const minute = parseCronField(minuteRaw, 0, 59)
  const hour = parseCronField(hourRaw, 0, 23)
  const day = parseCronField(dayRaw, 1, 31)
  const month = parseCronField(monthRaw, 1, 12)
  const weekday = parseCronField(weekdayRaw, 0, 7)

  const cursor = new Date(now)
  cursor.setUTCSeconds(0, 0)
  const nextRuns: string[] = []
  const maxChecks = 366 * 24 * 60

  for (let checked = 0; checked < maxChecks && nextRuns.length < 5; checked++) {
    const normalizedWeekday = cursor.getUTCDay()
    if (
      minute.has(cursor.getUTCMinutes()) &&
      hour.has(cursor.getUTCHours()) &&
      day.has(cursor.getUTCDate()) &&
      month.has(cursor.getUTCMonth() + 1) &&
      (weekday.has(normalizedWeekday) ||
        (normalizedWeekday === 0 && weekday.has(7)))
    ) {
      nextRuns.push(cursor.toISOString())
    }
    cursor.setUTCMinutes(cursor.getUTCMinutes() + 1)
  }

  return {
    expression: trimmed,
    description: describeCronExpression(parts),
    nextRuns,
  }
}

export function yamlToJsonText(value: string): string {
  const parsed = parseSimpleYaml(value)
  return JSON.stringify(parsed, null, 2)
}

function parseTimestampInput(
  value: string,
  format: TimestampInputFormat
): Date {
  switch (format) {
    case 'unix-seconds':
      return parseEpochNumber(value, 1000)
    case 'unix-milliseconds':
      return parseEpochNumber(value, 1)
    case 'iso-8601':
      return new Date(value)
    case 'local-datetime':
      return parseLocalDateTime(value)
  }
}

function parseEpochNumber(value: string, multiplier: number): Date {
  if (!/^-?\d+(?:\.\d+)?$/.test(value)) {
    return new Date(Number.NaN)
  }

  const raw = Number(value)
  return Number.isFinite(raw)
    ? new Date(raw * multiplier)
    : new Date(Number.NaN)
}

function parseLocalDateTime(value: string): Date {
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/
  )
  if (!match) {
    return new Date(Number.NaN)
  }

  const [, year, month, day, hour = '0', minute = '0', second = '0'] = match
  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second)
  )
}

function formatUtcDateTime(date: Date): string {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(
    date.getUTCDate()
  )} ${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}:${pad2(
    date.getUTCSeconds()
  )} UTC`
}

function formatLocalDateTime(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(
    date.getDate()
  )} ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(
    date.getSeconds()
  )}`
}

function formatDateUtc(date: Date): string {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(
    date.getUTCDate()
  )}`
}

function formatDateLocal(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(
    date.getDate()
  )}`
}

function formatTimeUtc(date: Date): string {
  return `${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}:${pad2(
    date.getUTCSeconds()
  )}`
}

function formatWeekdayUtc(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'long',
  }).format(date)
}

function formatRelativeTime(date: Date, now: Date): string {
  const diffMs = date.getTime() - now.getTime()
  const absMs = Math.abs(diffMs)
  if (absMs < 500) {
    return 'now'
  }

  const units = [
    ['year', 365 * 24 * 60 * 60 * 1000],
    ['month', 30 * 24 * 60 * 60 * 1000],
    ['day', 24 * 60 * 60 * 1000],
    ['hour', 60 * 60 * 1000],
    ['minute', 60 * 1000],
    ['second', 1000],
  ] as const

  for (const [unit, size] of units) {
    if (absMs >= size || unit === 'second') {
      const amount = Math.max(1, Math.round(absMs / size))
      const label = amount === 1 ? unit : `${unit}s`
      return diffMs < 0 ? `${amount} ${label} ago` : `in ${amount} ${label}`
    }
  }

  return 'now'
}

function getDayOfYearUtc(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1)
  const current = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate()
  )
  return Math.floor((current - start) / 86400000) + 1
}

function getIsoWeek(date: Date): number {
  const utcDate = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  )
  const day = utcDate.getUTCDay() || 7
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1))
  return Math.ceil(
    ((utcDate.getTime() - yearStart.getTime()) / 86400000 + 1) / 7
  )
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
}

function formatTimezoneOffset(date: Date): string {
  const offsetMinutes = -date.getTimezoneOffset()
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const abs = Math.abs(offsetMinutes)
  return `UTC${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`
}

function getTimezoneName(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local'
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary)
}

function decodeBase64Url(value: string): string {
  const padded = value.padEnd(
    value.length + ((4 - (value.length % 4)) % 4),
    '='
  )
  const base64 = padded.replaceAll('-', '+').replaceAll('_', '/')
  const bytes = base64ToBytes(base64)
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function md5(value: string): string {
  const bytes = new TextEncoder().encode(value)
  const bitLength = bytes.length * 8
  const paddedLength = (((bytes.length + 8) >> 6) + 1) << 6
  const padded = new Uint8Array(paddedLength)
  padded.set(bytes)
  padded[bytes.length] = 0x80
  const view = new DataView(padded.buffer)
  view.setUint32(paddedLength - 8, bitLength, true)

  let a = 0x67452301
  let b = 0xefcdab89
  let c = 0x98badcfe
  let d = 0x10325476

  for (let offset = 0; offset < padded.length; offset += 64) {
    const m = Array.from({ length: 16 }, (_, index) =>
      view.getUint32(offset + index * 4, true)
    )
    let aa = a
    let bb = b
    let cc = c
    let dd = d

    for (let i = 0; i < 64; i += 1) {
      let f = 0
      let g = 0
      if (i < 16) {
        f = (bb & cc) | (~bb & dd)
        g = i
      } else if (i < 32) {
        f = (dd & bb) | (~dd & cc)
        g = (5 * i + 1) % 16
      } else if (i < 48) {
        f = bb ^ cc ^ dd
        g = (3 * i + 5) % 16
      } else {
        f = cc ^ (bb | ~dd)
        g = (7 * i) % 16
      }
      const next = dd
      dd = cc
      cc = bb
      bb = add32(
        bb,
        rotateLeft(add32(add32(aa, f), add32(md5K[i], m[g])), md5S[i])
      )
      aa = next
    }

    a = add32(a, aa)
    b = add32(b, bb)
    c = add32(c, cc)
    d = add32(d, dd)
  }

  return [a, b, c, d]
    .map((word) =>
      [0, 8, 16, 24]
        .map((shift) => ((word >>> shift) & 0xff).toString(16).padStart(2, '0'))
        .join('')
    )
    .join('')
}

const md5S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5,
  9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11,
  16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15,
  21,
]

const md5K = Array.from({ length: 64 }, (_, index) =>
  Math.floor(Math.abs(Math.sin(index + 1)) * 2 ** 32)
)

function add32(a: number, b: number): number {
  return (a + b) >>> 0
}

function rotateLeft(value: number, shift: number): number {
  return (value << shift) | (value >>> (32 - shift))
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function isRegexTesterInput(value: unknown): value is {
  pattern: string
  flags?: string
  text: string
} {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.pattern === 'string' &&
    typeof candidate.text === 'string' &&
    (candidate.flags === undefined || typeof candidate.flags === 'string')
  )
}

function normalizeRegexFlags(flags: string): string {
  const allowed = new Set(['d', 'g', 'i', 'm', 's', 'u', 'v', 'y'])
  const seen = new Set<string>()
  let normalized = ''

  for (const flag of flags) {
    if (!allowed.has(flag)) {
      throw new Error('Invalid regular expression flags.')
    }
    if (seen.has(flag)) {
      throw new Error('Invalid regular expression flags.')
    }
    seen.add(flag)
    normalized += flag
  }

  return normalized
}

function buildLineDiff(oldLines: string[], newLines: string[]): TextDiffLine[] {
  const table = buildLcsTable(oldLines, newLines)
  const lines: TextDiffLine[] = []
  let oldIndex = 0
  let newIndex = 0

  while (oldIndex < oldLines.length && newIndex < newLines.length) {
    if (oldLines[oldIndex] === newLines[newIndex]) {
      lines.push({
        type: 'unchanged',
        oldLine: oldIndex + 1,
        newLine: newIndex + 1,
        text: oldLines[oldIndex],
      })
      oldIndex += 1
      newIndex += 1
    } else if (table[oldIndex + 1][newIndex] >= table[oldIndex][newIndex + 1]) {
      lines.push({
        type: 'removed',
        oldLine: oldIndex + 1,
        text: oldLines[oldIndex],
      })
      oldIndex += 1
    } else {
      lines.push({
        type: 'added',
        newLine: newIndex + 1,
        text: newLines[newIndex],
      })
      newIndex += 1
    }
  }

  while (oldIndex < oldLines.length) {
    lines.push({
      type: 'removed',
      oldLine: oldIndex + 1,
      text: oldLines[oldIndex],
    })
    oldIndex += 1
  }

  while (newIndex < newLines.length) {
    lines.push({
      type: 'added',
      newLine: newIndex + 1,
      text: newLines[newIndex],
    })
    newIndex += 1
  }

  return lines
}

function buildLcsTable(oldLines: string[], newLines: string[]): number[][] {
  const table = Array.from({ length: oldLines.length + 1 }, () =>
    Array.from({ length: newLines.length + 1 }, () => 0)
  )

  for (let oldIndex = oldLines.length - 1; oldIndex >= 0; oldIndex -= 1) {
    for (let newIndex = newLines.length - 1; newIndex >= 0; newIndex -= 1) {
      table[oldIndex][newIndex] =
        oldLines[oldIndex] === newLines[newIndex]
          ? table[oldIndex + 1][newIndex + 1] + 1
          : Math.max(
              table[oldIndex + 1][newIndex],
              table[oldIndex][newIndex + 1]
            )
    }
  }

  return table
}

function isJsonPathInput(value: unknown): value is {
  path: string
  json: unknown
} {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.path === 'string' && 'json' in candidate
}

function queryJsonPath(json: unknown, path: string): JsonPathMatch[] {
  if (!path.startsWith('$')) {
    throw new Error('JSONPath must start with $.')
  }

  const tokens = parseJsonPathTokens(path)
  let matches: JsonPathMatch[] = [{ path: '$', value: json }]

  for (const token of tokens) {
    matches = matches.flatMap((match) => expandJsonPathMatch(match, token))
  }

  return matches
}

type JsonPathToken =
  | { type: 'property'; key: string }
  | { type: 'index'; index: number }
  | { type: 'wildcard' }

function parseJsonPathTokens(path: string): JsonPathToken[] {
  const tokens: JsonPathToken[] = []
  let index = 1

  while (index < path.length) {
    if (path[index] === '.') {
      const match = path.slice(index).match(/^\.([A-Za-z_$][\w$-]*)/)
      if (!match) throw new Error('Unsupported JSONPath syntax.')
      tokens.push({ type: 'property', key: match[1] })
      index += match[0].length
      continue
    }

    if (path[index] === '[') {
      const match = path.slice(index).match(/^\[(\*|\d+)\]/)
      if (!match) throw new Error('Unsupported JSONPath syntax.')
      tokens.push(
        match[1] === '*'
          ? { type: 'wildcard' }
          : { type: 'index', index: Number(match[1]) }
      )
      index += match[0].length
      continue
    }

    throw new Error('Unsupported JSONPath syntax.')
  }

  return tokens
}

function expandJsonPathMatch(
  match: JsonPathMatch,
  token: JsonPathToken
): JsonPathMatch[] {
  if (token.type === 'property') {
    if (!isRecord(match.value) || !(token.key in match.value)) return []
    return [
      {
        path: `${match.path}.${token.key}`,
        value: match.value[token.key],
      },
    ]
  }

  if (token.type === 'index') {
    if (!Array.isArray(match.value) || token.index >= match.value.length) {
      return []
    }
    return [
      {
        path: `${match.path}[${token.index}]`,
        value: match.value[token.index],
      },
    ]
  }

  if (Array.isArray(match.value)) {
    return (match.value as unknown[]).map((item, itemIndex) => ({
      path: `${match.path}[${itemIndex}]`,
      value: item,
    }))
  }

  if (isRecord(match.value)) {
    return Object.entries(match.value).map(([key, item]) => ({
      path: `${match.path}.${key}`,
      value: item,
    }))
  }

  return []
}

function collectJsonDiff(
  path: string,
  before: unknown,
  after: unknown,
  changes: JsonDiffEntry[]
) {
  if (deepEqual(before, after)) return

  if (before === undefined) {
    changes.push({ path, type: 'added', after })
    return
  }
  if (after === undefined) {
    changes.push({ path, type: 'removed', before })
    return
  }

  if (isRecord(before) && isRecord(after)) {
    const keys = Array.from(
      new Set([...Object.keys(before), ...Object.keys(after)])
    ).sort()
    keys.forEach((key) => {
      collectJsonDiff(`${path}.${key}`, before[key], after[key], changes)
    })
    return
  }

  if (Array.isArray(before) && Array.isArray(after)) {
    const maxLength = Math.max(before.length, after.length)
    for (let index = 0; index < maxLength; index += 1) {
      collectJsonDiff(`${path}[${index}]`, before[index], after[index], changes)
    }
    return
  }

  changes.push({ path, type: 'changed', before, after })
}

function deepEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function parseCronField(value: string, min: number, max: number): Set<number> {
  const result = new Set<number>()

  value.split(',').forEach((part) => {
    const trimmed = part.trim()
    if (!trimmed) return

    const [rangePart, stepPart] = trimmed.split('/')
    const step = stepPart ? Number(stepPart) : 1
    if (!Number.isInteger(step) || step <= 0) {
      throw new Error('Invalid cron step value.')
    }

    let start = min
    let end = max
    if (rangePart !== '*') {
      if (rangePart.includes('-')) {
        const [rawStart, rawEnd] = rangePart.split('-').map(Number)
        start = rawStart
        end = rawEnd
      } else {
        start = Number(rangePart)
        end = Number(rangePart)
      }
    }

    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < min ||
      end > max ||
      start > end
    ) {
      throw new Error('Invalid cron field value.')
    }

    for (let current = start; current <= end; current += step) {
      result.add(current)
    }
  })

  if (result.size === 0) {
    throw new Error('Invalid cron field value.')
  }
  return result
}

function describeCronExpression(parts: string[]): string {
  const [minute, hour, day, month, weekday] = parts
  const phrases = [describeCronMinute(minute)]

  if (hour !== '*') phrases.push(describeCronHour(hour))
  if (day !== '*') phrases.push(`on day ${day} of the month`)
  if (month !== '*') phrases.push(`in month ${month}`)
  if (weekday !== '*') phrases.push(describeCronWeekday(weekday))

  return `At ${phrases.filter(Boolean).join(' ')}`
}

function describeCronMinute(value: string): string {
  if (value === '*') return 'every minute'
  if (value.startsWith('*/')) return `every ${value.slice(2)}th minute`
  return `minute ${value}`
}

function describeCronHour(value: string): string {
  if (value.includes('-')) {
    const [start, end] = value.split('-')
    return `during hours ${start} through ${end}`
  }
  return `during hour ${value}`
}

function describeCronWeekday(value: string): string {
  const names = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ]
  if (/^\d+$/.test(value)) {
    const day = Number(value) % 7
    return `on ${names[day]}`
  }
  return `on weekday ${value}`
}

function parseSimpleYaml(value: string): Record<string, unknown> {
  const root: Record<string, unknown> = {}
  let currentArrayKey: string | null = null

  value
    .replaceAll('\r\n', '\n')
    .split('\n')
    .forEach((line) => {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) return

      if (trimmed.startsWith('- ')) {
        if (!currentArrayKey) {
          throw new Error('YAML array item must belong to a key.')
        }
        const currentValue = root[currentArrayKey]
        if (!Array.isArray(currentValue)) {
          throw new Error('YAML array parent is invalid.')
        }
        currentValue.push(parseYamlScalar(trimmed.slice(2)))
        return
      }

      const separatorIndex = trimmed.indexOf(':')
      if (separatorIndex === -1) {
        throw new Error('Unsupported YAML syntax.')
      }

      const key = trimmed.slice(0, separatorIndex).trim()
      const rawValue = trimmed.slice(separatorIndex + 1).trim()
      if (!key) {
        throw new Error('Unsupported YAML syntax.')
      }

      if (!rawValue) {
        root[key] = []
        currentArrayKey = key
      } else {
        root[key] = parseYamlScalar(rawValue)
        currentArrayKey = null
      }
    })

  return root
}

function parseYamlScalar(value: string): unknown {
  const trimmed = value.trim()
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false
  if (trimmed === 'null') return null
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed)
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
