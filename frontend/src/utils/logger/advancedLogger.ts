/**
 * 高级日志工具，支持：
 * - 多级前缀
 * - 控制台输出带颜色
 * - 日志级别控制
 * - 注入自定义任务（如上报 Wails、写入文件等）
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

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'
export type ServerLogLevel = 'INFO' | 'WARN' | 'ERROR'
export type LogMethod = (...args: unknown[]) => void

export interface LogMeta {
  upload?: boolean
  [key: string]: unknown
}

export interface AdvancedLogger {
  debug: LogMethod
  info: LogMethod
  warn: LogMethod
  error: LogMethod
  withPrefix: (prefix: string | (() => string)) => AdvancedLogger
}

export type LogTask = (
  level: LogLevel,
  prefix: string,
  message: string,
  rest: unknown[],
  meta?: LogMeta
) => void | Promise<void>

interface LoggerOptions {
  enabled?: boolean
  level?: LogLevel
  prefix?: (string | (() => string))[]
  useColors?: boolean
  tasks?: LogTask[]
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
      return null
  }
}

// 默认任务：上报到 Wails 后端
export const wailsReportTask: LogTask = async (
  level,
  prefix,
  message,
  rest,
  meta
) => {
  if (!meta?.upload) return
  const serverLevel = toServerLevel(level)
  if (!serverLevel || !window.go || !LogFromFrontend || !types.LogEntry) return

  const fullMessage = [
    prefix,
    message,
    ...rest.map((p) => {
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

export const createAdvancedLogger = (
  context: string,
  options?: LoggerOptions
): AdvancedLogger => {
  const {
    enabled = process.env.NODE_ENV === 'development',
    level = 'debug',
    prefix = [],
    useColors = true,
    tasks = [wailsReportTask],
  } = options || {}

  const currentLevel = levelPriority[level]

  const formatPrefix = (
    level: LogLevel
  ): { prefix: string; fullPrefix: string } => {
    const resolvedPrefixes = prefix.map((p) =>
      typeof p === 'function' ? p() : p
    )
    const all = [context, ...resolvedPrefixes]
    const fullPrefix = `[${all.join('][')}]`
    return {
      prefix: fullPrefix,
      fullPrefix: useColors ? levelColor[level](fullPrefix) : fullPrefix,
    }
  }

  const logFn = (level: LogLevel): LogMethod => {
    return (...args: unknown[]) => {
      if (levelPriority[level] < currentLevel) return

      let meta: LogMeta | undefined
      const lastArg = args[args.length - 1]
      if (
        typeof lastArg === 'object' &&
        !Array.isArray(lastArg) &&
        lastArg !== null &&
        'upload' in lastArg
      ) {
        meta = lastArg as LogMeta
        args = args.slice(0, -1) // 去掉 meta
      }

      const prefixStr = formatPrefix(level)
      if (enabled) {
        const consoleMethod = console[level] || console.log
        consoleMethod(prefixStr.fullPrefix, ...args)
      }

      for (const task of tasks) {
        void task(level, prefixStr.prefix, String(args[0]), args.slice(1), meta)
      }
    }
  }

  const base: AdvancedLogger = {
    debug: logFn('debug'),
    info: logFn('info'),
    warn: logFn('warn'),
    error: logFn('error'),
    withPrefix: (newPrefix: string | (() => string)) =>
      createAdvancedLogger(context, {
        enabled,
        level,
        prefix: [...prefix, newPrefix],
        useColors,
        tasks,
      }),
  }

  return base
}
