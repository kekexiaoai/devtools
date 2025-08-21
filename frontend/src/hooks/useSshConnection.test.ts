import { renderHook, act, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { toast } from 'sonner'
import {
  ConnectInTerminal,
  ConnectInTerminalAndTrustHost,
  ConnectInTerminalWithPassword,
} from '@wailsjs/go/sshgate/Service'
import {
  StartLocalSession,
  StartRemoteSession,
} from '@wailsjs/go/terminal/Service'
import { useSshConnection } from './useSshConnection'
import { types } from '@wailsjs/go/models'

// --- Mocks ---

vi.mock('@wailsjs/go/sshgate/Service', () => ({
  ConnectInTerminal: vi.fn(),
  ConnectInTerminalWithPassword: vi.fn(),
  ConnectInTerminalAndTrustHost: vi.fn(),
}))

vi.mock('@wailsjs/go/terminal/Service', () => ({
  StartLocalSession: vi.fn(),
  StartRemoteSession: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    promise: vi.fn(),
  },
}))

const mockConnectInTerminal = vi.mocked(ConnectInTerminal)
const mockConnectInTerminalWithPassword = vi.mocked(
  ConnectInTerminalWithPassword
)
const mockConnectInTerminalAndTrustHost = vi.mocked(
  ConnectInTerminalAndTrustHost
)
const mockStartRemoteSession = vi.mocked(StartRemoteSession)
const mockStartLocalSession = vi.mocked(StartLocalSession)

const mockShowDialog = vi.fn()
const mockOnOpenTerminal = vi.fn()

describe('useSshConnection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should handle a successful connection immediately', async () => {
    mockConnectInTerminal.mockResolvedValue(
      new types.ConnectionResult({ success: true })
    )

    const { result } = renderHook(() =>
      useSshConnection({
        showDialog: mockShowDialog,
        onOpenTerminal: mockOnOpenTerminal,
      })
    )

    let promise: Promise<string | null>
    act(() => {
      promise = result.current.connect({ alias: 'my-alias' })
    })

    await expect(promise!).resolves.toBe('Terminal for my-alias launched.')
    expect(mockConnectInTerminal).toHaveBeenCalledWith('my-alias', false)
    expect(toast.promise).toHaveBeenCalled()
  })

  it('should handle the password prompt flow correctly', async () => {
    // 1. Initial call fails, needs password
    mockConnectInTerminal.mockResolvedValue(
      new types.ConnectionResult({
        passwordRequired: { alias: 'my-alias', message: 'pwd needed' },
        success: false,
      })
    )
    // 2. User provides password
    mockShowDialog.mockResolvedValue({
      buttonValue: 'connect',
      inputValue: 'secret',
      checkedValues: ['save'],
    })
    // 3. Second call with password succeeds
    mockConnectInTerminalWithPassword.mockResolvedValue(
      new types.ConnectionResult({
        success: true,
      })
    )

    const { result } = renderHook(() =>
      useSshConnection({
        showDialog: mockShowDialog,
        onOpenTerminal: mockOnOpenTerminal,
      })
    )

    let promise: Promise<string | null>
    act(() => {
      promise = result.current.connect({ alias: 'my-alias' })
    })

    // Wait for dialog to be called
    await waitFor(() => {
      expect(mockShowDialog).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Password Required for my-alias' })
      )
    })

    // Wait for the second connection attempt with password
    await waitFor(() => {
      expect(mockConnectInTerminalWithPassword).toHaveBeenCalledWith(
        'my-alias',
        'secret',
        true, // savePassword
        false // dryRun
      )
    })

    await expect(promise!).resolves.toBe('Terminal for my-alias launched.')
  })

  it('should handle user cancelling the password prompt', async () => {
    mockConnectInTerminal.mockResolvedValue(
      new types.ConnectionResult({
        passwordRequired: { alias: 'my-alias', message: 'pwd needed' },
        success: false,
      })
    )
    mockShowDialog.mockResolvedValue({ buttonValue: 'cancel' }) // User cancels

    const { result } = renderHook(() =>
      useSshConnection({
        showDialog: mockShowDialog,
        onOpenTerminal: mockOnOpenTerminal,
      })
    )

    let promise: Promise<string | null>
    act(() => {
      promise = result.current.connect({ alias: 'my-alias' })
    })

    await expect(promise!).resolves.toBeNull()
    expect(mockConnectInTerminalWithPassword).not.toHaveBeenCalled()
  })

  it('should handle the host key verification flow', async () => {
    mockConnectInTerminal.mockResolvedValue(
      new types.ConnectionResult({
        hostKeyVerificationRequired: {
          alias: 'my-alias',
          fingerprint: 'SHA256:abc',
          hostAddress: '1.2.3.4',
        },
        success: false,
      })
    )
    mockShowDialog.mockResolvedValue({ buttonValue: 'yes' }) // User trusts host
    mockConnectInTerminalAndTrustHost.mockResolvedValue(
      new types.ConnectionResult({ success: true })
    )

    const { result } = renderHook(() =>
      useSshConnection({
        showDialog: mockShowDialog,
        onOpenTerminal: mockOnOpenTerminal,
      })
    )

    let promise: Promise<string | null>
    act(() => {
      promise = result.current.connect({ alias: 'my-alias' })
    })

    await waitFor(() => {
      expect(mockShowDialog).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Host Key Verification for my-alias' })
      )
    })

    await waitFor(() => {
      expect(mockConnectInTerminalAndTrustHost).toHaveBeenCalled()
    })

    await expect(promise!).resolves.toBe('Terminal for my-alias launched.')
  })

  it('should handle a connection failure with an error message', async () => {
    const error = new Error('Network unreachable')
    mockConnectInTerminal.mockRejectedValue(error)

    const { result } = renderHook(() =>
      useSshConnection({
        showDialog: mockShowDialog,
        onOpenTerminal: mockOnOpenTerminal,
      })
    )

    let promise: Promise<string | null>
    act(() => {
      promise = result.current.connect({ alias: 'my-alias' })
    })

    await expect(promise!).rejects.toThrow('Network unreachable')

    await waitFor(() => {
      expect(mockShowDialog).toHaveBeenCalledWith({
        type: 'error',
        title: 'Connection Failed',
        message: 'Network unreachable',
      })
    })
  })

  it('should handle internal strategy for remote terminal and call onOpenTerminal', async () => {
    mockConnectInTerminal.mockResolvedValue(
      new types.ConnectionResult({ success: true })
    )
    const mockSessionInfo = {
      id: 'session-123',
      alias: 'my-alias',
      url: 'ws://localhost:1234',
      type: 'remote',
    }
    mockStartRemoteSession.mockResolvedValue(mockSessionInfo)

    const { result } = renderHook(() =>
      useSshConnection({
        showDialog: mockShowDialog,
        onOpenTerminal: mockOnOpenTerminal,
      })
    )

    let promise: Promise<string | null>
    act(() => {
      promise = result.current.connect({
        alias: 'my-alias',
        type: 'remote',
        strategy: 'internal',
        sessionID: 'session-123',
      })
    })

    await expect(promise!).resolves.toBe('Terminal for my-alias is ready.')
    expect(mockOnOpenTerminal).toHaveBeenCalledWith(mockSessionInfo)
  })

  it('should handle internal strategy for local terminal', async () => {
    // For local terminals, no backend connection call is made in the hook's logic.
    // The hook directly calls StartLocalSession.
    const mockSessionInfo = {
      id: 'local-session-123',
      alias: 'local',
      url: 'ws://localhost:1234/ws/terminal/local-session-123',
      type: 'local',
    }
    mockStartLocalSession.mockResolvedValue(mockSessionInfo)

    const { result } = renderHook(() =>
      useSshConnection({
        showDialog: mockShowDialog,
        onOpenTerminal: mockOnOpenTerminal,
      })
    )

    let promise: Promise<string | null>
    act(() => {
      promise = result.current.connect({
        alias: 'local',
        type: 'local',
        strategy: 'internal',
        sessionID: 'local-session-123',
      })
    })

    await expect(promise!).resolves.toBe('Terminal for local is ready.')
    expect(mockStartLocalSession).toHaveBeenCalledWith('local-session-123')
    expect(mockOnOpenTerminal).toHaveBeenCalledWith(mockSessionInfo)
    expect(mockConnectInTerminal).not.toHaveBeenCalled()
  })

  it('should handle "verify" strategy and not show toast', async () => {
    mockConnectInTerminal.mockResolvedValue(
      new types.ConnectionResult({ success: true })
    )

    const { result } = renderHook(() =>
      useSshConnection({
        showDialog: mockShowDialog,
        onOpenTerminal: mockOnOpenTerminal,
      })
    )

    let promise: Promise<string | null>
    act(() => {
      promise = result.current.connect({
        alias: 'my-alias',
        type: 'remote',
        sessionID: undefined,
        strategy: 'verify',
      })
    })

    await expect(promise!).resolves.toBe('')
    expect(mockConnectInTerminal).toHaveBeenCalledWith('my-alias', true) // dryRun = true
    expect(toast.promise).not.toHaveBeenCalled()
  })
})
