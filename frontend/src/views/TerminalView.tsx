import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { useSettingsStore, type ShortcutAction } from '@/hooks/useSettingsStore'

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
  const {
    terminalFontSize,
    terminalFontFamily: terminalFontFamilyKey,
    terminalThemeName,
    terminalCopyOnSelect,
    terminalScrollback,
    terminalCursorStyle,
    terminalCursorBlink,
    confirmOnCloseTerminal,
    setConfirmOnCloseTerminal,
    shortcuts,
  } = useSettingsStore()

  // 新增 state，用于追踪哪个 Tab 正在被编辑
  const [editingTabId, setEditingTabId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const confirmCloseButtonRef = useRef<HTMLButtonElement>(null)

  // A ref to track how a rename operation was initiated. This helps manage focus correctly.
  // Renaming via a context menu requires a delay before focusing the input to avoid
  // conflicts with the menu's closing animation and focus-restoration logic.
  // Renaming via double-click does not need this delay.
  const renameInitiatedFromMenu = useRef(false)

  // State for close confirmation dialog
  const [confirmCloseSessionId, setConfirmCloseSessionId] = useState<
    string | null
  >(null)
  const [dontAskAgain, setDontAskAgain] = useState(false)

  const terminalFontFamily = FONT_FAMILIES[terminalFontFamilyKey].value

  // Effect to handle all theme updates, including system theme changes
  const currentTerminalTheme = useMemo((): ITheme => {
    if (terminalThemeName === 'System Default') {
      // 当选择“系统默认”时，主题由 App.tsx 传递的 isDarkMode prop 决定
      return isDarkMode ? defaultDarkTheme : defaultLightTheme
    } else {
      return NAMED_THEMES[terminalThemeName]?.theme ?? defaultDarkTheme
    }
  }, [terminalThemeName, isDarkMode])

  // 使用 useLayoutEffect 来确保在 DOM 更新后立即执行 focus 操作，
  // 避免了因 useEffect 异步执行可能导致的延迟或闪烁。
  // 这对于需要立即与 DOM 交互的场景（如测量、焦点管理）是最佳实践。
  useLayoutEffect(() => {
    if (editingTabId && inputRef.current) {
      // If rename was started from a menu, we need a delay to let the menu close
      // and avoid focus conflicts. Otherwise, focus immediately.
      const delay = renameInitiatedFromMenu.current ? 150 : 0
      // 使用 setTimeout 将焦点操作推迟到下一个事件循环。
      // 这是一种健壮的技术，可以防止在 input 出现时，
      // 其他 UI 元素（如正在保持打开的菜单）的焦点事件干扰，从而确保输入框能稳定地获得焦点。
      setTimeout(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
        // Reset the flag after use
        renameInitiatedFromMenu.current = false
      }, delay)
    }
  }, [editingTabId])

  const handleOpenLocalTerminal = useCallback(() => {
    onConnect('local', 'local', 'internal')
  }, [onConnect])

  // --- Effect for Keyboard Shortcuts ---
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Only handle shortcuts if this view is active.
      if (!isActive) {
        return
      }

      const matchShortcut = (action: ShortcutAction): boolean => {
        const shortcut = shortcuts[action]
        if (
          !shortcut ||
          event.key.toLowerCase() !== shortcut.key.toLowerCase()
        ) {
          return false
        }

        // For Ctrl/Meta, if both are true in config, it means "Cmd OR Ctrl".
        if (shortcut.ctrl && shortcut.meta) {
          if (!event.ctrlKey && !event.metaKey) return false
        } else {
          // Otherwise, it's a strict match.
          if (shortcut.ctrl !== event.ctrlKey) return false
          if (shortcut.meta !== event.metaKey) return false
        }

        if (shortcut.alt !== event.altKey) return false
        if (shortcut.shift !== event.shiftKey) return false

        return true
      }

      if (matchShortcut('newTerminal')) {
        event.preventDefault()
        event.stopPropagation()
        handleOpenLocalTerminal()
        return
      }

      if (matchShortcut('closeTab')) {
        event.preventDefault()
        event.stopPropagation()
        if (activeTerminalId) {
          if (confirmOnCloseTerminal) {
            setConfirmCloseSessionId(activeTerminalId)
          } else {
            onCloseTerminal(activeTerminalId)
          }
        }
        return
      }

      // --- Tab Switching (Ctrl+Tab) ---
      if (terminalSessions.length <= 1) return // No tabs to switch

      const handleTabSwitch = (isReverse: boolean) => {
        // Prevent the browser's default tab switching behavior.
        event.preventDefault()
        // Stop the event from propagating further down to other elements,
        // like the xterm.js terminal, which would otherwise interpret the 'Tab' key press.
        event.stopPropagation()

        const currentIndex = terminalSessions.findIndex(
          (s) => s.id === activeTerminalId
        )
        if (currentIndex === -1) return // Should not happen if a tab is active

        let nextIndex: number
        if (isReverse) {
          // Ctrl+Shift+Tab: Go to the previous tab, wrapping around.
          nextIndex =
            (currentIndex - 1 + terminalSessions.length) %
            terminalSessions.length
        } else {
          // Ctrl+Tab: Go to the next tab, wrapping around.
          nextIndex = (currentIndex + 1) % terminalSessions.length
        }

        const nextSessionId = terminalSessions[nextIndex].id
        onActiveTerminalChange(nextSessionId)
      }

      if (matchShortcut('nextTab')) {
        handleTabSwitch(false)
      } else if (matchShortcut('prevTab')) {
        // The `matchShortcut` for prevTab already checks for the Shift key
        // based on the user's configuration.
        handleTabSwitch(true)
      }
    }

    // Add the event listener in the capture phase (the `true` argument).
    // This ensures our global shortcut handler runs *before* xterm.js's
    // own keydown handler can stop the event's propagation.
    window.addEventListener('keydown', handleKeyDown, true)

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [
    isActive,
    terminalSessions,
    activeTerminalId,
    onActiveTerminalChange,
    onCloseTerminal,
    confirmOnCloseTerminal,
    handleOpenLocalTerminal,
    shortcuts,
  ])

  const handleStartRename = (session: TerminalSession, fromMenu = false) => {
    renameInitiatedFromMenu.current = fromMenu
    setEditingTabId(session.id)
    setRenameValue(session.displayName)
  }

  const handleCommitRename = (sessionId: string) => {
    if (renameValue.trim()) {
      onRenameTerminal(sessionId, renameValue.trim())
    }
    setEditingTabId(null)
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
                {editingTabId === session.id ? (
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2 w-2 rounded-full flex-shrink-0 ${getStatusIndicatorClass(
                        session.status
                      )}`}
                    />
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
                  </div>
                ) : (
                  <ContextMenu>
                    <ContextMenuTrigger className="flex items-center gap-2">
                      <span
                        className={`h-2 w-2 rounded-full flex-shrink-0 ${getStatusIndicatorClass(
                          session.status
                        )}`}
                        aria-label={`Status: ${session.status}`}
                      />
                      {session.displayName}
                    </ContextMenuTrigger>
                    <ContextMenuContent>
                      <ContextMenuItem
                        onSelect={() => handleStartRename(session, true)}
                      >
                        Rename Tab
                      </ContextMenuItem>
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
                )}
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
          {visibleCount < terminalSessions.length &&
            // If editing the hidden active tab, render the input directly.
            // This avoids focus conflicts from menus closing.
            (isActiveTabHidden &&
            activeSession &&
            editingTabId === activeSession.id ? (
              // Render an element that perfectly mimics an active TabsTrigger in edit mode.
              <div className="inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium bg-background text-foreground shadow-sm">
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full flex-shrink-0 ${getStatusIndicatorClass(
                      activeSession.status
                    )}`}
                  />
                  <input
                    ref={inputRef}
                    type="text"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => handleCommitRename(activeSession.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter')
                        handleCommitRename(activeSession.id)
                      if (e.key === 'Escape') setEditingTabId(null)
                    }}
                    className="bg-transparent outline-none ring-0"
                  />
                </div>
              </div>
            ) : (
              <DropdownMenu>
                <ContextMenu>
                  <ContextMenuTrigger asChild disabled={!isActiveTabHidden}>
                    <DropdownMenuTrigger asChild>
                      <button
                        ref={moreTabsButtonRef}
                        onDoubleClick={() => {
                          if (isActiveTabHidden && activeSession) {
                            handleStartRename(activeSession)
                          }
                        }}
                        className={cn(
                          'inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                          isActiveTabHidden
                            ? 'bg-background text-foreground shadow-sm'
                            : 'hover:bg-accent hover:text-accent-foreground'
                        )}
                      >
                        {isActiveTabHidden && activeSession ? (
                          <div className="flex items-center gap-2">
                            <span
                              className={`h-2 w-2 rounded-full flex-shrink-0 ${getStatusIndicatorClass(
                                activeSession.status
                              )}`}
                            />
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
                  </ContextMenuTrigger>
                  <DropdownMenuContent align="end">
                    {terminalSessions.slice(visibleCount).map((session) => (
                      <DropdownMenuItem
                        key={session.id}
                        onSelect={() => onActiveTerminalChange(session.id)}
                        className={cn(
                          'flex justify-between items-center gap-2',
                          session.id === activeTerminalId &&
                            'ring-1 ring-inset ring-accent'
                        )}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <span
                            className={`h-2 w-2 rounded-full flex-shrink-0 ${getStatusIndicatorClass(
                              session.status
                            )}`}
                          />
                          <span className="truncate">
                            {session.displayName}
                          </span>
                        </div>
                        <button
                          aria-label={`Close tab ${session.displayName}`}
                          className="p-1 -mr-2 rounded-full hover:bg-muted-foreground/20 flex-shrink-0"
                          onClick={(e) => {
                            e.stopPropagation()
                            onCloseTerminal(session.id)
                          }}
                        >
                          <XIcon className="h-3 w-3" />
                        </button>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                  {/* Conditionally render the context menu content to ensure `activeSession` is not null, satisfying TypeScript. */}
                  {isActiveTabHidden && activeSession && (
                    <ContextMenuContent>
                      <ContextMenuItem
                        onSelect={() => handleStartRename(activeSession, true)}
                      >
                        Rename Tab
                      </ContextMenuItem>
                      <ContextMenuItem
                        onSelect={() => {
                          void (async () => {
                            await new Promise((resolve) =>
                              setTimeout(resolve, 150)
                            )
                            onConnect(
                              activeSession.alias,
                              activeSession.type as 'local' | 'remote',
                              'internal'
                            )
                          })()
                        }}
                      >
                        Duplicate Tab
                      </ContextMenuItem>
                    </ContextMenuContent>
                  )}
                </ContextMenu>
              </DropdownMenu>
            ))}
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

      {/* Confirmation Dialog for Closing Tab */}
      <AlertDialog
        open={!!confirmCloseSessionId}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setConfirmCloseSessionId(null)
            setDontAskAgain(false) // Reset checkbox on close
          }
        }}
      >
        <AlertDialogContent
          onOpenAutoFocus={(e) => {
            // 阻止默认的焦点行为（通常是聚焦到取消按钮）
            e.preventDefault()
            // 手动将焦点设置到我们的确认按钮上
            confirmCloseButtonRef.current?.focus()
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>
              Are you sure you want to close this tab?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The running process in this terminal will be terminated. This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-center space-x-2 my-4">
            <Checkbox
              id="dont-ask-again"
              checked={dontAskAgain}
              onCheckedChange={(checked) => setDontAskAgain(checked as boolean)}
            />
            <Label
              htmlFor="dont-ask-again"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              Don't ask me again
            </Label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                ref={confirmCloseButtonRef}
                variant="destructive"
                onClick={handleConfirmClose}
              >
                Close Tab
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
              fontSize={terminalFontSize}
              fontFamily={terminalFontFamily}
              copyOnSelect={terminalCopyOnSelect}
              scrollback={terminalScrollback}
              cursorStyle={terminalCursorStyle}
              cursorBlink={terminalCursorBlink}
            />
          </TabsContent>
        ))}
      </div>
    </Tabs>
  )

  function handleConfirmClose() {
    if (confirmCloseSessionId) {
      onCloseTerminal(confirmCloseSessionId)
      if (dontAskAgain) {
        setConfirmOnCloseTerminal(false)
      }
    }
  }
}
