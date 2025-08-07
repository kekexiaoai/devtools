import {
  createAdvancedLogger,
  createLogger,
  withPrefix,
} from '@/utils/logger/index'

// 简单日志
const logger = createLogger('Main') // 根据 NODE_ENV 自动控制输出
const taskLogger = withPrefix(logger, 'task')

taskLogger.info('Start processing', { id: 1 })
taskLogger.error('Failed', new Error('oops'))
// 输出
// [Main] [task] Start processing { id: 1 }
// [Main] [task] Failed Error: oops

// 高级日志
const advancedLogger = createAdvancedLogger('Main', {
  level: 'info',
})

const advancedTaskLogger = advancedLogger.withPrefix('Task')

advancedTaskLogger.info('App started')
advancedTaskLogger.warn('Task is slow', { id: 123 })
// 输出
// [Main][Task] App started
// [Main][Task] Task is slow { id: 123 }

// 使用示例
const advancedLogger1 = createAdvancedLogger('App')

const advancedWorkerLogger = advancedLogger1.withPrefix('Worker')
const advancedTaskLogger1 = advancedWorkerLogger.withPrefix('Task')

advancedLogger1.info('App started')
advancedWorkerLogger.warn('Something might be wrong')
advancedTaskLogger1.error('Task failed', { id: 42 })
taskLogger.error('Task failed', { id: 2 }, { upload: true }) // 仅此条上传

// 输出
// [App] App started
// [App][Worker] Something might be wrong
// [App][Worker][Task] Task failed { id: 42 }

// 无颜色版本 or 控制开关
const advancedServerLogger2 = createAdvancedLogger('Server', {
  level: 'warn', // 只输出 warn 和 error
  useColors: false,
})

const advancedServerTaskLogger2 = advancedServerLogger2.withPrefix('Task')
advancedServerTaskLogger2.error('Server task failed', { id: 555 })

// 输出
// [Server][Task] Server task failed { id: 555 }
