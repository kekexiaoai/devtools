import React, { useCallback, useEffect, useState } from 'react'
import { DialogProvider } from './components/providers/DialogProvider'
import { Sidebar } from './components/Sidebar'
import { JsonToolsView } from './views/JsonToolsView'
import { FileSyncerView } from './views/FileSyncerView'
import { SSHGateView } from './views/SSHGateView'
import { TerminalView } from './views/TerminalView'
import { TitleBar } from '@/components/TitleBar'
import {
  EventsOn,
  WindowIsFullscreen,
  Environment,
} from '@wailsjs/runtime/runtime'

import type { UiScale } from './types'
import { ForceQuit } from '@wailsjs/go/backend/App'
import { logToServer } from '@/lib/utils'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './components/ui/alert-dialog'

import { Button } from '@/components/ui/button' // AlertDialogAction 本质上是一个 Button

import { AlertTriangle } from 'lucide-react'
import { useThemeDetector } from './hooks/useThemeDetector'
import { Toaster } from 'sonner'
import { types } from '@wailsjs/go/models'

export type TerminalSession = types.TerminalSessionInfo

const toolComponents = [
  { id: 'FileSyncer', component: FileSyncerView },
  { id: 'JsonTools', component: JsonToolsView },
  { id: 'SSHGate', component: SSHGateView },
  { id: 'Terminal', component: TerminalView },
]

function App() {
  const [activeTool, setActiveTool] = useState('FileSyncer')

  const [uiScale, setUiScale] = useState<UiScale>('default')

  const [isFullscreen, setIsFullscreen] = useState(false)

  const [platform, setPlatform] = useState('')

  const [terminalSessions, setTerminalSessions] = useState<TerminalSession[]>(
    []
  )

  useEffect(() => {
    Environment()
      .then((info) => setPlatform(info.platform))
      .catch((error) => {
        console.error('Environment promise was rejected:', error)
      })
  }, [])

  // 适配系统主题
  // 调用 Hook 来获取实时的暗黑模式状态
  const isDarkMode = useThemeDetector()

  // 使用 useEffect 来根据 isDarkMode 的变化，更新 <html> 标签的 class
  useEffect(() => {
    const root = window.document.documentElement

    root.classList.remove('light', 'dark') // 先移除旧的 class

    if (isDarkMode) {
      root.classList.add('dark')
    } else {
      root.classList.add('light')
    }
  }, [isDarkMode]) // 这个 effect 只在 isDarkMode 状态变化时运行

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

  // 新增一个 state 来控制“退出确认”对话框的显示
  const [isQuitConfirmOpen, setIsQuitConfirmOpen] = useState(false)

  // 新增一个 useEffect 来监听来自 Go 后端的退出请求
  useEffect(() => {
    const cleanup = EventsOn('app:request-quit', () => {
      logToServer(
        'INFO',
        'Received quit request from backend, showing confirmation dialog.'
      )
      setIsQuitConfirmOpen(true) // 显示我们的确认对话框
    })
    return cleanup
  }, []) // 空依赖数组，确保只监听一次

  // --- 事件处理函数 ---
  const handleConfirmQuit = async () => {
    await ForceQuit() // 调用后端函数，真正退出
  }

  // --- 现在由 App 组件提供管理终端会话的函数 ---

  const openTerminal = useCallback((session: TerminalSession) => {
    // 检查是否已有同名会话，如果有则直接切换过去

    setTerminalSessions((prev) => {
      // 避免重复添加
      if (prev.some((s) => s.id === session.id)) return prev
      return [...prev, session]
    })
    // 切换到 Terminal 工具视图
    setActiveTool('Terminal')

    // 检查是否已有同名会话，如果有则直接切换过去
    // const existingSession = terminalSessions.find((s) => s.id === session.id)
    // if (!existingSession) {
    //   setTerminalSessions((prev) => [...prev, session])
    // }
    // // 切换到 Terminal 工具视图
    // setActiveTool('Terminal')
  }, []) // 空依赖数组，确保函数引用永远稳定

  const closeTerminal = useCallback((sessionId: string) => {
    setTerminalSessions((prev) => prev.filter((s) => s.id !== sessionId))
    // 当关闭所有终端后，自动切换回 SSH Gate
    setTerminalSessions((prev) => {
      const newSessions = prev.filter((s) => s.id !== sessionId)
      if (newSessions.length === 0) {
        setActiveTool('SSHGate')
      }
      return newSessions
    })
  }, [])

  return (
    <DialogProvider>
      <div id="App" className="w-screen h-screen bg-transparent">
        <div className="w-full h-full flex flex-col rounded-lg overflow-hidden bg-background text-foreground">
          {/* 当不处于全屏状态时，才显示我们的自定义标题栏 */}
          {!isFullscreen && platform === 'darwin' && (
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
                  className={`absolute inset-0 h-full w-full ${
                    activeTool === id ? 'block' : 'hidden'
                  }`}
                >
                  <ToolComponent
                    isActive={activeTool === id}
                    terminalSessions={terminalSessions}
                    onOpenTerminal={openTerminal}
                    onCloseTerminal={closeTerminal}
                  />
                </div>
              ))}
            </main>
          </div>
        </div>
      </div>
      {/* 5. 在这里渲染我们的“退出确认”对话框 */}
      <AlertDialog open={isQuitConfirmOpen} onOpenChange={setIsQuitConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center space-x-2">
              <AlertTriangle className="h-6 w-6 text-destructive" />
              <AlertDialogTitle>
                Are you sure you want to quit?
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription className="pt-2">
              Any running synchronization tasks will be terminated. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="outline">Cancel</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                variant="destructive"
                onClick={() => void handleConfirmQuit()}
              >
                Yes, Quit
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* 信息停靠站 */}
      <Toaster />
    </DialogProvider>
  )
}

export default App
