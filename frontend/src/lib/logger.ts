import {
  createAdvancedLogger,
  wailsReportTask,
} from '@/utils/logger/advancedLogger'

/**
 * Global application logger instance.
 * This instance should be initialized once and used throughout the application.
 *
 * It centralizes the configuration for logging, such as:
 * - The base context ('App')
 * - The minimum log level ('debug')
 * - Log processing tasks (e.g., reporting to a server)
 *
 * Components should not create their own loggers but instead derive from this
 * instance using `appLogger.withPrefix('MyComponent')`.
 */
export const appLogger = createAdvancedLogger('App', {
  level: 'debug',
  useColors: true,
  tasks: [wailsReportTask], // Centralized task configuration
})
