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
