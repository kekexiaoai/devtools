import React, { useEffect, useState } from 'react'
import { DialogProvider } from './components/providers/DialogProvider'
import { Sidebar } from './components/Sidebar'
import { JsonToolsView } from './views/JsonToolsView'
import { FileSyncerView } from './views/FileSyncerView'
import { TitleBar } from './components/TitleBar'
import { EventsOn, WindowIsFullscreen } from '../wailsjs/runtime/runtime'

import type { UiScale } from './types'
import { ForceQuit } from '../wailsjs/go/main/App'
import { logToServer } from './lib/utils'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogAction,
} from './components/ui/alert-dialog'
import {
  AlertDialogHeader,
  AlertDialogFooter,
} from './components/ui/alert-dialog'

const toolComponents = [
  { id: 'FileSyncer', component: FileSyncerView },

  { id: 'JsonTools', component: JsonToolsView },
]

function App() {
  const [activeTool, setActiveTool] = useState('FileSyncer')

  const [uiScale, setUiScale] = useState<UiScale>('default')

  const [isFullscreen, setIsFullscreen] = useState(false)

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
            </main>
          </div>
        </div>
      </div>
      {/* 5. 在这里渲染我们的“退出确认”对话框 */}
      <AlertDialog open={isQuitConfirmOpen} onOpenChange={setIsQuitConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to quit?</AlertDialogTitle>
            <AlertDialogDescription>
              Any running synchronization tasks will be terminated.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleConfirmQuit()}>
              Yes, Quit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DialogProvider>
  )
}

export default App
