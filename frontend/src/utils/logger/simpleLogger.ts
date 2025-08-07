export type LogMethod = (...args: unknown[]) => void

export interface Logger {
  info: LogMethod
  warn: LogMethod
  error: LogMethod
}

export const createLogger = (
  context: string,
  enabled: boolean = process.env.NODE_ENV === 'development'
): Logger => {
  const format = (level: 'info' | 'warn' | 'error', args: unknown[]) => {
    if (!enabled) return
    console[level](`[${context}]`, ...args)
  }

  return {
    info: (...args) => format('info', args),
    warn: (...args) => format('warn', args),
    error: (...args) => format('error', args),
  }
}

export const withPrefix = (logger: Logger, prefix: string): Logger => {
  const wrap = (method: keyof Logger): LogMethod => {
    return (...args: unknown[]) => {
      if (typeof args[0] === 'string') {
        logger[method](`[${prefix}] ${args[0]}`, ...args.slice(1))
      } else {
        logger[method](`[${prefix}]`, ...args)
      }
    }
  }

  return {
    info: wrap('info'),
    warn: wrap('warn'),
    error: wrap('error'),
  }
}
