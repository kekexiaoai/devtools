/**
 * 高级日志工具，支持：
 * - 多级前缀
 * - 控制台输出带颜色
 * - 日志级别控制
 * - 自动上报到 Wails 后端
 *
 * @example
 * const logger = createAdvancedLogger('App')
 * const taskLogger = logger.withPrefix('Task')
 *
 * logger.info('启动成功')
 * taskLogger.warn('任务超时', { id: 42 })
 */

import chalk from 'chalk'
import { LogFromFrontend } from '@wailsjs/go/backend/App'
import { types } from '@wailsjs/go/models'

type LogLevel = 'debug' | 'info' | 'warn' | 'error'
type ServerLogLevel = 'INFO' | 'WARN' | 'ERROR'
type LogMethod = (...args: unknown[]) => void

export interface AdvancedLogger {
  debug: LogMethod
  info: LogMethod
  warn: LogMethod
  error: LogMethod
  withPrefix: (prefix: string) => AdvancedLogger
}

interface LoggerOptions {
  enabled?: boolean
  level?: LogLevel
  prefix?: string[]
  useColors?: boolean
  reportToServer?: boolean
}

const levelPriority: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

const levelColor: Record<LogLevel, (text: string) => string> = {
  debug: chalk.gray,
  info: chalk.cyan,
  warn: chalk.yellow,
  error: chalk.red,
}

const toServerLevel = (level: LogLevel): ServerLogLevel | null => {
  switch (level) {
    case 'info':
      return 'INFO'
    case 'warn':
      return 'WARN'
    case 'error':
      return 'ERROR'
    default:
      return null // debug 不上传
  }
}

export const createAdvancedLogger = (
  context: string,
  options?: LoggerOptions
): AdvancedLogger => {
  const {
    enabled = process.env.NODE_ENV === 'development',
    level = 'debug',
    prefix = [],
    useColors = true,
    reportToServer = true,
  } = options || {}

  const currentLevel = levelPriority[level]

  const formatPrefix = (
    level: LogLevel
  ): { prefix: string; fullPrefix: string } => {
    const all = [context, ...prefix]
    const fullPrefix = `[${all.join('][')}]`
    return {
      prefix: fullPrefix,
      fullPrefix: useColors ? levelColor[level](fullPrefix) : fullPrefix,
    }
  }

  const reportLogToServer = async (
    level: LogLevel,
    prefix: string,
    message: string,
    optionalParams: unknown[]
  ) => {
    const serverLevel = toServerLevel(level)
    if (!serverLevel || !window.go || !LogFromFrontend || !types.LogEntry) {
      return
    }

    const fullMessage = [
      prefix,
      message,
      ...optionalParams.map((p) => {
        try {
          return JSON.stringify(p, null, 2)
        } catch {
          return String(p)
        }
      }),
    ].join(' ')

    const entry = new types.LogEntry({
      timestamp: new Date().toISOString(),
      level: serverLevel,
      message: fullMessage,
    })

    try {
      await LogFromFrontend(entry)
    } catch (err) {
      console.error('Failed to report log to server:', err)
    }
  }

  const logFn = (level: LogLevel): LogMethod => {
    return (...args: unknown[]) => {
      if (!enabled || levelPriority[level] < currentLevel) return

      const { prefix, fullPrefix } = formatPrefix(level)

      const consoleMethod = console[level] || console.log
      consoleMethod(fullPrefix, ...args)

      if (reportToServer) {
        const [message, ...rest] = args
        if (typeof message === 'string') {
          void reportLogToServer(level, prefix, message, rest)
        } else {
          void reportLogToServer(level, prefix, String(message), rest)
        }
      }
    }
  }

  const base: AdvancedLogger = {
    debug: logFn('debug'),
    info: logFn('info'),
    warn: logFn('warn'),
    error: logFn('error'),
    withPrefix: (newPrefix: string) =>
      createAdvancedLogger(context, {
        enabled,
        level,
        prefix: [...prefix, newPrefix],
        useColors,
        reportToServer,
      }),
  }

  return base
}
