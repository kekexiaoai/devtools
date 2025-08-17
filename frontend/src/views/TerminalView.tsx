import { useEffect, useRef, useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { IntegratedTerminal } from '@/components/sshgate/IntegratedTerminal'
import type { ConnectionStatus, TerminalSession } from '@/App'
import { Button } from '@/components/ui/button'
import { Plus, Settings, XIcon } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  NAMED_THEMES,
  FONT_FAMILIES,
  atomOneLightTheme,
  gruvboxDarkDimmedTheme,
} from '@/themes/terminalThemes'
import type { ITheme } from '@xterm/xterm'
import { Slider } from '@/components/ui/slider'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

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

const availableThemes: { name: string; theme: ITheme | null }[] = [
  { name: 'System Default', theme: null },
  ...Object.entries(NAMED_THEMES).map(([, theme]) => ({
    name: theme.name,
    theme: theme.theme,
  })),
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
  isDarkMode,
}: TerminalViewProps) {
  // 新增 state，用于追踪哪个 Tab 正在被编辑
  const [editingTabId, setEditingTabId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const [selectedThemeName, setSelectedThemeName] = useState<string>(
    availableThemes[0].name
  )
  const [currentTheme, setCurrentTheme] = useState<ITheme>(defaultDarkTheme)

  // Add new state for global font settings
  const [globalFontSize, setGlobalFontSize] = useState(12)
  const [globalFontFamilyKey, setGlobalFontFamilyKey] = useState('default')
  const [globalCopyOnSelect, setGlobalCopyOnSelect] = useState(true)
  const globalFontFamily = FONT_FAMILIES[globalFontFamilyKey].value

  const [globalScrollback, setGlobalScrollback] = useState<number>(1000)
  const [globalCursorStyle, setGlobalCursorStyle] = useState<
    'block' | 'underline' | 'bar' | undefined
  >(undefined)
  const [globalCursorBlink, setGlobalCursorBlink] = useState(true)

  // 主题切换处理函数
  const handleThemeChange = (themeName: string) => {
    setSelectedThemeName(themeName)
  }

  // Effect to handle all theme updates, including system theme changes
  // useEffect(() => {
  //   const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  //   const updateThemeForSystem = () => {
  //     setCurrentTheme(mediaQuery.matches ? defaultDarkTheme : defaultLightTheme)
  //   }

  //   if (selectedThemeName === 'System Default') {
  //     updateThemeForSystem()
  //     mediaQuery.addEventListener('change', updateThemeForSystem)
  //     return () =>
  //       mediaQuery.removeEventListener('change', updateThemeForSystem)
  //   } else {
  //     const selected = availableThemes.find((t) => t.name === selectedThemeName)
  //     if (selected?.theme) {
  //       setCurrentTheme(selected.theme)
  //     }
  //   }
  // }, [selectedThemeName])
  // Effect to handle all theme updates, including system theme changes
  useEffect(() => {
    if (selectedThemeName === 'System Default') {
      // 当选择“系统默认”时，主题由 App.tsx 传递的 isDarkMode prop 决定
      setCurrentTheme(isDarkMode ? defaultDarkTheme : defaultLightTheme)
    } else {
      const selected = availableThemes.find((t) => t.name === selectedThemeName)
      if (selected?.theme) {
        setCurrentTheme(selected.theme)
      }
    }
  }, [selectedThemeName, isDarkMode])

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

          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title="Global Terminal Settings"
              >
                <Settings className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-90" align="end">
              <div className="grid gap-4">
                <div className="space-y-2">
                  <h4 className="font-medium leading-none">Global Settings</h4>
                  <p className="text-sm text-muted-foreground">
                    Default appearance for all terminals.
                  </p>
                </div>
                <div className="grid gap-4">
                  <div className="grid grid-cols-5 items-center gap-4">
                    <Label htmlFor="global-font-size" className="col-span-2">
                      Font Size
                    </Label>
                    <div className="col-span-3 flex items-center gap-2">
                      <Slider
                        id="global-font-size"
                        min={8}
                        max={24}
                        step={1}
                        value={[globalFontSize]}
                        onValueChange={(value) => setGlobalFontSize(value[0])}
                        className="flex-1"
                      />
                      <span className="w-8 text-right text-sm text-muted-foreground">
                        {globalFontSize}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-5 items-center gap-4">
                    <Label htmlFor="global-font-family" className="col-span-2">
                      Font Family
                    </Label>
                    <Select
                      value={globalFontFamilyKey}
                      onValueChange={setGlobalFontFamilyKey}
                    >
                      <SelectTrigger
                        id="global-font-family"
                        className="col-span-3"
                      >
                        <SelectValue placeholder="Select font" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(FONT_FAMILIES).map(
                          ([key, { name }]) => (
                            <SelectItem key={key} value={key}>
                              {name}
                            </SelectItem>
                          )
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-5 items-center gap-4">
                    <Label htmlFor="global-theme" className="col-span-2">
                      Theme
                    </Label>
                    <Select
                      onValueChange={handleThemeChange}
                      value={selectedThemeName}
                    >
                      <SelectTrigger id="global-theme" className="col-span-3">
                        <SelectValue placeholder="Select theme" />
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
                  <div className="grid grid-cols-5 items-center gap-4">
                    <Label
                      htmlFor="global-copy-on-select"
                      className="col-span-2"
                    >
                      Copy on Select
                    </Label>
                    <div className="col-span-3">
                      <Switch
                        id="global-copy-on-select"
                        checked={globalCopyOnSelect}
                        onCheckedChange={setGlobalCopyOnSelect}
                      />
                    </div>
                  </div>
                  {/* Scrollback */}
                  <div className="grid grid-cols-5 items-center gap-4">
                    <Label htmlFor="scrollback" className="col-span-2">
                      Ccrollback
                    </Label>
                    <div className="col-span-3 flex items-center gap-2">
                      <Slider
                        id="scrollback"
                        min={1000}
                        max={10000}
                        step={100}
                        value={[globalScrollback]}
                        onValueChange={(value: number[]) => {
                          setGlobalScrollback(value[0])
                        }}
                        className="flex-1"
                      />
                      <span className="w-12 text-right text-sm text-muted-foreground">
                        {globalScrollback}
                      </span>
                    </div>
                  </div>
                  {/* Cursor Style */}
                  <div className="grid grid-cols-5 items-center gap-4">
                    <Label htmlFor="cursor-style" className="col-span-2">
                      Cursor Style
                    </Label>
                    <div className="col-span-3">
                      <Select
                        value={globalCursorStyle ?? 'default'}
                        onValueChange={(key) => {
                          setGlobalCursorStyle(
                            key as 'block' | 'underline' | 'bar'
                          )
                        }}
                      >
                        <SelectTrigger id="cursor-style">
                          <SelectValue placeholder="Select Style" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="default">Default</SelectItem>
                          <SelectItem value="block">Block</SelectItem>
                          <SelectItem value="underline">Underline</SelectItem>
                          <SelectItem value="bar">Bar</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {/* Cursor Blink */}
                  <div className="grid grid-cols-5 items-center gap-4">
                    <Label htmlFor="cursor-blink" className="col-span-2">
                      Cursor Blink
                    </Label>
                    <div className="col-span-3">
                      <Switch
                        id="cursor-blink"
                        checked={globalCursorBlink}
                        onCheckedChange={(checked) =>
                          setGlobalCursorBlink(checked)
                        }
                      />
                    </div>
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>
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
              theme={currentTheme}
              fontSize={globalFontSize}
              fontFamily={globalFontFamily}
              copyOnSelect={globalCopyOnSelect}
              scrollback={globalScrollback}
              cursorStyle={globalCursorStyle}
              cursorBlink={globalCursorBlink}
            />
          </TabsContent>
        ))}
      </div>
    </Tabs>
  )
}
