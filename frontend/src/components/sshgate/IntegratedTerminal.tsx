import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useXTerm } from 'react-xtermjs'
import { FitAddon } from '@xterm/addon-fit'
import { useDependencyTracer } from '@/hooks/useDependencyTracer'

interface IntegratedTerminalProps {
  websocketUrl: string
  id: string
  displayName: string
  isVisible: boolean // Triggers resize when the component becomes visible
}

import { createAdvancedLogger } from '@/utils/logger'
import { Terminal } from '@xterm/xterm'
const advancedLogger = createAdvancedLogger('Terminal', {
  level: 'debug',
})

// 扩展Terminal类型以解决类型定义问题（如果类型文件缺失）
interface ExtendedTerminal extends Terminal {
  on?(event: 'focus' | 'blur', handler: () => void): void
  off?(event: 'focus' | 'blur', handler: () => void): void
}

export function IntegratedTerminal({
  websocketUrl,
  id,
  displayName,
  isVisible,
}: IntegratedTerminalProps) {
  // 用 useMemo 缓存终端配置，确保引用稳定
  const terminalOptions = useMemo(
    () => ({
      cursorBlink: true,
      fontSize: 12,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#000000',
        foreground: '#ffffff',
      },
      scrollback: 1000,
    }),
    []
  ) // 空依赖数组：配置不变时，引用永远不变

  // 调用 Hook，获取 terminal 实例和 ref
  const { instance: terminal, ref } = useXTerm({
    // 在 Hook 层面进行基础配置
    options: terminalOptions, // 传入稳定引用的配置
  })
  // const { instance: terminal, ref } = useXTerm()

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
    const getPrefix = () => `[${id}]<${displayNameRef.current}>`
    return advancedLogger.withPrefix(getPrefix())
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
  const sizeAdjustedRef = useRef(false) // 跟踪尺寸是否已正确调整
  const resizeObserverRef = useRef<ResizeObserver | null>(null) // 尺寸监控实例
  const terminalContainerRef = ref

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
      sizeAdjustedRef.current = true
    } catch (error) {
      logger.error('Failed to adjust terminal size', error)
      sizeAdjustedRef.current = false
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
    } else {
      // When hidden, reset the size-adjusted flag.
      sizeAdjustedRef.current = false
    }
  }, [isVisible, adjustTerminalSize, terminal])

  // WebSocket连接与终端事件处理
  useEffect(() => {
    if (!extendedTerminal || !terminalContainerRef.current) {
      return
    }

    extendedTerminal.loadAddon(fitAddon)
    logger.info('Terminal initialized, ready to connect WebSocket')

    const ws = new WebSocket(websocketUrl)

    ws.onopen = () => {
      logger.info('WebSocket connection successful')
      // 连接成功后，立即将前端终端的当前尺寸发送给后端 PTY，
      // 这是解决尺寸不匹配问题的关键。
      if (ws.readyState === WebSocket.OPEN) {
        const { cols, rows } = extendedTerminal
        const resizeMsg = JSON.stringify({ type: 'resize', cols, rows })
        ws.send(resizeMsg)
        logger.info(`Send initial size to backend: ${cols}x${rows}`)
      }
    }

    // 终端输入转发到WebSocket
    const onDataDisposable = extendedTerminal.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data)
      }
    })

    // 监听前端终端的尺寸变化，并同步到后端 PTY
    const onResizeDisposable = extendedTerminal.onResize(({ cols, rows }) => {
      if (ws.readyState === WebSocket.OPEN) {
        const resizeMsg = JSON.stringify({ type: 'resize', cols, rows })
        ws.send(resizeMsg)
        logger.info(`Sync size to backend: ${cols}x${rows}`)
      } else {
        logger.warn('WebSocket not connected, cannot sync size')
      }
    })

    // 接收WebSocket消息并写入终端
    ws.onmessage = (event) => {
      if (typeof event.data === 'string') {
        extendedTerminal.write(event.data)
      } else if (event.data instanceof Blob) {
        void event.data.text().then((text) => extendedTerminal.write(text))
      }
    }

    // 错误处理
    ws.onerror = (error) => {
      logger.error('WebSocket error:', error)
      extendedTerminal.write(
        '\r\n\x1b[31mConnection error, please check network\x1b[0m\r\n'
      )
    }

    // 关闭处理
    ws.onclose = () => {
      logger.warn('WebSocket connection closed')
      extendedTerminal.write('\r\n\x1b[33mConnection closed\x1b[0m\r\n')
    }

    // 清理函数
    return () => {
      onDataDisposable.dispose()
      onResizeDisposable.dispose()
      ws.close(1000, 'Terminal component unmounted')
    }
  }, [websocketUrl, extendedTerminal, fitAddon, logger, terminalContainerRef])

  // 鼠标点击处理
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Stop propagation to prevent parent elements from handling the click.
      // The browser will naturally focus the div, which then triggers `handleContainerFocus`.
      e.stopPropagation()
    },
    [] // 无依赖
  )

  // When the container div gets focus (from a click or tab), pass it to the xterm instance.
  const handleContainerFocus = useCallback(() => {
    if (extendedTerminal && isVisible) {
      logger.debug('Container focused, passing focus to xterm.')
      extendedTerminal.focus()
    }
  }, [extendedTerminal, isVisible, logger])

  return (
    <div
      className="h-full w-full bg-gray-900 rounded-md overflow-hidden"
      ref={terminalContainerRef}
      onMouseDown={handleMouseDown}
      onFocus={handleContainerFocus}
      tabIndex={isVisible ? 0 : -1}
      style={{ outline: 'none' }}
    />
  )
}
