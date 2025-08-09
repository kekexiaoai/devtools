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

  // 创建带上下文的日志实例（包含当前终端ID，便于区分多个终端）
  const logger = useMemo(
    () => advancedLogger.withPrefix(`${id}<${displayName}>`),
    [id, displayName]
  )

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

  // 状态跟踪引用
  const hasFocusRef = useRef(false) // 跟踪终端焦点状态
  const sizeAdjustedRef = useRef(false) // 跟踪尺寸是否已正确调整
  const resizeObserverRef = useRef<ResizeObserver | null>(null) // 尺寸监控实例
  const terminalContainerRef = ref

  // 核心尺寸调整函数
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

      // 激活状态下自动聚焦
      if (isVisible && !hasFocusRef.current) {
        terminal.focus() // focus()会触发onFocus事件，其中会设置 hasFocusRef.current
      }
    } catch (error) {
      logger.error('Failed to adjust terminal size', error)
      sizeAdjustedRef.current = false
    }
  }, [terminal, terminalContainerRef, isVisible, fitAddon, logger])

  // 恢复ResizeObserver监控容器尺寸变化
  useEffect(() => {
    if (!terminalContainerRef.current || !terminal) return

    // 创建ResizeObserver实例
    resizeObserverRef.current = new ResizeObserver((entries) => {
      if (isVisible && entries.length > 0) {
        void adjustTerminalSize()
      }
    })

    // 保存当前ref值到局部变量
    const container = terminalContainerRef.current
    // 使用局部变量进行监控
    if (container) {
      resizeObserverRef.current.observe(container)
    }
    logger.info('ResizeObserver started monitoring container size')

    // 清理逻辑
    return () => {
      if (resizeObserverRef.current && container) {
        // 使用保存的局部变量进行清理
        resizeObserverRef.current.unobserve(container)
      }
      resizeObserverRef.current = null
      logger.info('ResizeObserver stopped monitoring')
    }
  }, [terminal, adjustTerminalSize, isVisible, logger, terminalContainerRef])

  // 可见性变化时的尺寸调整
  useEffect(() => {
    if (isVisible) {
      // 双重调整解决Tab切换时的尺寸偏差
      const timer1 = setTimeout(() => {
        void adjustTerminalSize().then(() => {
          // 第一次调整后延迟100ms再次调整，确保动画/过渡完成
          const timer2 = setTimeout(() => {
            void adjustTerminalSize()
          }, 100)
          return () => clearTimeout(timer2)
        })
      }, 0)

      return () => clearTimeout(timer1)
    } else {
      // 隐藏时重置状态
      sizeAdjustedRef.current = false
      hasFocusRef.current = false // 确保在隐藏时重置焦点状态
    }
  }, [isVisible, adjustTerminalSize])

  // 窗口全局尺寸变化时调整
  useEffect(() => {
    const handleWindowResize = () => {
      if (isVisible && sizeAdjustedRef.current) {
        void adjustTerminalSize()
      }
    }

    window.addEventListener('resize', handleWindowResize)
    return () => window.removeEventListener('resize', handleWindowResize)
  }, [isVisible, adjustTerminalSize])

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

    // 焦点事件处理（兼容不同版本的xterm API）
    const handleFocus = () => {
      hasFocusRef.current = true
      logger.debug('Terminal gained focus')
    }
    const handleBlur = () => {
      hasFocusRef.current = false
      logger.debug('Terminal lost focus')
    }

    // 兼容处理：根据终端实例是否有on方法选择注册方式
    if (extendedTerminal.on) {
      extendedTerminal.on('focus', handleFocus)
      extendedTerminal.on('blur', handleBlur)
    }

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
      // 移除事件监听（兼容处理）
      if (extendedTerminal.off) {
        extendedTerminal.off('focus', handleFocus)
        extendedTerminal.off('blur', handleBlur)
      }
      ws.close(1000, 'Terminal component unmounted')
    }
  }, [websocketUrl, extendedTerminal, fitAddon, logger, terminalContainerRef])

  // 鼠标点击处理
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // 仅阻止事件冒泡，让浏览器自然地处理聚焦行为，
      // 这将触发下面的 onFocus 事件处理器。
      e.stopPropagation()
    },
    [] // 无依赖
  )

  // 容器焦点处理
  const handleContainerFocus = useCallback(() => {
    // 无论何时容器获得焦点（通过点击或Tab键），
    // 都无条件地尝试将焦点传递给xterm实例。
    // xterm内部会处理是否真的需要改变焦点，而我们的逻辑保持了清晰和一致。
    if (extendedTerminal && isVisible) {
      extendedTerminal.focus()
    }
  }, [extendedTerminal, isVisible])

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
