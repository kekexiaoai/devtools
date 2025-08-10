import { useEffect, useRef, useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { IntegratedTerminal } from '@/components/sshgate/IntegratedTerminal'
import type { ConnectionStatus, TerminalSession } from '@/App'
import { Button } from '@/components/ui/button'
import { Palette, Plus, XIcon } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select'
import {
  oneDarkTheme,
  solarizedLightTheme,
  draculaTheme,
  githubDarkTheme,
} from '@/themes/terminalThemes'
import type { ITheme } from '@xterm/xterm'

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
}

const defaultDarkTheme = oneDarkTheme
const defaultLightTheme = solarizedLightTheme

const availableThemes: { name: string; theme: ITheme | null }[] = [
  { name: 'System Default', theme: null },
  { name: 'One Dark', theme: oneDarkTheme },
  { name: 'Dracula', theme: draculaTheme },
  { name: 'GitHub Dark', theme: githubDarkTheme },
  { name: 'Solarized Light', theme: solarizedLightTheme },
]

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
}: TerminalViewProps) {
  // 新增 state，用于追踪哪个 Tab 正在被编辑
  const [editingTabId, setEditingTabId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const [selectedThemeName, setSelectedThemeName] = useState<string>(
    availableThemes[0].name
  )
  const [currentTheme, setCurrentTheme] = useState<ITheme>(defaultDarkTheme)

  // 主题切换处理函数
  const handleThemeChange = (themeName: string) => {
    setSelectedThemeName(themeName)
  }

  // Effect to handle all theme updates, including system theme changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const updateThemeForSystem = () => {
      setCurrentTheme(mediaQuery.matches ? defaultDarkTheme : defaultLightTheme)
    }

    if (selectedThemeName === 'System Default') {
      updateThemeForSystem()
      mediaQuery.addEventListener('change', updateThemeForSystem)
      return () =>
        mediaQuery.removeEventListener('change', updateThemeForSystem)
    } else {
      const selected = availableThemes.find((t) => t.name === selectedThemeName)
      if (selected?.theme) {
        setCurrentTheme(selected.theme)
      }
    }
  }, [selectedThemeName])

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
      <div className="flex items-center pl-2 pr-2">
        <TabsList className="flex-shrink overflow-x-auto m-0 mr-2">
          {terminalSessions.map((session) => (
            <TabsTrigger
              key={session.id}
              value={session.id}
              className="relative pr-8 flex items-center gap-2"
              onDoubleClick={() => handleStartRename(session)}
            >
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
        {/* 在 Tab 列表旁边，始终显示“新建”按钮 */}
        {/* 新建按钮 - 使用 ml-auto 固定在右侧 */}
        <Button
          onClick={() => void handleOpenLocalTerminal()}
          variant="ghost"
          size="icon"
          className="ml-auto flex-shrink-0"
        >
          <Plus className="h-4 w-4" />
        </Button>
        {/* 主题选择器 */}
        <Select onValueChange={handleThemeChange} value={selectedThemeName}>
          <SelectTrigger
            className="w-auto ml-2 flex-shrink-0 px-2"
            title="Change terminal theme"
          >
            <Palette className="h-4 w-4" />
          </SelectTrigger>
          <SelectContent>
            {availableThemes.map((t) => (
              <SelectItem key={t.name} value={t.name}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
              theme={currentTheme}
              // 在 `TerminalView` 中为 `onStatusChange` prop 创建内联箭头函数，导致传递给 `IntegratedTerminal` 的函数引用在每次渲染时都发生变化。
              // 这触发了 `IntegratedTerminal` 内部依赖该 prop 的 `useEffect`，从而引发了状态更新和组件重渲染的死循环。
              // onStatusChange={(status) => onStatusChange(session.id, status)}
            />
          </TabsContent>
        ))}
      </div>
    </Tabs>
  )
}
