import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// 从 Wails 自动生成的文件中导入 LogFromFrontend 和 LogEntry 类型
import { LogFromFrontend } from '@wailsjs/go/backend/App'
import { types } from '@wailsjs/go/models'

type LogLevel = 'INFO' | 'WARN' | 'ERROR'

export function logToServer(
  level: LogLevel,
  message: string,
  ...optionalParams: unknown[]
) {
  const consoleMethod =
    console[level.toLocaleLowerCase() as 'info' | 'warn' | 'error'] ||
    console.log

  consoleMethod(message, ...optionalParams)

  const fullMessage = [
    message,
    ...optionalParams.map((p) => {
      try {
        return JSON.stringify(p, null, 2)
      } catch {
        return String(p)
      }
    }),
  ].join(' ')

  if (window.go) {
    const entry = new types.LogEntry({
      timestamp: new Date().toISOString(),
      level: level,
      message: fullMessage,
    })

    void LogFromFrontend(entry)
  }
}

// A simple debounce utility to prevent excessive calls
export function _debounce<A extends unknown[], R>(
  func: (...args: A) => R,
  wait: number
): (...args: A) => void {
  let timeout: NodeJS.Timeout
  return function executedFunction(...args: A) {
    const later = () => func(...args)
    clearTimeout(timeout)
    timeout = setTimeout(later, wait)
  }
}

/**
 * Creates a debounced function that delays invoking `func` until after `wait`
 * milliseconds have elapsed since the last time the debounced function was
 * invoked. The debounced function comes with options to invoke `func` on the
 * leading and/or trailing edge of the `wait` timeout.
 *
 * @param func The function to debounce.
 * @param wait The number of milliseconds to delay.
 * @param options The options object.
 * @param {boolean} [options.leading=false] Specify invoking on the leading edge of the timeout.
 * @param {boolean} [options.trailing=true] Specify invoking on the trailing edge of the timeout.
 * @returns Returns the new debounced function.
 */
export function debounce<This, Args extends unknown[], Return>(
  func: (this: This, ...args: Args) => Return,
  wait: number,
  options: { leading?: boolean; trailing?: boolean } = {}
): (this: This, ...args: Args) => void {
  let timeout: NodeJS.Timeout | null = null
  let lastArgs: Args | undefined
  let lastThis: This | undefined

  const { leading = false, trailing = true } = options

  function later() {
    timeout = null
    if (trailing && lastArgs) {
      func.apply(lastThis as This, lastArgs)
      // Clear references to avoid memory leaks
      lastArgs = lastThis = undefined
    }
  }

  return function debounced(this: This, ...args: Args): void {
    lastArgs = args
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    lastThis = this // This is a correct use case for aliasing 'this'.

    if (timeout === null) {
      if (leading) {
        // Leading edge invocation
        func.apply(this, args)
        // Clear args so that the trailing invocation doesn't happen unless
        // there are more calls within the wait period.
        lastArgs = lastThis = undefined
      }
    } else {
      // If called again within the wait period, cancel the previous timer
      clearTimeout(timeout)
    }

    // Set a new timer for the trailing edge
    timeout = setTimeout(later, wait)
  }
}
