# Logger 工具库

本库提供两种日志工具实现，适用于前端（如 Wails + Vite + React）项目：

- ✅ `simpleLogger`：适用于轻量项目或调试使用
- 🚀 `advancedLogger`：支持多前缀、颜色、日志级别控制、任务机制（如上传、文件记录）

---

## ✨ 特性

- 支持 `debug / info / warn / error` 等日志等级
- 支持多级前缀（如 `[App][Worker][Task]`）
- 彩色控制台输出（基于 `chalk`，可关闭）
- 任务机制支持日志上报、写入文件、自定义处理等
- 支持 meta 字段灵活控制每条日志行为（如是否上传）
- `enabled` 仅控制控制台打印，**不影响任务执行**

---

## 📦 安装

已集成在项目中，默认支持 TypeScript。

依赖项：

```bash
pnpm add chalk
```

## 🔧 使用

### 简单日志

```ts
import { createLogger, withPrefix } from '@/utils/logger'

const logger = createLogger('App')
const httpLogger = withPrefix(logger, 'HTTP')

logger.info('Hello World')
httpLogger.warn('Request timeout')
```

输出示例：

```log
[App] Hello World
[App][HTTP] Request timeout
```

### 高级日志

```ts
import { createAdvancedLogger, wailsReportTask } from '@/utils/logger'

const logger = createAdvancedLogger('Main', {
  level: 'info',
  useColors: true,
  enabled: true,
  tasks: [wailsReportTask()], // 可注入多个任务
})

const taskLogger = logger.withPrefix('Task')

logger.info('App started')
taskLogger.warn('Task slow', { id: 1 })
taskLogger.error('Task failed', { id: 2 }, { upload: true }) // 仅此条上传
```

输出示例：

```log
[Main] App started
[Main][Task] Task slow { id: 1 }
[Main][Task] Task failed { id: 2 }
```

## 📌 参数说明

### createLogger(context, enabled?)

- `context`：日志上下文，会显示在日志前缀中
- `enabled`：是否控制台打印，默认值为 `true`

### createAdvancedLogger(context, options)

- `context`：日志上下文，会显示在日志前缀中
- `options`：配置选项
  - `level`：日志等级，默认值为 `'info'`
  - `useColors`：是否启用颜色输出，默认值为 `false`
  - `prefix`：日志前缀，默认值为 `''`
  - `enabled`：是否控制台打印，默认值为 `NODE_ENV === 'development'`
  - `tasks`：任务列表（注入的日志处理任务（上传、写文件等），默认值为 `[wailsReportTask]`

### 🧩 高级扩展：任务机制（Log Tasks）

- 任务机制：自定义日志处理逻辑，如上传到服务器、写入文件等。
- 任务类型：
  - `wailsReportTask`：上报日志到 Wails 后端（默认任务）
  - `fileWriteTask`：将日志写入文件
  - `customTask`：自定义任务（可根据需求扩展）

1. 每条日志会遍历执行注入的 tasks，形如

```ts
type LogTask = (payload: {
  level: LogLevel
  message: string
  params: unknown[]
  context: string[]
  meta?: Record<string, any>
}) => void | Promise<void>
```

2. 内置任务：Wails 后端上传

```ts
import { wailsReportTask } from '@/utils/logger'

const logger = createAdvancedLogger('App', {
  tasks: [wailsReportTask()],
})
```

3. 控制是否上传到服务器：

```ts
logger.error('上传这条日志', {}, { upload: true })
```

## 📤 日志等级说明

- `debug`：调试日志
- `info`：信息日志
- `warn`：警告日志
- `error`：错误日志

  • level 设为 'warn' 时，只输出 warn 和 error
  • debug 不会上报服务器（其余等级可上传）

## 🔧 接口定义

### simpleLogger 接口

```ts
export interface Logger {
  info: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
}
```

### advancedLogger 接口

```ts
export interface AdvancedLogger {
  debug: (...args: unknown[]) => void
  info: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
  withPrefix: (prefix: string) => AdvancedLogger
}
```

## 💡 项目结构推荐

```text
src/
  └── utils/
      └── logger/
          ├── index.ts              // 统一导出 simpleLogger + advancedLogger
          ├── simpleLogger.ts       // 简单日志实现
          ├── advancedLogger.ts     // 高级日志实现
          ├── examples/
              ├── logger-demo.ts
```
