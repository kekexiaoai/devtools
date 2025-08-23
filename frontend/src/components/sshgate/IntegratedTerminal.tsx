import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useXTerm } from 'react-xtermjs'
import { FitAddon } from '@xterm/addon-fit'
import { useDependencyTracer } from '@/hooks/useDependencyTracer'
import { Button } from '@/components/ui/button'
import type { ConnectionStatus } from '@/App'
import { AlertTriangle, RefreshCw, Settings, RotateCcw } from 'lucide-react'
import { useWebSocketTerminal } from '@/hooks/useWebSocketTerminal'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import { Switch } from '@/components/ui/switch'
interface IntegratedTerminalProps {
  websocketUrl: string
  id: string
  displayName: string
  isVisible: boolean // Triggers resize when the component becomes visible
  sessionType: 'local' | 'remote'
  onReconnect: () => void
  onStatusChange: (sessionId: string, status: ConnectionStatus) => void
  theme: ITheme
  fontSize?: number
  fontFamily?: string
  copyOnSelect?: boolean
  scrollback?: number
  cursorStyle?: 'block' | 'underline' | 'bar'
  cursorBlink?: boolean
}

import { appLogger } from '@/lib/logger'
import { Terminal, type ITheme } from '@xterm/xterm'

// --- 复用全局主题定义 ---
import { NAMED_THEMES } from '@/themes/terminalThemes'
import { FONT_FAMILIES } from '@/themes/terminalThemes'

// 扩展Terminal类型以解决类型定义问题（如果类型文件缺失）
import { useTerminalSetting } from '@/hooks/useTerminalSetting'
interface ExtendedTerminal extends Terminal {
  on?(event: 'focus' | 'blur', handler: () => void): void
  off?(event: 'focus' | 'blur', handler: () => void): void
}

export function IntegratedTerminal({
  websocketUrl,
  id,
  displayName,
  isVisible,
  sessionType,
  onReconnect,
  theme,
  onStatusChange,
  fontSize,
  fontFamily,
  copyOnSelect,
  scrollback,
  cursorStyle,
  cursorBlink,
}: IntegratedTerminalProps) {
  // --- Settings Management using the custom hook ---
  const {
    effectiveValue: effectiveFontSize,
    setLocalValue: setLocalFontSize,
    isOverridden: isFontSizeOverridden,
    reset: resetFontSize,
  } = useTerminalSetting(fontSize, 12)

  const {
    effectiveValue: effectiveCopyOnSelect,
    setLocalValue: setLocalCopyOnSelect,
    isOverridden: isCopyOnSelectOverridden,
    reset: resetCopyOnSelect,
  } = useTerminalSetting(copyOnSelect, true)

  const {
    effectiveValue: effectiveScrollback,
    setLocalValue: setLocalScrollback,
    isOverridden: isScrollbackOverridden,
    reset: resetScrollback,
  } = useTerminalSetting(scrollback, 1000)

  const {
    effectiveValue: effectiveCursorStyle,
    setLocalValue: setLocalCursorStyle,
    isOverridden: isCursorStyleOverridden,
    reset: resetCursorStyle,
  } = useTerminalSetting<'block' | 'underline' | 'bar'>(cursorStyle, 'block')

  const {
    effectiveValue: effectiveCursorBlink,
    setLocalValue: setLocalCursorBlink,
    isOverridden: isCursorBlinkOverridden,
    reset: resetCursorBlink,
  } = useTerminalSetting(cursorBlink, true)

  // These settings have more complex logic (mapping keys to objects/values)
  // and are kept separate for now.
  const [localThemeKey, setLocalThemeKey] = useState<string | null>(null)
  const [localFontFamilyKey, setLocalFontFamilyKey] = useState<string | null>(
    null
  )

  // --- 计算最终生效的设置 ---
  const effectiveTheme = localThemeKey
    ? NAMED_THEMES[localThemeKey as keyof typeof NAMED_THEMES]?.theme
    : theme
  const effectiveFontFamily = localFontFamilyKey
    ? FONT_FAMILIES[localFontFamilyKey]?.value
    : (fontFamily ?? FONT_FAMILIES.default.value)

  // 调用 Hook，获取 terminal 实例和 ref
  // useXTerm 的 options 只在首次创建时使用。
  // 这里我们只使用从 props 传入的初始值，动态变化由 useEffect 处理。
  const { instance: terminal, ref } = useXTerm({
    options: useMemo(
      () => ({
        // Use initial values from props, with defaults
        cursorBlink: cursorBlink ?? true,
        scrollback: scrollback ?? 1000,
        fontSize: fontSize ?? 12,
        fontFamily: fontFamily ?? FONT_FAMILIES.default.value,
        theme,
      }),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [] // 空依赖数组确保 options 引用永不改变
    ),
  })

  const extendedTerminal = terminal as ExtendedTerminal | undefined

  // 将 FitAddon 实例化一次
  // useMemo 确保它只在组件首次渲染时被创建
  const fitAddon = useMemo(() => new FitAddon(), [])

  // --- Logger Setup ---
  // Ref to hold the latest displayName, preventing it from being a dependency
  // for effects that should not re-run on rename.
  const displayNameRef = useRef(displayName)
  useEffect(() => {
    displayNameRef.current = displayName
  }, [displayName])

  // Create a stable logger instance using useMemo.
  // This logger's methods close over the displayNameRef, so they always use the
  // latest displayName without making the logger object itself a dependency of it.
  const logger = useMemo(() => {
    // By passing a function, the prefix is dynamically resolved on each log call,
    // correctly reading the latest `displayNameRef.current`.
    // This elegantly solves the stale closure problem described in `react-stale-closure-ref-pattern.md`.
    const getDynamicPrefix = () => `<${displayNameRef.current}>`
    return appLogger
      .withPrefix('Terminal')
      .withPrefix(id)
      .withPrefix(getDynamicPrefix)
  }, [id])

  // 使用useDependencyTracer替代手动依赖追踪
  useDependencyTracer(
    { websocketUrl, terminal, fitAddon, ref, logger, isVisible },
    logger,
    'Terminal Dependencies'
  )

  // debug
  useEffect(() => {
    logger.info(`[useEffect] visible: ${isVisible}`)
  }, [isVisible, logger])

  // 状态跟踪引用 (Refs for state tracking)
  const resizeObserverRef = useRef<ResizeObserver | null>(null) // 尺寸监控实例
  const terminalContainerRef = ref
  const settingsContainerRef = useRef<HTMLDivElement>(null)
  const popoverContentRef = useRef<HTMLDivElement>(null)

  const adjustTerminalSize = useCallback(async () => {
    if (!terminal || !terminalContainerRef.current || !isVisible) return

    try {
      // 确保DOM和字体加载完成
      await Promise.all([
        new Promise((resolve) => requestAnimationFrame(resolve)),
        document.fonts.ready,
      ])

      const container = terminalContainerRef.current
      // 强制触发重排，获取最新尺寸
      void container.offsetHeight

      // 应用尺寸适配
      fitAddon.fit()

      // 记录调整后的尺寸
      const dims = fitAddon.proposeDimensions()
      logger.info(
        `Terminal size adjusted: ${dims?.cols} columns x ${dims?.rows} rows`
      )
    } catch (error) {
      logger.error('Failed to adjust terminal size', error)
    }
  }, [terminal, terminalContainerRef, isVisible, fitAddon, logger])

  useEffect(() => {
    if (!terminalContainerRef.current || !terminal) return

    resizeObserverRef.current = new ResizeObserver((entries) => {
      if (isVisible && entries.length > 0) {
        void adjustTerminalSize()
      }
    })

    const container = terminalContainerRef.current
    if (container) {
      resizeObserverRef.current.observe(container)
    }
    logger.info('ResizeObserver started monitoring container size')

    return () => {
      if (resizeObserverRef.current && container) {
        resizeObserverRef.current.unobserve(container)
      }
      resizeObserverRef.current = null
      logger.info('ResizeObserver stopped monitoring')
    }
  }, [terminal, adjustTerminalSize, isVisible, logger, terminalContainerRef])

  // Adjust size and focus when visibility changes
  useEffect(() => {
    if (isVisible) {
      // When the terminal becomes visible, its container's dimensions might not be
      // immediately available in the same render cycle. A small delay ensures the
      // fit calculation and focus run after the layout has stabilized.
      const timer = setTimeout(() => {
        void adjustTerminalSize()
        if (terminal) {
          terminal.focus()
        }
      }, 50) // A small delay is often sufficient.

      return () => clearTimeout(timer)
    }
  }, [isVisible, adjustTerminalSize, terminal])

  // --- 动态应用设置 ---
  // 这个 Effect 会在任何设置（本地或全局）变化时运行
  // 它直接修改现有终端实例的选项，而不会重新创建它
  useEffect(() => {
    if (!terminal) return

    let settingsChanged = false
    if (terminal.options.fontSize !== effectiveFontSize) {
      terminal.options.fontSize = effectiveFontSize
      settingsChanged = true
    }
    if (terminal.options.fontFamily !== effectiveFontFamily) {
      terminal.options.fontFamily = effectiveFontFamily
      settingsChanged = true
    }
    if (terminal.options.theme !== effectiveTheme) {
      terminal.options.theme = effectiveTheme
    }
    if (terminal.options.scrollback !== effectiveScrollback) {
      terminal.options.scrollback = effectiveScrollback
    }
    if (terminal.options.cursorStyle !== effectiveCursorStyle) {
      terminal.options.cursorStyle = effectiveCursorStyle
    }

    if (terminal.options.cursorBlink !== effectiveCursorBlink) {
      terminal.options.cursorBlink = effectiveCursorBlink
    }

    // Force a redraw to apply visual changes from options
    terminal.refresh(0, terminal.rows - 1)
    // 字体大小或族裔变化需要重新计算终端尺寸
    if (settingsChanged) {
      void adjustTerminalSize()
    }
  }, [
    terminal,
    effectiveFontSize,
    effectiveFontFamily,
    effectiveTheme,
    effectiveScrollback,
    effectiveCursorStyle,
    effectiveCursorBlink,
    adjustTerminalSize,
  ])

  // --- Implement Copy on Select functionality ---
  useEffect(() => {
    if (!terminal) {
      return
    }

    // This handler will be called whenever the selection changes.
    const handleSelectionChange = () => {
      if (effectiveCopyOnSelect && terminal.hasSelection()) {
        const selection = terminal.getSelection()
        if (selection) {
          navigator.clipboard.writeText(selection).catch((err) => {
            logger.error('Failed to copy to clipboard:', err)
          })
        }
      }
    }

    const disposable = terminal.onSelectionChange(handleSelectionChange)

    return () => disposable.dispose()
  }, [terminal, effectiveCopyOnSelect, logger]) // Re-run if terminal or the setting changes

  // --- Connection State Management ---
  const { connectionStatus } = useWebSocketTerminal({
    websocketUrl,
    terminal: extendedTerminal,
    logger,
  })

  // Report status changes to the parent component
  useEffect(() => {
    onStatusChange(id, connectionStatus)
  }, [id, connectionStatus, onStatusChange])

  // Load addons when terminal is ready
  useEffect(() => {
    if (extendedTerminal) {
      extendedTerminal.loadAddon(fitAddon)
      logger.info('FitAddon loaded.')
    }
  }, [extendedTerminal, fitAddon, logger])

  // 自动重连本地会话
  useEffect(() => {
    if (
      sessionType === 'local' &&
      connectionStatus === 'disconnected' &&
      isVisible
    ) {
      logger.info(
        'Local terminal disconnected, attempting to auto-reconnect...'
      )
      const timer = setTimeout(onReconnect, 1000) // 延迟1秒后自动重连
      return () => clearTimeout(timer)
    }
  }, [sessionType, connectionStatus, isVisible, onReconnect, logger])

  // 鼠标点击处理
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // If the click is on the settings area, do nothing.
      // Let the event propagate so the Popover can handle it.
      // We check both the trigger area and the portaled content area.
      if (
        (settingsContainerRef.current &&
          settingsContainerRef.current.contains(e.target as Node)) ||
        (popoverContentRef.current &&
          popoverContentRef.current.contains(e.target as Node))
      ) {
        return
      }

      // If the click is on the terminal area itself,
      // prevent the default browser behavior (like text selection outside the terminal)
      // and programmatically focus the terminal instance.
      // e.preventDefault() // This was preventing copyOnSelect from working.
      if (extendedTerminal) {
        extendedTerminal.focus()
        logger.debug('Terminal area clicked, focusing xterm.')
      }
    },
    [extendedTerminal, logger]
  )

  return (
    <div
      className="h-full w-full rounded-md overflow-hidden relative"
      ref={terminalContainerRef}
      onMouseDown={handleMouseDown}
      style={{ outline: 'none' }}
    >
      {/* --- 设置面板 --- */}
      <div className="absolute top-2 right-2 z-30" ref={settingsContainerRef}>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="text-gray-400 hover:text-white hover:bg-gray-700/50"
              title="Terminal Settings"
            >
              <Settings className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent ref={popoverContentRef} className="w-90" align="end">
            <div className="grid gap-4">
              <div className="space-y-2">
                <h4 className="font-medium leading-none">Appearance</h4>
                <p className="text-sm text-muted-foreground">
                  Adjust settings for this terminal session.
                </p>
              </div>
              <div className="grid gap-4 pt-2">
                {/* Font Size */}
                <div className="grid grid-cols-5 items-center gap-4">
                  <div
                    className="col-span-2 group flex cursor-pointer items-center gap-1.5"
                    onClick={(e) => {
                      if (isFontSizeOverridden) {
                        // Prevent default mousedown behavior which can cause focus shifts
                        // and trigger the popover to close.
                        e.preventDefault()
                        setTimeout(() => resetFontSize(), 0)
                      }
                    }}
                  >
                    <Label
                      htmlFor="font-size"
                      className="cursor-pointer"
                      title={
                        isFontSizeOverridden ? 'Reset to default' : undefined
                      }
                    >
                      Font Size
                    </Label>
                    <RotateCcw
                      className={`h-3 w-3 text-muted-foreground transition-opacity ${
                        isFontSizeOverridden
                          ? 'opacity-50 group-hover:opacity-100 cursor-pointer'
                          : 'opacity-0'
                      }`}
                    />
                  </div>
                  <div className="col-span-3 flex items-center gap-2">
                    <Slider
                      id="font-size"
                      min={8}
                      max={24}
                      step={1}
                      value={[effectiveFontSize]}
                      onValueChange={(value: number[]) =>
                        setLocalFontSize(value[0])
                      }
                      className="flex-1"
                    />
                    <span className="w-8 text-right text-sm text-muted-foreground">
                      {effectiveFontSize}
                    </span>
                  </div>
                </div>
                {/* Font Family */}
                <div className="grid grid-cols-5 items-center gap-4">
                  <div
                    className="col-span-2 group flex cursor-pointer items-center gap-1.5"
                    onClick={(e) => {
                      if (localFontFamilyKey !== null) {
                        // Prevent default mousedown behavior which can cause focus shifts
                        // and trigger the popover to close.
                        e.preventDefault()
                        setTimeout(() => setLocalFontFamilyKey(null), 0)
                      }
                    }}
                  >
                    <Label
                      htmlFor="font-family"
                      className="cursor-pointer"
                      title={
                        localFontFamilyKey !== null
                          ? 'Reset to default'
                          : undefined
                      }
                    >
                      Font Family
                    </Label>
                    <RotateCcw
                      className={`h-3 w-3 text-muted-foreground transition-opacity ${
                        localFontFamilyKey !== null
                          ? 'opacity-50 group-hover:opacity-100 cursor-pointer'
                          : 'opacity-0'
                      }`}
                    />
                  </div>
                  <Select
                    value={localFontFamilyKey ?? 'default'}
                    onValueChange={(key) =>
                      setLocalFontFamilyKey(key === 'default' ? null : key)
                    }
                  >
                    <SelectTrigger id="font-family" className="col-span-3">
                      <SelectValue placeholder="Select font" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(FONT_FAMILIES).map(([key, { name }]) => (
                        <SelectItem key={key} value={key}>
                          {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {/* Theme */}
                <div className="grid grid-cols-5 items-center gap-4">
                  <div
                    className="col-span-2 group flex cursor-pointer items-center gap-1.5"
                    onClick={(e) => {
                      if (localThemeKey !== null) {
                        // Prevent default mousedown behavior which can cause focus shifts
                        // and trigger the popover to close.
                        e.preventDefault()
                        setTimeout(() => setLocalThemeKey(null), 0)
                      }
                    }}
                  >
                    <Label
                      htmlFor="theme"
                      className="cursor-pointer"
                      title={
                        localThemeKey !== null ? 'Reset to default' : undefined
                      }
                    >
                      Theme
                    </Label>
                    <RotateCcw
                      className={`h-3 w-3 text-muted-foreground transition-opacity ${
                        localThemeKey !== null
                          ? 'opacity-50 group-hover:opacity-100 cursor-pointer'
                          : 'opacity-0'
                      }`}
                    />
                  </div>
                  <Select
                    value={localThemeKey ?? 'default'}
                    onValueChange={(key) =>
                      setLocalThemeKey(key === 'default' ? null : key)
                    }
                  >
                    <SelectTrigger id="theme" className="col-span-3">
                      <SelectValue placeholder="Select theme" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">Default</SelectItem>
                      {Object.entries(NAMED_THEMES).map(([key, { name }]) => (
                        <SelectItem key={key} value={key}>
                          {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {/* Copy on Select */}
                <div className="grid grid-cols-5 items-center gap-4">
                  <div
                    className="col-span-2 group flex cursor-pointer items-center gap-1.5"
                    onClick={(e) => {
                      if (isCopyOnSelectOverridden) {
                        e.preventDefault()
                        setTimeout(() => resetCopyOnSelect(), 0)
                      }
                    }}
                  >
                    <Label
                      htmlFor="copy-on-select"
                      className="cursor-pointer"
                      title={
                        isCopyOnSelectOverridden
                          ? 'Reset to default'
                          : undefined
                      }
                    >
                      Copy on Select
                    </Label>
                    <RotateCcw
                      className={`h-3 w-3 text-muted-foreground transition-opacity ${
                        isCopyOnSelectOverridden
                          ? 'opacity-50 group-hover:opacity-100 cursor-pointer'
                          : 'opacity-0'
                      }`}
                    />
                  </div>
                  <div className="col-span-3">
                    <Switch
                      id="copy-on-select"
                      checked={effectiveCopyOnSelect}
                      onCheckedChange={(checked) =>
                        setLocalCopyOnSelect(checked)
                      }
                    />
                  </div>
                </div>

                {/* Scrollback */}
                <div className="grid grid-cols-5 items-center gap-4">
                  <div
                    className="col-span-2 group flex cursor-pointer items-center gap-1.5"
                    onClick={(e) => {
                      if (isScrollbackOverridden) {
                        e.preventDefault()
                        setTimeout(() => resetScrollback(), 0)
                      }
                    }}
                  >
                    <Label
                      htmlFor="scrollback"
                      className="cursor-pointer"
                      title={
                        isScrollbackOverridden ? 'Reset to default' : undefined
                      }
                    >
                      Scrollback
                    </Label>
                    <RotateCcw
                      className={`h-3 w-3 text-muted-foreground transition-opacity ${
                        isScrollbackOverridden
                          ? 'opacity-50 group-hover:opacity-100 cursor-pointer'
                          : 'opacity-0'
                      }`}
                    />
                  </div>
                  <div className="col-span-3 flex items-center gap-2">
                    <Slider
                      id="scrollback"
                      min={1000}
                      max={10000}
                      step={100}
                      value={[effectiveScrollback]}
                      onValueChange={(value: number[]) =>
                        setLocalScrollback(value[0])
                      }
                      className="flex-1"
                    />
                    <span className="w-12 text-right text-sm text-muted-foreground">
                      {effectiveScrollback}
                    </span>
                  </div>
                </div>

                {/* Cursor Style */}
                <div className="grid grid-cols-5 items-center gap-4">
                  <div
                    className="col-span-2 group flex cursor-pointer items-center gap-1.5"
                    onClick={(e) => {
                      if (isCursorStyleOverridden) {
                        e.preventDefault()
                        setTimeout(() => resetCursorStyle(), 0)
                      }
                    }}
                  >
                    <Label
                      htmlFor="cursor-style"
                      className="cursor-pointer"
                      title={
                        isCursorStyleOverridden ? 'Reset to default' : undefined
                      }
                    >
                      Cursor Style
                    </Label>
                    <RotateCcw
                      className={`h-3 w-3 text-muted-foreground transition-opacity ${
                        isCursorStyleOverridden
                          ? 'opacity-50 group-hover:opacity-100 cursor-pointer'
                          : 'opacity-0'
                      }`}
                    />
                  </div>
                  <Select
                    value={
                      isCursorStyleOverridden ? effectiveCursorStyle : 'default'
                    }
                    onValueChange={(key) =>
                      setLocalCursorStyle(
                        key === 'default'
                          ? null
                          : (key as 'block' | 'underline' | 'bar')
                      )
                    }
                  >
                    <SelectTrigger id="cursor-style" className="col-span-3">
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

                {/* Cursor Blink */}
                <div className="grid grid-cols-5 items-center gap-4">
                  <div
                    className="col-span-2 group flex cursor-pointer items-center gap-1.5"
                    onClick={(e) => {
                      if (isCursorBlinkOverridden) {
                        e.preventDefault()
                        setTimeout(() => resetCursorBlink(), 0)
                      }
                    }}
                  >
                    <Label
                      htmlFor="cursor-blink"
                      className="cursor-pointer"
                      title={
                        isCursorBlinkOverridden ? 'Reset to default' : undefined
                      }
                    >
                      Cursor Blink
                    </Label>
                    <RotateCcw
                      className={`h-3 w-3 text-muted-foreground transition-opacity ${
                        isCursorBlinkOverridden
                          ? 'opacity-50 group-hover:opacity-100 cursor-pointer'
                          : 'opacity-0'
                      }`}
                    />
                  </div>
                  <div className="col-span-3">
                    <Switch
                      id="cursor-blink"
                      checked={effectiveCursorBlink}
                      onCheckedChange={(checked) =>
                        setLocalCursorBlink(checked)
                      }
                    />
                  </div>
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
      {/* --- 重连遮罩层 --- */}
      {connectionStatus === 'disconnected' &&
        sessionType === 'remote' &&
        isVisible && ( // prettier-ignore
          <div className="absolute inset-0 bg-black bg-opacity-0 flex flex-col items-center justify-center text-white z-20">
            <div className="flex items-center mb-4">
              <AlertTriangle className="h-6 w-6 text-yellow-400 mr-2" />
              <h3 className="text-xl font-semibold">Connection Lost</h3>
            </div>
            <p className="text-muted-foreground mb-6">
              The connection to the remote host was lost.
            </p>
            <Button onClick={onReconnect}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Reconnect
            </Button>
          </div>
        )}
    </div>
  )
}
