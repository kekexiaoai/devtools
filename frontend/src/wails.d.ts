// 导入 Wails 自动生成的 App 模块的类型
//    `typeof import(...)` 是 TypeScript 的一个高级技巧，
//    它能让我们获取到一个模块所有导出成员的类型。
import type * as App from '@wailsjs/go/backend/App'
import type * as Runtime from '@wailsjs/runtime/runtime'

// 定义我们期望的 window.go 对象的精确形状
interface Go {
  main: {
    App: typeof App
  }
}

// 扩展全局的 Window 接口
declare global {
  interface Window {
    // 现在，TypeScript 确切地知道 window.go 是什么类型
    go: Go
    // 我们顺便也为 runtime 对象提供精确的类型
    runtime: typeof Runtime
  }
}
