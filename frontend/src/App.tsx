import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { DialogProvider } from './components/providers/DialogProvider'
import { Sidebar } from './components/Sidebar'
import { JsonToolsView } from './views/JsonToolsView'
import { FileSyncerView } from './views/FileSyncerView'
import { TitleBar } from './components/TitleBar'
import { EventsOn, WindowIsFullscreen } from '../wailsjs/runtime/runtime'

import type { UiScale } from './types'
import { types } from '../wailsjs/go/models'
import { LogPanel } from './components/logPanel'

const toolComponents = [
  { id: 'FileSyncer', component: FileSyncerView },

  { id: 'JsonTools', component: JsonToolsView },
]

function App() {
  const [activeTool, setActiveTool] = useState('FileSyncer')

  const [uiScale, setUiScale] = useState<UiScale>('default')

  const [isFullscreen, setIsFullscreen] = useState(false)

  const [logs, setLogs] = useState<types.LogEntry[]>([])
  const [isLogPanelOpen, setIsLogPanelOpen] = useState(false)

  useEffect(() => {
    const htmlEl = document.documentElement
    let fontSize = '16px'
    switch (uiScale) {
      case 'small':
        fontSize = '12px'
        break
      case 'large':
        fontSize = '16px'
        break
      default:
        fontSize = '14px'
    }
    htmlEl.style.fontSize = fontSize
  }, [uiScale])

  useEffect(() => {
    const handler = (newScale: UiScale) => {
      console.log('Zoom event received from Go:', newScale)
      setUiScale(newScale)
    }
    EventsOn('zoom_change', handler)

    return () => {
      // 清理事件监听器
      EventsOn('zoom_change', () => {}) // 取消订阅事件，传递一个空函数
    }
  }, [])

  // 使用轮询来检测全屏状态的 useEffect
  // useEffect(() => {
  //   // 检查函数
  //   const checkFullscreenState = async () => {
  //     try {
  //       const isCurrentlyFullscreen = await WindowIsFullscreen()
  //       // 只有当状态发生变化时，才更新 state，避免不必要的重渲染
  //       setIsFullscreen((prevState) => {
  //         if (prevState !== isCurrentlyFullscreen) {
  //           console.log(
  //             `Polling: Fullscreen state changed to ${isCurrentlyFullscreen}`
  //           )
  //           return isCurrentlyFullscreen
  //         }
  //         return prevState
  //       })
  //     } catch (error) {
  //       console.error('Polling: Failed to check fullscreen state:', error)
  //     }
  //   }

  //   // 组件首次挂载时，立即检查一次初始状态
  //   void checkFullscreenState()

  //   // 启动一个定时器，每 500 毫秒检查一次窗口状态
  //   const intervalId = window.setInterval(() => {
  //     void checkFullscreenState()
  //   }, 500)

  //   // 在组件卸载时，返回一个清理函数，这非常重要！
  //   // 它会清除定时器，防止内存泄漏。
  //   return () => {
  //     if (intervalId) {
  //       window.clearInterval(intervalId)
  //     }
  //   }
  // }, []) // 空依赖数组 [] 意味着这个 effect 只在组件首次挂载时运行一次

  // --- 3. 新增 useEffect 来监听窗口全屏事件 ---
  useEffect(() => {
    // 检查初始状态
    WindowIsFullscreen()
      .then(setIsFullscreen)
      .catch((error) => {
        console.error('Failed to check initial fullscreen state:', error)
      })
      .finally(() => {
        console.log('Checked initial fullscreen state')
      })

    // Wails 会在窗口进入全屏时发出 "wails:fullscreen" 事件
    EventsOn('wails:fullscreen', () => {
      console.log('Entered fullscreen mode')
      setIsFullscreen(true)
    })

    // Wails 会在窗口退出全屏时发出 "wails:unfullscreen" 事件
    EventsOn('wails:unfullscreen', () => {
      console.log('Left fullscreen mode')
      setIsFullscreen(false)
    })

    return () => {
      // 清理事件监听器
      EventsOn('wails:fullscreen', () => {}) // 取消订阅事件，传递一个空函数
      EventsOn('wails:unfullscreen', () => {}) // 取消订阅事件，传递一个空函数
    }
  }, []) // 空依赖数组 [] 意味着这个 effect 只在组件首次挂载时运行一次

  // --- 4. 新增 useEffect 来监听日志事件 ---
  const addLogEntry = useCallback((logEntry: types.LogEntry) => {
    // 使用函数式更新，确保我们总是基于最新的状态进行修改
    setLogs((prevLogs) => {
      const newLogs = [...prevLogs, logEntry]
      // 保持日志数组的最大长度
      return newLogs.length > 200 ? newLogs.slice(1) : newLogs
    })
  }, [])

  useEffect(() => {
    // 组件挂载时，开始监听来自Go后端的日志事件
    const cleanup = EventsOn('log_event', addLogEntry)

    // 组件卸载时，返回一个清理函数来注销监听，防止内存泄漏
    return cleanup
  }, [addLogEntry])

  const clearLogs = () => setLogs([])
  const toggleLogPanel = () => setIsLogPanelOpen((prev) => !prev)

  const latestLogStatus = useMemo(() => {
    if (logs.length === 0) {
      return { level: 'INFO', message: 'Ready' } as types.LogEntry
    }
    return logs[logs.length - 1]
  }, [logs])

  const statusColorClass = useMemo(() => {
    switch (latestLogStatus.level) {
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
  }, [latestLogStatus])

  return (
    <DialogProvider>
      <div id="App" className="w-screen h-screen bg-transparent">
        <div className="w-full h-full flex flex-col rounded-lg overflow-hidden bg-background text-foreground">
          {/* 当不处于全屏状态时，才显示我们的自定义标题栏 */}
          {!isFullscreen && (
            // 将缩放状态和更新函数传递给 TitleBar
            <TitleBar uiScale={uiScale} onScaleChange={setUiScale} />
          )}
          {/* 主内容区 */}
          <div className="flex flex-grow overflow-hidden">
            <Sidebar activeTool={activeTool} onToolChange={setActiveTool} />
            <main className="flex-1 flex flex-col overflow-hidden relative">
              {toolComponents.map(({ id, component: ToolComponent }) => (
                <div
                  key={id}
                  hidden={activeTool !== id}
                  className="absolute inset-0 h-full w-full"
                >
                  <ToolComponent />
                </div>
              ))}

              {/* 日志面板和状态 */}
              {activeTool === 'FileSyncer' && (
                <div className=" absolute bottom-0 left-0 w-full flex flex-col">
                  {isLogPanelOpen && (
                    <div className="h-48 flex-shrink-0">
                      <LogPanel logs={logs} onClear={clearLogs} />
                    </div>
                  )}

                  {/* 状态栏 */}
                  <div className="h-6 flex-shrink-0 bg-background border-t flex items-center justify-between px-2 text-xs select-none">
                    <button
                      onClick={toggleLogPanel}
                      className="flex items-center space-x-1 text-muted-foreground hover:text-foreground"
                    >
                      <span>{isLogPanelOpen ? '▼' : '▲'}</span>
                      <span>logs</span>
                    </button>

                    <div
                      className={`flex-1 text-right truncate${statusColorClass}`}
                      title={latestLogStatus.message}
                    >
                      <span>{latestLogStatus.message}</span>
                    </div>
                  </div>
                </div>
              )}
            </main>
          </div>
        </div>
      </div>
    </DialogProvider>
  )
}

export default App
