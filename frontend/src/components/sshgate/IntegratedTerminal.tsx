import React, { useEffect, useMemo } from 'react'
import { useXTerm } from 'react-xtermjs'
import { FitAddon } from '@xterm/addon-fit'
import 'xterm/css/xterm.css'

interface IntegratedTerminalProps {
  websocketUrl: string
}

export function IntegratedTerminal({ websocketUrl }: IntegratedTerminalProps) {
  // 调用 Hook，获取 terminal 实例和 ref
  const { instance: terminal, ref } = useXTerm()

  // 将 FitAddon 实例化一次
  //    useMemo 确保它只在组件首次渲染时被创建
  const fitAddon = useMemo(() => new FitAddon(), [])

  useEffect(() => {
    // 因为 useXTerm hook 保证了 terminal 实例的稳定，
    // 所以我们可以在 effect 内部安全地使用它
    if (!terminal) {
      return
    }

    // --- 加载插件 ---
    // 在 terminal 实例准备好后，加载插件
    terminal.loadAddon(fitAddon)

    // --- WebSocket 连接和数据流绑定 ---
    const ws = new WebSocket(websocketUrl)

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

    ws.onopen = () => {
      console.log('Terminal WebSocket connected.')
      fitAddon.fit()
    }

    ws.onerror = (error) => {
      console.error('Terminal WebSocket error:', error)
      terminal.write('\r\n\x1b[31mConnection Error.\x1b[0m')
    }

    ws.onclose = () => {
      console.log('Terminal WebSocket disconnected.')
      terminal.write('\r\n\x1b[33mConnection Closed.\x1b[0m')
    }

    const handleResize = () => {
      fitAddon.fit()
    }
    window.addEventListener('resize', handleResize)

    // --- 清理函数 ---
    return () => {
      onDataDisposable.dispose()
      ws.close()
      window.removeEventListener('resize', handleResize)
    }
  }, [websocketUrl, terminal, fitAddon]) // 依赖项现在包含了 terminal 和 fitAddon

  return (
    // 模板现在极其简洁
    // 我们只需要将 Hook 返回的 ref 附加到一个 div 上即可
    <div className="h-full w-full bg-black p-2" ref={ref} />
  )
}
