import { renderHook, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { useWebSocketTerminal } from './useWebSocketTerminal'
import type { Terminal } from '@xterm/xterm'
import type { AdvancedLogger } from '@/utils/logger'

// --- Mocks Setup ---

let mockWsInstance: MockWebSocket | null = null

class MockWebSocket {
  url: string
  onopen: () => void = () => {}
  onmessage: (event: { data: string }) => void = () => {}
  onerror: (error: Error) => void = () => {}
  onclose: (event: { code: number }) => void = () => {}

  // Add static properties to mimic the real WebSocket API
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  // Use static properties for initial state and state changes
  readyState: number = MockWebSocket.CONNECTING
  send = vi.fn()
  close = vi.fn(() => {
    this.readyState = MockWebSocket.CLOSED
  })

  constructor(url: string) {
    this.url = url
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    mockWsInstance = this
  }

  // Methods to simulate server behavior
  _open() {
    this.readyState = MockWebSocket.OPEN
    act(() => this.onopen())
  }
  _message(data: string) {
    act(() => this.onmessage({ data }))
  }
  _error(error: Error) {
    act(() => this.onerror(error))
  }
  _close(code = 1000) {
    act(() => this.onclose({ code }))
  }
}

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  withPrefix: vi.fn().mockReturnThis(),
}

const mockTerminal = {
  write: vi.fn(),
  onData: vi.fn(),
  onResize: vi.fn(),
  cols: 80,
  rows: 24,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _fireData: (data: string) => {},
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _fireResize: (size: { cols: number; rows: number }) => {},
  _onDataDispose: vi.fn(),
  _onResizeDispose: vi.fn(),
}

describe('useWebSocketTerminal', () => {
  beforeEach(() => {
    // Mock the global WebSocket before each test
    vi.stubGlobal('WebSocket', MockWebSocket)

    // Setup terminal event listeners
    mockTerminal.onData.mockImplementation(
      (callback: (data: string) => void) => {
        mockTerminal._fireData = callback
        return { dispose: mockTerminal._onDataDispose }
      }
    )
    mockTerminal.onResize.mockImplementation(
      (callback: (size: { cols: number; rows: number }) => void) => {
        mockTerminal._fireResize = callback
        return { dispose: mockTerminal._onResizeDispose }
      }
    )
  })

  afterEach(() => {
    // Clean up mocks after each test
    vi.clearAllMocks()
    mockWsInstance = null
  })

  it('should initialize with "connecting" status', () => {
    const { result } = renderHook(() =>
      useWebSocketTerminal({
        websocketUrl: 'ws://test.com',
        terminal: mockTerminal as unknown as Terminal,
        logger: mockLogger as AdvancedLogger,
      })
    )
    expect(result.current.connectionStatus).toBe('connecting')
  })

  it('should transition to "connected" on WebSocket open and send initial size', () => {
    const { result } = renderHook(() =>
      useWebSocketTerminal({
        websocketUrl: 'ws://test.com',
        terminal: mockTerminal as unknown as Terminal,
        logger: mockLogger as AdvancedLogger,
      })
    )

    // 确保WebSocket实例已正确创建
    expect(mockWsInstance).not.toBeNull()

    // 模拟WebSocket连接成功
    mockWsInstance?._open()

    // 验证连接状态变化
    expect(result.current.connectionStatus).toBe('connected')

    // 验证初始尺寸消息发送
    expect(mockWsInstance?.send).toHaveBeenCalledTimes(1)
    expect(mockWsInstance?.send).toHaveBeenCalledWith(
      JSON.stringify({
        type: 'resize',
        cols: mockTerminal.cols,
        rows: mockTerminal.rows,
      })
    )
  })

  it('should send data from terminal to WebSocket', () => {
    renderHook(() =>
      useWebSocketTerminal({
        websocketUrl: 'ws://test.com',
        terminal: mockTerminal as unknown as Terminal,
        logger: mockLogger as AdvancedLogger,
      })
    )

    // 确保WebSocket已连接
    mockWsInstance?._open()
    expect(mockWsInstance?.readyState).toBe(1) // WebSocket.OPEN

    // 模拟终端输入
    const testData = 'ls -l\n'
    act(() => mockTerminal._fireData(testData))

    // 验证数据发送
    expect(mockWsInstance?.send).toHaveBeenCalledWith(testData)
  })

  it('should write data from WebSocket to terminal', () => {
    renderHook(() =>
      useWebSocketTerminal({
        websocketUrl: 'ws://test.com',
        terminal: mockTerminal as unknown as Terminal,
        logger: mockLogger as AdvancedLogger,
      })
    )
    mockWsInstance?._open()

    mockWsInstance?._message('file1.txt\nfile2.txt\n')

    expect(mockTerminal.write).toHaveBeenCalledWith('file1.txt\nfile2.txt\n')
  })

  it('should handle WebSocket errors and transition to "disconnected"', () => {
    const { result } = renderHook(() =>
      useWebSocketTerminal({
        websocketUrl: 'ws://test.com',
        terminal: mockTerminal as unknown as Terminal,
        logger: mockLogger as AdvancedLogger,
      })
    )
    mockWsInstance?._open()

    mockWsInstance?._error(new Error('Connection failed'))

    expect(result.current.connectionStatus).toBe('disconnected')
    expect(mockTerminal.write).toHaveBeenCalledWith(
      '\r\n\x1b[31mConnection error, please check network\x1b[0m\r\n'
    )
  })

  it('should handle WebSocket close and transition to "disconnected"', () => {
    const { result } = renderHook(() =>
      useWebSocketTerminal({
        websocketUrl: 'ws://test.com',
        terminal: mockTerminal as unknown as Terminal,
        logger: mockLogger as AdvancedLogger,
      })
    )
    mockWsInstance?._open()

    mockWsInstance?._close(1006) // Abnormal closure

    expect(result.current.connectionStatus).toBe('disconnected')
    expect(mockTerminal.write).toHaveBeenCalledWith(
      '\r\n\x1b[33mConnection closed unexpectedly.\x1b[0m\r\n'
    )
  })

  it('should clean up on unmount', () => {
    const { unmount } = renderHook(() =>
      useWebSocketTerminal({
        websocketUrl: 'ws://test.com',
        terminal: mockTerminal as unknown as Terminal,
        logger: mockLogger as AdvancedLogger,
      })
    )

    unmount()

    expect(mockWsInstance?.close).toHaveBeenCalledWith(
      1000,
      'Terminal component unmounted'
    )
    expect(mockTerminal._onDataDispose).toHaveBeenCalled()
    expect(mockTerminal._onResizeDispose).toHaveBeenCalled()
  })
})
