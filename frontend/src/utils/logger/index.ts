/**
 * 方式一：简单场景
 * @example
 * import { createLogger, withPrefix } from '@/utils/logger'
 *
 * const logger = createLogger('App')
 * const httpLogger = withPrefix(logger, 'HTTP')
 *
 * logger.log('Hello World')
 * httpLogger.warn('Request timeout')
 *
 * 方式二：需要颜色/远程/日志级别
 * @example
 * import { createAdvancedLogger } from '@/utils/logger'
 *
 * const logger = createAdvancedLogger('App', {
 *   level: 'info',
 *   reportToServer: true,
 *   useColors: true,
 * })
 *
 * logger.info('App started')
 * logger.error('Something went wrong', { code: 500 })
 *
 */

export { createLogger, withPrefix, type Logger } from './simpleLogger'

export { createAdvancedLogger, type AdvancedLogger } from './advancedLogger'
