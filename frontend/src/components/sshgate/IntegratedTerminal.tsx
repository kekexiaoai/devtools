import React, { useCallback, useEffect, useMemo } from 'react'
import { useXTerm } from 'react-xtermjs'
import { FitAddon } from '@xterm/addon-fit'

interface IntegratedTerminalProps {
  websocketUrl: string
  id: string
  displayName: string
  isVisible: boolean // 用户组件可见时触发尺寸重新计算
}

import { createAdvancedLogger } from '@/utils/logger'
const advancedLogger = createAdvancedLogger('Terminal')

export function IntegratedTerminal({
  websocketUrl,
  id,
  displayName,
  isVisible,
}: IntegratedTerminalProps) {
  // 调用 Hook，获取 terminal 实例和 ref
  // const { instance: terminal, ref } = useXTerm({
  //   // 教学：在 Hook 层面进行基础配置
  //   options: {
  //     cursorBlink: true,
  //     fontSize: 14,
  //     fontFamily: 'Menlo, Monaco, "Courier New", monospace',
  //     theme: {
  //       background: '#000000',
  //       foreground: '#ffffff',
  //     },
  //     scrollback: 1000,
  //   },
  // })
  const { instance: terminal, ref } = useXTerm()

  // 将 FitAddon 实例化一次
  //    useMemo 确保它只在组件首次渲染时被创建
  const fitAddon = useMemo(() => new FitAddon(), [])

  // 创建带上下文的日志实例（包含当前终端ID，便于区分多个终端）
  const logger = useMemo(
    () => advancedLogger.withPrefix(`${id}<${displayName}>`),
    [id, displayName]
  )
  // 用useCallback捕获最新的props值
  const getDebugInfo = useCallback(
    () => ({
      id,
      displayName,
    }),
    [id, displayName]
  )

  // debug
  useEffect(() => {
    logger.info(
      `[useEffect]isVisible, id: ${id}, displayName: ${displayName}, visible: ${isVisible}`
    )
  }, [isVisible, id, displayName, logger])

  useEffect(() => {
    // 因为 useXTerm hook 保证了 terminal 实例的稳定，
    // 所以我们可以在 effect 内部安全地使用它
    if (!terminal || !ref.current) {
      return
    }

    // --- 加载插件 ---
    // 在 terminal 实例准备好后，加载插件
    terminal.loadAddon(fitAddon)

    const debug = getDebugInfo()
    logger.info(`Initializing connection, displayName: ${debug.displayName}`)

    // --- WebSocket 连接和数据流绑定 ---
    const ws = new WebSocket(websocketUrl)
    ws.onopen = () => {
      const fitTerminal = async () => {
        await document.fonts.ready
          .then(() => {
            fitAddon.fit()
            terminal.focus()
          })
          .catch((e) => {
            logger.warn('Fonts ready failed:', e)
          })
      }
      void fitTerminal()
      logger.info('WebSocket connected')
    }

    const onDataDisposable = terminal.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data)
      }
    })

    ws.onmessage = (event) => {
      if (typeof event.data === 'string') {
        terminal.write(event.data)
      } else if (event.data instanceof Blob) {
        void event.data.text().then((text) => terminal.write(text))
      }
    }

    ws.onerror = (error) => {
      logger.error('Terminal WebSocket error:', error)
      terminal.write('\r\n\x1b[31mConnection Error.\x1b[0m')
    }

    ws.onclose = () => {
      logger.warn('Terminal WebSocket disconnected.')
      terminal.write('\r\n\x1b[33mConnection Closed.\x1b[0m')
    }

    // const handleResize = () => {
    //   fitAddon.fit()
    // }
    // window.addEventListener('resize', handleResize)

    // --- 清理函数 ---
    // 在组件卸载时，停止监视，防止内存泄漏
    return () => {
      onDataDisposable.dispose()
      ws.close()
      // window.removeEventListener('resize', handleResize)
    }
  }, [websocketUrl, terminal, fitAddon, ref, logger, getDebugInfo])

  // 独立的effect：专门处理尺寸监听
  useEffect(() => {
    // 依赖isVisible，确保响应可见性变化
    if (!terminal || !ref.current || !isVisible) return

    const terminalContainer = ref.current
    const debug = getDebugInfo()

    // 创建ResizeObserver
    const resizeObserver = new ResizeObserver(() => {
      // 这里的isVisible始终是最新值（因effect依赖isVisible）
      if (isVisible && terminal) {
        try {
          fitAddon.fit()
          const dims = fitAddon.proposeDimensions()
          logger.info(
            `[ResizeObserver]FitAddon resize, rows: ${dims?.rows}, cols: ${dims?.cols}, displayName: ${debug.displayName}`
          )
        } catch (e) {
          logger.warn('[ResizeObserver]FitAddon resize failed:', e)
        }
      }
    })

    // 开始监听
    resizeObserver.observe(terminalContainer)
    logger.info(
      `[ResizeObserver]start observe, displayName: ${debug.displayName}`
    )

    // 清理函数：停止监听
    return () => {
      resizeObserver.unobserve(terminalContainer)
      logger.info(
        `[ResizeObserver]stop observe, displayName: ${debug.displayName}`
      )
    }
  }, [terminal, ref, isVisible, fitAddon, getDebugInfo, logger])

  useEffect(() => {
    // 当组件从隐藏变为可见时，我们强制进行一次尺寸重计算
    if (isVisible && terminal) {
      const timer = setTimeout(() => {
        const fit = async () => {
          try {
            // 等待字体加载完成
            await document.fonts.ready
            fitAddon.fit()
            terminal.focus()
            const dims = fitAddon.proposeDimensions()
            logger.info(
              `[useEffect]FitAddon resize, rows: ${dims?.rows}, cols: ${dims?.cols}, displayName: ${getDebugInfo().displayName}`
            )
          } catch (e) {
            logger.warn('FitAddon resize failed:', e)
          }
        }
        void fit()
      }, 100)

      return () => clearTimeout(timer)
    }
  }, [isVisible, terminal, fitAddon, getDebugInfo, logger])

  return (
    // 我们将 ref 附加到这个 div 上，它将作为 xterm 的挂载点和被 ResizeObserver 监视的目标
    <div
      className="h-full w-full bg-gray-500 rounded-md"
      ref={ref}
      onMouseDown={() => terminal?.focus()} // 关键：鼠标按下时就立刻抢回焦点
    />
  )
}
