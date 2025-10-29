import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DialogProvider } from './components/providers/DialogProvider'
import { Sidebar } from './components/Sidebar'
import { JsonToolsView } from './views/JsonToolsView'
import { FileSyncerView } from './views/FileSyncerView'
import { SshGateView } from './views/SshGateView'
import { TerminalView } from './views/TerminalView'
import { DashboardView } from './views/DashboardView'
import { TunnelsView } from './views/TunnelsView'
import { SettingsView } from './views/SettingsView'
import { useSettingsStore } from './hooks/useSettingsStore'
import { TitleBar } from '@/components/TitleBar'
import { CreateTunnelDialog } from '@/components/tunnel/CreateTunnelDialog'
import {
  GetActiveTunnels,
  GetSavedTunnels,
  GetSSHHosts,
  StartTunnelFromConfig,
  StopForward,
  UpdateTunnelsOrder,
} from '@wailsjs/go/sshgate/Service'
import {
  EventsOn,
  WindowIsFullscreen,
  Environment,
} from '@wailsjs/runtime/runtime'

import { toolIds, type UiScale } from './types'
import { DomReady, ForceQuit } from '@wailsjs/go/backend/App'
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

import { Loader2 } from 'lucide-react'
import { Button } from './components/ui/button'

import { AlertTriangle } from 'lucide-react'
import { useThemeDetector } from './hooks/useThemeDetector'
import { Toaster, toast } from 'sonner'
import { sshtunnel, types } from '@wailsjs/go/models'
import { useSshConnection } from './hooks/useSshConnection'
import { useDialog } from './hooks/useDialog'
import { appLogger } from './lib/logger'

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected'

export type TerminalSession = types.TerminalSessionInfo & {
  displayName: string
  status: ConnectionStatus
}

/**
 * AppContent contains the main application logic. It's wrapped in DialogProvider
 * so that hooks like useDialog and useSshAuth can be used within it.
 */
function AppContent() {
  const [isBackendReady, setIsBackendReady] = useState(false)
  const [activeTool, setActiveTool] = useState('Dashboard')
  const activeToolRef = useRef(activeTool)
  activeToolRef.current = activeTool
  const [uiScale, setUiScale] = useState<UiScale>('default')

  const [isFullscreen, setIsFullscreen] = useState(false)

  const [platform, setPlatform] = useState('')

  const [terminalSessions, setTerminalSessions] = useState<TerminalSession[]>(
    []
  )
  const terminalSessionsRef = useRef(terminalSessions)
  terminalSessionsRef.current = terminalSessions
  // --- State for active syncs (lifted from FileSyncerView) ---
  const [activeWatchers, setActiveWatchers] = useState<Record<string, boolean>>(
    {}
  )

  // --- State lifted from TunnelsView for global access ---
  const [savedTunnels, setSavedTunnels] = useState<
    sshtunnel.SavedTunnelConfig[]
  >([])

  const savedTunnelsRef = useRef(savedTunnels)
  savedTunnelsRef.current = savedTunnels

  const [activeTunnels, setActiveTunnels] = useState<
    sshtunnel.ActiveTunnelInfo[]
  >([])
  const [startingTunnelIds, setStartingTunnelIds] = useState<string[]>([])
  const [tunnelErrors, setTunnelErrors] = useState<Map<string, Error>>(
    new Map()
  )
  const [isLoadingTunnels, setIsLoadingTunnels] = useState(true)
  const [shouldStartNext, setShouldStartNext] = useState(false)
  const prevTunnelsRef = useRef<sshtunnel.SavedTunnelConfig[] | undefined>(
    undefined
  )

  // --- State for SSH Hosts from ~/.ssh/config for dialogs ---
  const [sshHosts, setSshHosts] = useState<types.SSHHost[]>([])

  // --- State for Tunnel Create/Edit Dialog (lifted from TunnelsView) ---
  const [isTunnelDialogOpen, setIsTunnelDialogOpen] = useState(false)
  const [editingTunnel, setEditingTunnel] = useState<
    sshtunnel.SavedTunnelConfig | undefined
  >(undefined)

  // --- Global Settings Integration ---
  const appTheme = useSettingsStore((state) => state.theme)
  const setPlatformDefaults = useSettingsStore((s) => s.setPlatformDefaults)
  const systemIsDark = useThemeDetector()
  const isDarkMode = useMemo(() => {
    if (appTheme === 'system') {
      return systemIsDark
    }
    return appTheme === 'dark'
  }, [appTheme, systemIsDark])

  const logger = useMemo(() => {
    return appLogger
  }, [])

  const { showDialog } = useDialog()
  const noOpOnOpenTerminal = useCallback(() => {}, [])
  const { connect: verifyAndGetPassword } = useSshConnection({
    showDialog,
    onOpenTerminal: noOpOnOpenTerminal, // Not used in 'verify' mode
  })

  // This is a workaround to satisfy the `CreateTunnelDialog`'s `hosts` prop,
  // which expects the older `types.SSHHost[]` structure for validation.
  // The long-term fix is to refactor `CreateTunnelDialog` to use `sshtunnel.SavedTunnelConfig[]`.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const sshHostsForDialog = useMemo(
    (): types.SSHHost[] =>
      savedTunnels.map((t) => {
        // For manual hosts, the connection details are stored in the `manualHost` object.
        // For ssh_config hosts, these details are not available on the SavedTunnelConfig object.
        const hostName =
          t.hostSource === 'manual' ? (t.manualHost?.hostName ?? '') : ''
        const user = t.hostSource === 'manual' ? (t.manualHost?.user ?? '') : ''
        const port = t.hostSource === 'manual' ? (t.manualHost?.port ?? '') : ''

        return new types.SSHHost({
          id: t.id,
          name: t.name,
          alias: t.hostAlias ?? '',
          hostName,
          user,
          port,
        })
      }),
    [savedTunnels]
  )

  const activeSyncsCount = useMemo(() => {
    return Object.values(activeWatchers).filter(Boolean).length
  }, [activeWatchers])

  // 监听后端就绪事件
  useEffect(() => {
    const cleanup = EventsOn('app:ready', () => {
      logToServer('INFO', 'frontend receive app:ready event')
      setIsBackendReady(true)
      logger.info(
        'frontend receive app:ready event, set is backend ready to true'
      )
    })
    return cleanup
  }, [logger])

  // 新增：前端加载完成后，通知后端可以发送 app:ready 事件了
  useEffect(() => {
    // 这个 effect 只在组件首次挂载时运行一次
    // 调用后端 DomReady 方法，触发 "握手"
    DomReady().catch((err) => {
      logger.error('Failed to signal DomReady to backend:', err)
    })
  }, [logger])

  // Fetch the list of hosts from ~/.ssh/config for use in dialogs
  const fetchSshHosts = useCallback(async () => {
    try {
      setSshHosts(await GetSSHHosts())
    } catch (error) {
      logger.error(`Failed to load SSH hosts for dialogs: ${String(error)}`)
    }
  }, [logger])
  useEffect(() => {
    void fetchSshHosts()
  }, [fetchSshHosts, logger])

  useEffect(() => {
    Environment()
      .then((info) => {
        setPlatform(info.platform)
        // Once we have the platform, set the platform-specific default shortcuts.
        // This is done inside a `setTimeout` to ensure it runs after the store
        // has been fully hydrated from localStorage by zustand/persist middleware.
        setTimeout(() => {
          setPlatformDefaults(info.platform)
        }, 0)
      })
      .catch((error) => {
        logger.error('Environment promise was rejected:', error)
      })
  }, [logger, setPlatformDefaults])

  // 适配系统主题
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
      logger.info('Zoom event received from Go:', newScale)
      setUiScale(newScale)
    }
    EventsOn('zoom_change', handler)

    return () => {
      // 清理事件监听器
      EventsOn('zoom_change', () => {}) // 取消订阅事件，传递一个空函数
    }
  }, [logger])

  // 使用轮询来检测全屏状态的 useEffect
  // useEffect(() => {
  //   // 检查函数
  //   const checkFullscreenState = async () => {
  //     try {
  //       const isCurrentlyFullscreen = await WindowIsFullscreen()
  //       // 只有当状态发生变化时，才更新 state，避免不必要的重渲染
  //       setIsFullscreen((prevState) => {
  //         if (prevState !== isCurrentlyFullscreen) {
  //           logger.info(
  //             `Polling: Fullscreen state changed to ${isCurrentlyFullscreen}`
  //           )
  //           return isCurrentlyFullscreen
  //         }
  //         return prevState
  //       })
  //     } catch (error) {
  //       logger.error('Polling: Failed to check fullscreen state:', error)
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
  // }, [logger]) // logger是稳定的，意味着这个 effect 只在组件首次挂载时运行一次

  // --- 3. 新增 useEffect 来监听窗口全屏事件 ---
  useEffect(() => {
    // 检查初始状态
    WindowIsFullscreen()
      .then(setIsFullscreen)
      .catch((error) => {
        logger.error('Failed to check initial fullscreen state:', error)
      })
      .finally(() => {
        logger.info('Checked initial fullscreen state')
      })

    // Wails 会在窗口进入全屏时发出 "wails:fullscreen" 事件
    EventsOn('wails:fullscreen', () => {
      logger.info('Entered fullscreen mode')
      setIsFullscreen(true)
    })

    // Wails 会在窗口退出全屏时发出 "wails:unfullscreen" 事件
    EventsOn('wails:unfullscreen', () => {
      logger.info('Left fullscreen mode')
      setIsFullscreen(false)
    })

    return () => {
      // 清理事件监听器
      EventsOn('wails:fullscreen', () => {}) // 取消订阅事件，传递一个空函数
      EventsOn('wails:unfullscreen', () => {}) // 取消订阅事件，传递一个空函数
    }
  }, [logger]) // logger是稳定的 意味着这个 effect 只在组件首次挂载时运行一次

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

  // --- tunnel ---

  // --- Tunnel Dialog Handlers (lifted from TunnelsView) ---
  const handleOpenCreateTunnel = useCallback(() => {
    setEditingTunnel(undefined)
    setIsTunnelDialogOpen(true)
  }, [])

  const handleEditTunnel = useCallback(
    (tunnel: sshtunnel.SavedTunnelConfig) => {
      setEditingTunnel(tunnel)
      setIsTunnelDialogOpen(true)
    },
    []
  )

  const handleTunnelDialogSuccess = useCallback((shouldStart: boolean) => {
    setIsTunnelDialogOpen(false)
    if (shouldStart) setShouldStartNext(true)
  }, [])

  const handleStopTunnel = useCallback(
    (runtimeId: string) => {
      const activeTunnel = activeTunnels.find((t) => t.id === runtimeId)
      if (!activeTunnel) {
        logger.warn(`Stop request for non-existent active tunnel: ${runtimeId}`)
        return
      }

      const promise = StopForward(runtimeId)
      toast.promise(promise, {
        loading: `Stopping tunnel "${activeTunnel.alias}"...`,
        success: () => `Tunnel "${activeTunnel.alias}" stopped.`,
        error: (err) => `Failed to stop tunnel: ${String(err)}`,
      })
    },
    [activeTunnels, logger]
  )

  // --- Tunnel Management Logic (Lifted from TunnelsView) ---
  const fetchSavedTunnels = useCallback(async () => {
    try {
      setSavedTunnels(await GetSavedTunnels())
    } catch (error) {
      logger.error(`Failed to load saved tunnels: ${String(error)}`)
    }
  }, [logger])

  const fetchActiveTunnels = useCallback(
    async (isInitialLoad = false) => {
      if (isInitialLoad) {
        setIsLoadingTunnels(true)
      }
      try {
        const tunnels = await GetActiveTunnels()
        setActiveTunnels(tunnels)
      } catch (error) {
        logger.error(`Failed to fetch active tunnels: ${String(error)}`)
      } finally {
        if (isInitialLoad) {
          setIsLoadingTunnels(false)
        }
      }
    },
    [logger]
  )

  const handleStartTunnel = useCallback(
    (id: string) => {
      // This function is now synchronous and returns void, satisfying ESLint.
      // The async logic is wrapped in an immediately-invoked function expression (IIFE).
      void (async () => {
        const tunnel = savedTunnelsRef.current.find((t) => t.id === id)
        if (!tunnel) {
          toast.error('Could not find tunnel configuration.')
          return
        }

        // Set starting state immediately for UI feedback (e.g., spinner on button)
        setStartingTunnelIds((prev) => [...prev, id])
        let toastId: string | number | undefined

        try {
          const aliasForDisplay =
            tunnel.hostSource === 'ssh_config' ? tunnel.hostAlias! : tunnel.name

          // Step 1: Perform interactive verification. NO TOASTS should be shown here.
          const password = await verifyAndGetPassword({
            alias: aliasForDisplay,
            strategy: 'verify',
            tunnelConfigID: id,
          })

          // If user cancelled the dialog, verifyAndGetPassword resolves to null.
          // The hook itself shows a cancellation toast, so we just exit gracefully.
          if (password === null) {
            return
          }

          // Step 2: Interactive part is done. Now show loading toast and start the tunnel.
          toastId = toast.loading(`Starting tunnel "${tunnel.name}"...`)
          await StartTunnelFromConfig(id, password)
          const successMessage = `Tunnel "${tunnel.name}" started successfully.`
          toast.success(successMessage, { id: toastId })

          // Clear any previous errors for this tunnel on success
          setTunnelErrors((prev) => {
            const newErrors = new Map(prev)
            newErrors.delete(id)
            return newErrors
          })
        } catch (error: unknown) {
          // This catch block handles actual errors, not cancellations.
          const err = error instanceof Error ? error : new Error(String(error))
          const errorMessage = `Failed to start tunnel: ${err.message}`
          if (toastId) {
            toast.error(errorMessage, { id: toastId })
          } else {
            toast.error(errorMessage)
          }
          setTunnelErrors((prev) => new Map(prev).set(id, err))
        } finally {
          // This will run for success, error, and cancellation cases.
          setStartingTunnelIds((prev) =>
            prev.filter((tunnelId) => tunnelId !== id)
          )
        }
      })()
    },
    [verifyAndGetPassword]
  )

  useEffect(() => {
    // This effect handles the "start after create" feature.
    const prevTunnels = prevTunnelsRef.current
    if (
      shouldStartNext &&
      prevTunnels &&
      savedTunnels.length > prevTunnels.length
    ) {
      const prevTunnelIds = new Set(prevTunnels.map((t) => t.id))
      const newTunnel = savedTunnels.find((t) => !prevTunnelIds.has(t.id))

      if (newTunnel) {
        logger.info(`Auto-starting newly created tunnel: ${newTunnel.name}`)
        handleStartTunnel(newTunnel.id)
      }
      setShouldStartNext(false)
    }
    prevTunnelsRef.current = savedTunnels
  }, [savedTunnels, shouldStartNext, handleStartTunnel, logger])

  const handleOrderChange = useCallback(
    (orderedIds: string[]) => {
      const originalTunnels = [...savedTunnels]
      setSavedTunnels((currentTunnels) => {
        const tunnelMap = new Map(currentTunnels.map((t) => [t.id, t]))
        return orderedIds
          .map((id) => tunnelMap.get(id))
          .filter(Boolean) as sshtunnel.SavedTunnelConfig[]
      })

      UpdateTunnelsOrder(orderedIds).catch((err) => {
        toast.error('Failed to save tunnel order.')
        logger.error('Failed to update tunnel order:', err)
        setSavedTunnels(originalTunnels)
      })
    },
    [savedTunnels, logger]
  )

  useEffect(() => {
    void fetchSavedTunnels()
    void fetchActiveTunnels(true)
    const cleanupTunnelChangedEvent = EventsOn(
      'tunnels:changed',
      () => void fetchActiveTunnels(false)
    )
    const cleanupSavedTunnelsChangedEvent = EventsOn(
      'saved_tunnels_changed',
      () => void fetchSavedTunnels()
    )

    return () => {
      cleanupTunnelChangedEvent()
      cleanupSavedTunnelsChangedEvent()
    }
  }, [fetchActiveTunnels, fetchSavedTunnels])

  // --- App 组件提供管理终端会话的函数 ---
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(null)

  const createNewTerminalSession = useCallback(
    (sessionInfo: types.TerminalSessionInfo) => {
      // 检查这是否是一个已存在会话的重连
      const existingSession = terminalSessionsRef.current.find(
        (s) => s.id === sessionInfo.id
      )
      if (existingSession) {
        // This is a reconnect. We append a timestamp to the URL to make it unique.
        // This forces the useEffect hook in IntegratedTerminal to re-run, as it
        // sees a new prop value.
        const newSession: TerminalSession = {
          ...sessionInfo, // url from backend does not have query params
          url: `${sessionInfo.url}?_reconnect=${Date.now()}`,
          displayName: existingSession.displayName,
          status: 'connecting', // 重置状态为连接中
        }
        setTerminalSessions((prev) =>
          prev.map((s) => (s.id === sessionInfo.id ? newSession : s))
        )
      } else {
        // 是一个全新的会话：为其生成一个唯一的 displayName
        const baseName = sessionInfo.alias
        let displayName = baseName
        let counter = 1
        while (
          terminalSessionsRef.current.some((s) => s.displayName === displayName)
        ) {
          counter++
          displayName = `${baseName} (${counter})`
        }
        const newSession: TerminalSession = {
          ...sessionInfo,
          displayName,
          status: 'connecting', // 初始化状态为连接中
        }
        setTerminalSessions((prev) => [...prev, newSession])
      }

      // 打开新终端后，立即将其设为激活状态
      setActiveTerminalId(sessionInfo.id)
      // 切换到 Terminal 工具视图
      if (activeToolRef.current !== 'Terminal') {
        setActiveTool('Terminal')
      }
    },
    []
  ) // 移除依赖项，使其稳定

  useEffect(() => {
    // 判断标签列表是否为空
    if (terminalSessions.length === 0) {
      setActiveTerminalId(null)
      return
    }
    // 判断当前激活的标签是否存在，不存在就选中最后一个
    if (
      activeTerminalId &&
      !terminalSessions.some((s) => s.id === activeTerminalId)
    ) {
      setActiveTerminalId(terminalSessions[terminalSessions.length - 1].id)
    }
  }, [terminalSessions, activeTerminalId])

  const closeTerminal = useCallback((sessionId: string) => {
    // 当关闭所有终端后，自动切换回 SSH Gate
    setTerminalSessions((prev) => {
      const newSessions = prev.filter((s) => s.id !== sessionId)
      // if (newSessions.length === 0) {
      //   setActiveTool('SshGate')
      // }
      return newSessions
    })
  }, [])

  const renameTerminal = useCallback((sessionId: string, newName: string) => {
    setTerminalSessions((prev) =>
      prev.map((session) =>
        session.id === sessionId
          ? { ...session, displayName: newName }
          : session
      )
    )
  }, [])

  const updateTerminalStatus = useCallback(
    (sessionId: string, status: ConnectionStatus) => {
      setTerminalSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, status } : s))
      )
    },
    []
  )

  const { connect } = useSshConnection({
    showDialog,
    onOpenTerminal: createNewTerminalSession,
  })

  const reconnectTerminal = useCallback(
    (sessionId: string) => {
      const session = terminalSessions.find((s) => s.id === sessionId)
      if (!session) return
      void connect({
        alias: session.alias,
        type: session.type as 'local' | 'remote',
        sessionID: session.id,
        strategy: 'internal',
      })
    },
    [connect, terminalSessions]
  )

  const handleTerminalConnect = useCallback(
    (
      alias: string,
      type: 'local' | 'remote' = 'local',
      strategy: 'internal' | 'external' = 'external'
    ) => {
      void connect({ alias, type, sessionID: '', strategy })
    },
    [connect]
  )

  const handleNavigate = useCallback((toolId: (typeof toolIds)[number]) => {
    setActiveTool(toolId)
  }, [])

  const toolViews = useMemo(() => {
    // useMemo 会“记住”这个对象的计算结果。
    // 只有当它的依赖项（如 activeTool, terminalSessions 等）发生变化时，
    // 它才会重新计算这个对象，从而避免不必要的组件创建。
    return {
      Dashboard: (
        <DashboardView
          onNavigate={handleNavigate}
          onStartTunnel={handleStartTunnel}
          onStopTunnel={handleStopTunnel}
          savedTunnels={savedTunnels}
          activeTunnels={activeTunnels}
          startingTunnelIds={startingTunnelIds}
          onOpenCreateTunnel={handleOpenCreateTunnel}
          activeSyncsCount={activeSyncsCount} // Pass calculated count
        />
      ),
      FileSyncer: (
        <FileSyncerView
          isActive={activeTool === 'FileSyncer'}
          activeWatchers={activeWatchers}
          setActiveWatchers={setActiveWatchers}
        />
      ),
      JsonTools: <JsonToolsView isDarkMode={isDarkMode} />,
      SshGate: (
        <SshGateView
          isActive={activeTool === 'SshGate'}
          onConnect={handleTerminalConnect}
          // 传递 isDarkMode
          isDarkMode={isDarkMode}
        />
      ),
      Tunnels: (
        <TunnelsView
          onConnect={connect}
          savedTunnels={savedTunnels}
          activeTunnels={activeTunnels}
          startingTunnelIds={startingTunnelIds}
          tunnelErrors={tunnelErrors}
          isLoadingTunnels={isLoadingTunnels}
          onStartTunnel={handleStartTunnel}
          onStopTunnel={handleStopTunnel}
          onOrderChange={handleOrderChange}
          onOpenCreateTunnel={handleOpenCreateTunnel}
          onEditTunnel={handleEditTunnel}
        />
      ),
      Terminal: (
        <TerminalView
          isActive={activeTool === 'Terminal'}
          terminalSessions={terminalSessions}
          onCloseTerminal={closeTerminal}
          onRenameTerminal={renameTerminal}
          activeTerminalId={activeTerminalId}
          onActiveTerminalChange={setActiveTerminalId}
          onReconnectTerminal={reconnectTerminal}
          onConnect={handleTerminalConnect}
          onStatusChange={updateTerminalStatus}
          platform={platform}
          // 传递 isDarkMode
          isDarkMode={isDarkMode}
        />
      ),
      Settings: <SettingsView platform={platform} />,
    }
  }, [
    handleStartTunnel,
    handleStopTunnel,
    savedTunnels,
    activeTunnels,
    startingTunnelIds,
    handleOpenCreateTunnel,
    activeTool,
    isDarkMode,
    handleTerminalConnect,
    connect,
    tunnelErrors,
    isLoadingTunnels,
    handleOrderChange,
    handleEditTunnel,
    terminalSessions,
    closeTerminal,
    renameTerminal,
    activeTerminalId,
    reconnectTerminal,
    updateTerminalStatus,
    handleNavigate,
    activeSyncsCount,
    activeWatchers,
    platform,
  ])

  // 在后端准备好之前，显示一个加载界面
  if (!isBackendReady) {
    return (
      <div
        id="App"
        className="w-screen h-screen bg-background text-foreground flex items-center justify-center"
      >
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="text-lg text-muted-foreground">Initializing...</p>
        </div>
      </div>
    )
  }
  return (
    <>
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
              {[...toolIds, 'Settings'].map((id) => (
                <div
                  key={id}
                  className={`absolute inset-0 h-full w-full ${activeTool === id ? 'block' : 'hidden'}`}
                >
                  {toolViews[id as keyof typeof toolViews]}
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
      {/* Tunnel Create/Edit Dialog is now controlled at the App level */}
      <CreateTunnelDialog
        isOpen={isTunnelDialogOpen}
        onOpenChange={setIsTunnelDialogOpen}
        onSuccess={handleTunnelDialogSuccess}
        hosts={sshHosts}
        tunnelToEdit={editingTunnel}
      />
    </>
  )
}

function App() {
  return (
    <DialogProvider>
      <AppContent />
    </DialogProvider>
  )
}
export default App
