# Logger 工具库

本库提供两种日志工具实现，适用于前端（如 Wails + Vite + React）项目：

- ✅ `simpleLogger`：适用于轻量项目或调试使用
- 🚀 `advancedLogger`：支持多前缀、颜色、高级日志级别控制、自动上报 Wails 后端

---

## ✨ 特性

- 支持 `info / warn / error` 等日志等级（含 debug/info）
- 支持多级前缀（如 `[App][Worker][Task]`）
- 可选彩色输出（基于 `chalk`）
- 可选日志上报到 Wails 后端（调用 `LogFromFrontend`）
- 支持根据环境变量控制是否启用日志（`NODE_ENV`）

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
import { createAdvancedLogger } from '@/utils/logger'

const logger = createAdvancedLogger('Main', {
  level: 'info', // 日志等级
  useColors: true, // 是否启用颜色输出
  reportToServer: true, // 是否上报到 Wails 后端
})

const workerLogger = logger.withPrefix('Worker')
const taskLogger = workerLogger.withPrefix('Task')

logger.info('App started')
workerLogger.warn('Worker delay')
taskLogger.error('Task failed', { id: 1001 })
```

输出示例：

```log
[Main] App started
[Main][Worker] Worker delay
[Main][Worker][Task] Task failed { id: 1001 }
```

## 📌 参数说明

### createLogger(context, enabled?)

- `context`：日志上下文，会显示在日志前缀中
- `enabled`：是否启用日志，默认值为 `true`

### createAdvancedLogger(context, options)

- `context`：日志上下文，会显示在日志前缀中
- `options`：配置选项
  - `level`：日志等级，默认值为 `'info'`
  - `useColors`：是否启用颜色输出，默认值为 `false`
  - `reportToServer`：是否上报到 Wails 后端，默认值为 `false`
  - `prefix`：日志前缀，默认值为 `''`
  - `enabled`：是否启用日志，默认值为 `true`

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
