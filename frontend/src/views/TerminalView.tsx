import { useEffect, useMemo, useRef, useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { IntegratedTerminal } from '@/components/sshgate/IntegratedTerminal'
import type { ConnectionStatus, TerminalSession } from '@/App'
import { Button } from '@/components/ui/button'
import { Plus, XIcon } from 'lucide-react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  // ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
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

  useEffect(() => {
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

  // 如果没有活动的终端会话，我们显示一个欢迎界面，并提供“新建”按钮
  if (terminalSessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <p className="mb-4">No active terminal sessions.</p>
        <Button onClick={() => void handleOpenLocalTerminal()}>
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
      <div className="flex items-center pl-2 pr-2 border-b border-border">
        <TabsList className="flex-shrink overflow-x-auto m-0 mr-2">
          {terminalSessions.map((session) => (
            <TabsTrigger
              key={session.id}
              value={session.id}
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
                    onClick={() =>
                      onConnect(
                        session.alias,
                        session.type as 'local' | 'remote',
                        'internal'
                      )
                    }
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
        <div className="ml-auto flex items-center gap-2 p-1 flex-shrink-0">
          {/* New Terminal Button */}
          <Button
            onClick={() => void handleOpenLocalTerminal()}
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
