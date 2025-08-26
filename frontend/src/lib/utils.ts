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
export function debounce<A extends unknown[], R>(
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
