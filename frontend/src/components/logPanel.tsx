import React, { useEffect, useMemo, useRef } from 'react'
import { types } from '../../wailsjs/go/models'
import { Button } from './ui/button'

interface logPanelProps {
  logs: types.LogEntry[]
  onClear: () => void
}

export function LogPanel({ logs, onClear }: logPanelProps) {
  // useRef Hook 用于创建一个可变的引用对象，
  // useRef 创建了一个可变的“容器”，它的 .current 属性可以指向任何东西，
  // 并且在组件的整个生命周期中保持不变。
  // 我们在这里用它来“抓住”日志显示区域的那个 div DOM 元素。
  const logContainerRef = useRef<HTMLDivElement | null>(null)

  // 使用 useEffect Hook 处理 DOM 副作用
  // 这个 effect 专门负责“自动滚动”这个副作用。
  // 它的依赖项是 [logs]，意味着每当 logs 数组发生变化时（即有新日志推进来），
  // 这个 effect 就会重新运行。
  useEffect(() => {
    // ref.current 指向的就是真实的 DOM 节点
    const container = logContainerRef.current
    if (container) {
      // 将滚动条的位置设置为容器的总滚动高度，从而滚动到底部
      container.scrollTop = container.scrollHeight
    }
  }, [logs])

  // 使用 useMemo 缓存计算函数
  // 这个函数用于根据日志级别动态返回 Tailwind CSS 颜色类。
  // 用 useMemo 包裹，可以确保这个函数本身不会在每次渲染时都重新创建。
  const getLevelColorClass = useMemo(() => {
    return (level: string) => {
      switch (level) {
        case 'DEBUG':
          return 'text-blue-500 dark:text-blue-400'
        case 'INFO':
          return 'text-green-500 dark:text-green-400'
        case 'WARN':
          return 'text-yellow-500 dark:text-yellow-400'
        case 'ERROR':
          return 'text-red-600 dark:text-red-400 font-bold'
        case 'SUCCESS':
          return 'text-green-600 dark:text-green-400 font-bold'
        default:
          return 'text-gray-600 dark:text-gray-400'
      }
    }
  }, [])

  return (
    <div className="h-full bg-muted/30 text-foreground flex flex-col p-2 border-t">
      {/* 面板头部 */}
      <div className="flex-shrink-0 flex justify-between items-center mb-1 px-1">
        <h3 className="font-bold text-sm">Sync Log</h3>
        <Button onClick={onClear} variant="ghost" size="sm" className="text-xs">
          Clear
        </Button>
      </div>

      {/* 日志内容区域 */}
      <div
        // 将我们创建的 ref 附加到这个 div 上
        ref={logContainerRef}
        className="flex-grow overflow-y-auto font-mono text-xs space-y-1"
      >
        {logs.map((log, index) => (
          <div
            key={index}
            className="flex items-start px-1 py-0.5 hover:bg-accent rounded"
          >
            <span className="text-muted-foreground mr-2">{log.timestamp}</span>
            <span className={`mr-2 ${getLevelColorClass(log.level)}`}>
              [{log.level}]
            </span>
            <span className="flex-1 whitespace-pre-wrap">{log.message}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
