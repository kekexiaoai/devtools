import { useEffect, useState } from 'react'
import type { Terminal } from '@xterm/xterm'
import type { AdvancedLogger } from '@/utils/logger'

interface ExtendedTerminal extends Terminal {
  on?(event: 'focus' | 'blur', handler: () => void): void
  off?(event: 'focus' | 'blur', handler: () => void): void
}

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected'

interface UseWebSocketTerminalProps {
  websocketUrl: string
  terminal: ExtendedTerminal | undefined
  logger: AdvancedLogger
}

export function useWebSocketTerminal({
  websocketUrl,
  terminal,
  logger,
}: UseWebSocketTerminalProps): { connectionStatus: ConnectionStatus } {
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>('connecting')

  useEffect(() => {
    if (!terminal) {
      return
    }

    logger.info('Ready to connect WebSocket')
    setConnectionStatus('connecting')
    const ws = new WebSocket(websocketUrl)

    ws.onopen = () => {
      logger.info('WebSocket connection successful')
      setConnectionStatus('connected')
      if (ws.readyState === WebSocket.OPEN) {
        const { cols, rows } = terminal
        const resizeMsg = JSON.stringify({ type: 'resize', cols, rows })
        ws.send(resizeMsg)
        logger.info(`Send initial size to backend: ${cols}x${rows}`)
      }
    }

    const onDataDisposable = terminal.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(data)
    })

    const onResizeDisposable = terminal.onResize(({ cols, rows }) => {
      if (ws.readyState === WebSocket.OPEN) {
        const resizeMsg = JSON.stringify({ type: 'resize', cols, rows })
        ws.send(resizeMsg)
        logger.info(`Sync size to backend: ${cols}x${rows}`)
      } else {
        logger.warn('WebSocket not connected, cannot sync size')
      }
    })

    ws.onmessage = (event) => {
      if (typeof event.data === 'string') terminal.write(event.data)
      else if (event.data instanceof Blob)
        void event.data.text().then((text) => terminal.write(text))
    }

    ws.onerror = (error) => {
      logger.error('WebSocket error:', error)
      setConnectionStatus('disconnected')
      terminal.write(
        '\r\n\x1b[31mConnection error, please check network\x1b[0m\r\n'
      )
    }

    ws.onclose = (event) => {
      logger.warn('WebSocket connection closed')
      setConnectionStatus('disconnected')
      if (event.code !== 1000) {
        terminal.write('\r\n\x1b[33mConnection closed unexpectedly.\x1b[0m\r\n')
      }
    }

    return () => {
      onDataDisposable.dispose()
      onResizeDisposable.dispose()
      ws.close(1000, 'Terminal component unmounted')
    }
  }, [websocketUrl, terminal, logger])

  return { connectionStatus }
}
