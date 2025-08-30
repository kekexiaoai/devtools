import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { IntegratedTerminal } from '@/components/sshgate/IntegratedTerminal'
import type { ConnectionStatus, TerminalSession } from '@/App'
import { Button } from '@/components/ui/button'
import { Plus, XIcon, MoreVertical, ChevronDown } from 'lucide-react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  // ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
// import { toast } from 'sonner'
import {
  NAMED_THEMES,
  FONT_FAMILIES,
  atomOneLightTheme,
  gruvboxDarkDimmedTheme,
} from '@/themes/terminalThemes'
import type { ITheme } from '@xterm/xterm'
import { useSettingsStore } from '@/hooks/useSettingsStore'

interface TerminalViewProps {
  terminalSessions: TerminalSession[]
  onCloseTerminal: (sessionId: string) => void
  onRenameTerminal: (sessionId: string, newName: string) => void
  activeTerminalId: string | null
  onConnect: (
    alias: string,
    type: 'local' | 'remote',
    strategy?: 'internal' | 'external'
  ) => void
  onReconnectTerminal: (sessionId: string) => void
  onActiveTerminalChange: (sessionId: string | null) => void // 这是 setActiveTerminalId
  onStatusChange: (sessionId: string, status: ConnectionStatus) => void
  isActive: boolean
  isDarkMode: boolean
}

const defaultDarkTheme = gruvboxDarkDimmedTheme
const defaultLightTheme = atomOneLightTheme

export function TerminalView({
  terminalSessions,
  onCloseTerminal,
  onRenameTerminal,
  activeTerminalId,
  onConnect,
  onReconnectTerminal,
  onActiveTerminalChange,
  onStatusChange,
  isActive,
  isDarkMode,
}: TerminalViewProps) {
  const settings = useSettingsStore()

  // 新增 state，用于追踪哪个 Tab 正在被编辑
  const [editingTabId, setEditingTabId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const terminalFontFamily = FONT_FAMILIES[settings.terminalFontFamily].value

  // Effect to handle all theme updates, including system theme changes
  const currentTerminalTheme = useMemo((): ITheme => {
    if (settings.terminalThemeName === 'System Default') {
      // 当选择“系统默认”时，主题由 App.tsx 传递的 isDarkMode prop 决定
      return isDarkMode ? defaultDarkTheme : defaultLightTheme
    } else {
      return NAMED_THEMES[settings.terminalThemeName]?.theme ?? defaultDarkTheme
    }
  }, [settings.terminalThemeName, isDarkMode])

  // 使用 useLayoutEffect 来确保在 DOM 更新后立即执行 focus 操作，
  // 避免了因 useEffect 异步执行可能导致的延迟或闪烁。
  // 这对于需要立即与 DOM 交互的场景（如测量、焦点管理）是最佳实践。
  useLayoutEffect(() => {
    if (editingTabId && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editingTabId])

  const handleStartRename = (session: TerminalSession) => {
    setEditingTabId(session.id)
    setRenameValue(session.displayName)
  }

  const handleCommitRename = (sessionId: string) => {
    if (renameValue.trim()) {
      onRenameTerminal(sessionId, renameValue.trim())
    }
    setEditingTabId(null)
  }

  const handleOpenLocalTerminal = () => {
    onConnect('local', 'local', 'internal')
  }

  const getStatusIndicatorClass = (status: ConnectionStatus) => {
    switch (status) {
      case 'connected':
        return 'bg-green-500'
      case 'connecting':
        return 'bg-yellow-500 animate-pulse'
      case 'disconnected':
        return 'bg-red-500'
      default:
        return 'bg-gray-400'
    }
  }

  // --- State and Refs for Responsive Tabs ---
  const [visibleCount, setVisibleCount] = useState(0)
  const tabsListRef = useRef<HTMLDivElement>(null)
  const newTabButtonRef = useRef<HTMLButtonElement>(null)
  const moreTabsButtonRef = useRef<HTMLButtonElement>(null)
  const tabRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map())

  // --- Derived State for Active Tab ---
  const { activeIndex, activeSession } = useMemo(() => {
    const index = terminalSessions.findIndex((s) => s.id === activeTerminalId)
    return {
      activeIndex: index,
      activeSession: index > -1 ? terminalSessions[index] : null,
    }
  }, [terminalSessions, activeTerminalId])

  // Determine if the currently active tab is hidden inside the dropdown
  const isActiveTabHidden =
    activeIndex >= 0 && visibleCount > 0 && activeIndex >= visibleCount
  // --- Effect for Calculating Visible Tabs ---
  // 使用 useLayoutEffect 来解决竞态条件。
  // useEffect 是异步的，可能在 ref 附加到 DOM 元素之前运行，导致测量失败。
  // useLayoutEffect 是同步的，它保证在执行时 DOM 已经更新，ref 也已就绪，
  // 从而可以进行准确的宽度计算。
  useLayoutEffect(() => {
    const calculateVisibleTabs = () => {
      if (!tabsListRef.current) return

      const containerWidth = tabsListRef.current.offsetWidth
      const newTabButtonWidth = newTabButtonRef.current?.offsetWidth ?? 0
      const moreTabsButtonWidth = moreTabsButtonRef.current?.offsetWidth ?? 40 // Estimate if not rendered

      const availableWidth = containerWidth - newTabButtonWidth - 4 // Add a small buffer

      // --- Two-pass calculation to break the feedback loop ---

      // Pass 1: Optimistically check if all tabs can fit without a "more" button.
      let totalWidthOfAllTabs = 0
      let allTabsMeasured = true
      for (const session of terminalSessions) {
        const tabElement = tabRefs.current.get(session.id)
        if (!tabElement || tabElement.offsetWidth === 0) {
          allTabsMeasured = false
          break
        }
        totalWidthOfAllTabs += tabElement.offsetWidth
      }

      if (allTabsMeasured && totalWidthOfAllTabs <= availableWidth) {
        setVisibleCount(terminalSessions.length)
        return // All tabs fit, no need for a "more" button.
      }

      // Pass 2: Not all tabs fit. Calculate how many can fit alongside a "more" button.
      const availableWidthWithMoreButton = availableWidth - moreTabsButtonWidth
      let currentWidth = 0
      let count = 0
      for (const session of terminalSessions) {
        const tabElement = tabRefs.current.get(session.id)
        if (!tabElement) break // Already checked for measurement readiness in pass 1

        const tabWidth = tabElement.offsetWidth
        if (currentWidth + tabWidth <= availableWidthWithMoreButton) {
          currentWidth += tabWidth
          count++
        } else {
          break
        }
      }
      setVisibleCount(count)
    }

    // 初始计算被稍微延迟执行。
    // 这是一个健壮的方法，用于处理一个竞态条件：`useLayoutEffect` 的执行时机
    // 可能早于浏览器完全计算出新添加的 Tab 元素的布局（导致 offsetWidth 为 0）。
    // 将其延迟到下一个事件循环周期，可以确保测量时获取到准确的宽度。
    const timerId = setTimeout(calculateVisibleTabs, 0)

    // Use ResizeObserver to recalculate on container resize
    const resizeObserver = new ResizeObserver(calculateVisibleTabs)
    if (tabsListRef.current) {
      resizeObserver.observe(tabsListRef.current)
    }

    return () => {
      clearTimeout(timerId)
      if (tabsListRef.current) {
        // eslint-disable-next-line react-hooks/exhaustive-deps
        resizeObserver.unobserve(tabsListRef.current)
      }
    }
  }, [terminalSessions, isActiveTabHidden]) // Also recalculate when the 'more' button content changes

  // 如果没有活动的终端会话，我们显示一个欢迎界面，并提供“新建”按钮
  if (terminalSessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <p className="mb-4">No active terminal sessions.</p>
        <Button onClick={handleOpenLocalTerminal}>
          <Plus className="mr-2 h-4 w-4" /> New Local Terminal
        </Button>
      </div>
    )
  }

  return (
    <Tabs
      // 当 activeTerminalId 为 null 时，不设置 value，
      // 让 Tabs 组件自己处理默认状态，避免不必要的重渲染
      value={activeTerminalId ?? undefined}
      onValueChange={onActiveTerminalChange}
      className="h-full flex flex-col"
    >
      <div
        ref={tabsListRef}
        className="flex items-center pl-2 pr-2 border-b border-border"
      >
        {/*
          这个新的 div 容器模仿了原始 TabsList 的外观（灰色背景）。
          它现在同时包裹了可见的标签页和“更多”下拉按钮。
          这使得“更多”按钮可以与其它标签页在视觉上保持一致，
          例如，当激活的标签页被隐藏时，它也能拥有与其它激活标签页一样的高亮背景。
        */}
        <div className="inline-flex h-10 items-center justify-start rounded-md bg-muted p-1 text-muted-foreground flex-shrink overflow-hidden mr-2">
          <TabsList className="p-0 m-0 bg-transparent shadow-none">
            {terminalSessions.map((session, index) => (
              <TabsTrigger
                key={session.id}
                ref={(el) => {
                  // 使用花括号将函数体包裹起来，确保没有隐式返回值，
                  // 以满足 React ref 回调的 `void` 返回类型要求。
                  tabRefs.current.set(session.id, el)
                }}
                value={session.id}
                // We render all tabs, but visually hide the ones that don't fit.
                // This ensures we can always measure them.
                // Using `display: 'none'` would prevent measurement.
                style={
                  index >= visibleCount
                    ? { visibility: 'hidden', position: 'absolute' }
                    : {}
                }
                className="relative pr-8 flex items-center gap-2"
                onDoubleClick={() => handleStartRename(session)}
              >
                <ContextMenu>
                  <ContextMenuTrigger className="flex items-center gap-2">
                    <span
                      className={`h-2 w-2 rounded-full flex-shrink-0 ${getStatusIndicatorClass(session.status)}`}
                      aria-label={`Status: ${session.status}`}
                    />
                    {editingTabId === session.id ? (
                      <input
                        ref={inputRef}
                        type="text"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={() => handleCommitRename(session.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleCommitRename(session.id)
                          if (e.key === 'Escape') setEditingTabId(null)
                        }}
                        className="bg-transparent outline-none ring-0"
                      />
                    ) : (
                      session.displayName
                    )}
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    {/* <ContextMenuItem
                  onClick={() =>
                    navigator.clipboard.writeText(session.id).then(() => {
                      toast.success('Session ID copied to clipboard.')
                    })
                  }
                >
                  Copy Session ID
                </ContextMenuItem>
                <ContextMenuSeparator /> */}
                    <ContextMenuItem
                      onSelect={() => handleStartRename(session)}
                    >
                      Rename Tab
                    </ContextMenuItem>
                    <ContextMenuItem
                      onSelect={() => {
                        // Use a self-invoking async function to handle the promise
                        // and satisfy the linter, which expects a void return.
                        void (async () => {
                          // Add a tiny delay to solve a race condition:
                          // On local terminal duplication, the new session is created so fast
                          // that the state update can conflict with the ContextMenu's closing event,
                          // preventing the new tab from being properly activated.
                          // This delay ensures UI events are processed before connection starts.
                          await new Promise((resolve) =>
                            setTimeout(resolve, 150)
                          )
                          onConnect(
                            session.alias,
                            session.type as 'local' | 'remote',
                            'internal'
                          )
                        })()
                      }}
                    >
                      Duplicate Tab
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
                <span
                  role="button"
                  aria-label="Close Tab"
                  tabIndex={0}
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-5 w-5 rounded-full flex items-center justify-center hover:bg-muted"
                  onClick={(e) => {
                    e.stopPropagation()
                    onCloseTerminal(session.id)
                  }}
                  onKeyDown={(e) => {
                    // 优化：让它也能响应空格键
                    if (e.key === ' ' || e.key === 'Enter') {
                      e.preventDefault()
                      e.stopPropagation()
                      onCloseTerminal(session.id)
                    }
                  }}
                >
                  <XIcon className="h-3 w-3" />
                </span>
              </TabsTrigger>
            ))}
          </TabsList>

          {/* Dropdown for hidden tabs */}
          {visibleCount < terminalSessions.length && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  ref={moreTabsButtonRef}
                  className={cn(
                    // 基础样式，模仿 TabsTrigger
                    'inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm',
                    // 根据激活状态应用不同样式
                    {
                      'bg-background text-foreground shadow-sm':
                        isActiveTabHidden, // 激活状态：与激活的 Tab 样式相同
                      'hover:bg-accent hover:text-accent-foreground':
                        !isActiveTabHidden, // 非激活状态：添加 hover 效果
                    }
                  )}
                >
                  {isActiveTabHidden && activeSession ? (
                    <div className="flex items-center gap-1">
                      <span
                        className="max-w-[150px] truncate"
                        title={activeSession.displayName}
                      >
                        {activeSession.displayName}
                      </span>
                      <ChevronDown className="h-4 w-4 flex-shrink-0" />
                    </div>
                  ) : (
                    <MoreVertical className="h-4 w-4" />
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {terminalSessions.slice(visibleCount).map((session) => (
                  <ContextMenu key={session.id}>
                    <ContextMenuTrigger asChild>
                      {/* The onSelect event for DropdownMenuItem is prevented if an input is active */}
                      <DropdownMenuItem
                        onSelect={(e) => {
                          if (editingTabId === session.id) {
                            e.preventDefault() // Prevent closing menu when clicking on the input
                          } else {
                            onActiveTerminalChange(session.id)
                          }
                        }}
                        className={cn(
                          'flex justify-between items-center gap-2',
                          // 为下拉列表中的活动标签页添加一个高亮环（ring），
                          // 以便在暗色模式下清晰地标识出来。
                          session.id === activeTerminalId &&
                            'ring-1 ring-inset ring-accent'
                        )}
                      >
                        {editingTabId === session.id ? (
                          <input
                            ref={inputRef}
                            type="text"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onBlur={() => handleCommitRename(session.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter')
                                handleCommitRename(session.id)
                              if (e.key === 'Escape') setEditingTabId(null)
                            }}
                            className="bg-transparent outline-none ring-0 w-full"
                          />
                        ) : (
                          <span className="truncate">
                            {session.displayName}
                          </span>
                        )}
                        <span
                          className={`h-2 w-2 rounded-full flex-shrink-0 ${getStatusIndicatorClass(session.status)}`}
                        />
                      </DropdownMenuItem>
                    </ContextMenuTrigger>
                    <ContextMenuContent>
                      {/* <ContextMenuItem
                        onSelect={(e) => {
                          // Prevent the context menu (and parent dropdown) from closing
                          // when we initiate a rename, allowing the input to appear.
                          e.preventDefault()
                          handleStartRename(session)
                        }}
                      >
                        Rename Tab
                      </ContextMenuItem> */}
                      <ContextMenuItem
                        onSelect={() => {
                          void (async () => {
                            await new Promise((resolve) =>
                              setTimeout(resolve, 150)
                            )
                            onConnect(
                              session.alias,
                              session.type as 'local' | 'remote',
                              'internal'
                            )
                          })()
                        }}
                      >
                        Duplicate Tab
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2 p-1 flex-shrink-0">
          {/* New Terminal Button */}
          <Button
            ref={newTabButtonRef}
            onClick={handleOpenLocalTerminal}
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title="New Local Terminal"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex-grow relative">
        {terminalSessions.map((session) => (
          // 添加 forceMount 属性！
          // 这会强制 shadcn/ui 始终渲染所有的 Tab 内容，
          // 只是用 CSS 隐藏非激活的，而不是销毁它们。
          <TabsContent
            key={session.id}
            value={session.id}
            forceMount
            // 使用 z-index 确保只有激活的 Tab 在最上层接收事件
            className={`absolute inset-0 h-full w-full ${activeTerminalId === session.id ? 'z-10' : 'z-0'}`}
          >
            <IntegratedTerminal
              websocketUrl={session.url}
              id={session.id}
              displayName={session.displayName}
              isVisible={isActive && activeTerminalId === session.id}
              sessionType={session.alias === 'local' ? 'local' : 'remote'}
              onReconnect={() => onReconnectTerminal(session.id)}
              onStatusChange={onStatusChange}
              // 在 `TerminalView` 中为 `onStatusChange` prop 创建内联箭头函数，导致传递给 `IntegratedTerminal` 的函数引用在每次渲染时都发生变化。
              // 这触发了 `IntegratedTerminal` 内部依赖该 prop 的 `useEffect`，从而引发了状态更新和组件重渲染的死循环。
              // onStatusChange={(status) => onStatusChange(session.id, status)}
              theme={currentTerminalTheme}
              fontSize={settings.terminalFontSize}
              fontFamily={terminalFontFamily}
              copyOnSelect={settings.terminalCopyOnSelect}
              scrollback={settings.terminalScrollback}
              cursorStyle={settings.terminalCursorStyle}
              cursorBlink={settings.terminalCursorBlink}
            />
          </TabsContent>
        ))}
      </div>
    </Tabs>
  )
}
