import { renderHook, act, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { toast } from 'sonner'
import {
  ConnectInTerminal,
  ConnectInTerminalAndTrustHost,
  ConnectInTerminalWithPassword,
  SavePassword,
  VerifyTunnelConfigConnection,
  TrustHostKeyForTunnel,
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
  SavePassword: vi.fn(),
  VerifyTunnelConfigConnection: vi.fn(),
  TrustHostKeyForTunnel: vi.fn(),
}))

vi.mock('@wailsjs/go/terminal/Service', () => ({
  StartLocalSession: vi.fn(),
  StartRemoteSession: vi.fn(),
}))

// Auto-mock the 'sonner' module. Vitest replaces all exports with mock functions.
vi.mock('sonner')

// Get a typed reference to the mocked toast object/function
const mockedToast = vi.mocked(toast, true)

const mockConnectInTerminal = vi.mocked(ConnectInTerminal)
const mockConnectInTerminalWithPassword = vi.mocked(
  ConnectInTerminalWithPassword
)
const mockConnectInTerminalAndTrustHost = vi.mocked(
  ConnectInTerminalAndTrustHost
)
const mockVerifyTunnelConfigConnection = vi.mocked(VerifyTunnelConfigConnection)
const mockStartRemoteSession = vi.mocked(StartRemoteSession)
const mockStartLocalSession = vi.mocked(StartLocalSession)
const mockTrustHostKeyForTunnel = vi.mocked(TrustHostKeyForTunnel)
const mockSavePassword = vi.mocked(SavePassword)

const mockShowDialog = vi.fn()
const mockOnOpenTerminal = vi.fn()

describe('useSshConnection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedToast.loading.mockReturnValue('toast-123') // Simulate returning a toast ID
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
    expect(mockConnectInTerminal).toHaveBeenCalledWith('my-alias', false) // dryRun = false

    // Check toast flow
    await waitFor(() => {
      expect(mockedToast.loading).toHaveBeenCalledWith(
        'Connecting to my-alias...'
      )
      expect(mockedToast.success).toHaveBeenCalledWith(
        'Terminal for my-alias launched.'
      )
      expect(mockedToast.dismiss).toHaveBeenCalledWith('toast-123')
    })
  })

  it('should handle the password prompt flow correctly', async () => {
    // 1. Initial call fails, needs password
    mockConnectInTerminal.mockResolvedValue(
      new types.ConnectionResult({
        passwordRequired: new types.PasswordRequiredError({
          alias: 'my-alias',
          message: 'pwd needed',
        }),
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
        false, // savePassword is now handled inside the hook, this should be false
        false // dryRun
      )
      expect(mockSavePassword).toHaveBeenCalledWith('my-alias', 'secret')
    })

    // Check toast flow
    await waitFor(() => {
      expect(mockedToast.loading).toHaveBeenCalledWith(
        'Connecting to my-alias...'
      )
      expect(mockedToast.dismiss).toHaveBeenCalledWith('toast-123')
    })

    await expect(promise!).resolves.toBe('Terminal for my-alias launched.')
    expect(mockedToast.success).toHaveBeenCalledWith(
      'Terminal for my-alias launched.'
    )
  })

  it('should handle user cancelling the password prompt', async () => {
    mockConnectInTerminal.mockResolvedValue(
      new types.ConnectionResult({
        passwordRequired: new types.PasswordRequiredError({
          alias: 'my-alias',
          message: 'pwd needed',
        }),
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

    // Check toast flow
    await waitFor(() => {
      expect(mockedToast.loading).toHaveBeenCalledWith(
        'Connecting to my-alias...'
      )
      expect(mockedToast.dismiss).toHaveBeenCalledWith('toast-123')
      expect(mockedToast.info).toHaveBeenCalledWith(
        'Connection to my-alias cancelled.',
        { duration: 1000 }
      )
    })

    expect(mockConnectInTerminalWithPassword).not.toHaveBeenCalled()
  })

  it('should handle the host key verification flow', async () => {
    mockConnectInTerminal.mockResolvedValue(
      new types.ConnectionResult({
        hostKeyVerificationRequired: new types.HostKeyVerificationRequiredError(
          {
            alias: 'my-alias',
            fingerprint: 'SHA256:abc',
            hostAddress: '1.2.3.4',
          }
        ),
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

    // Check toast flow
    await waitFor(() => {
      expect(mockedToast.loading).toHaveBeenCalledWith(
        'Connecting to my-alias...'
      )
      expect(mockedToast.dismiss).toHaveBeenCalledWith('toast-123')
    })

    await expect(promise!).resolves.toBe('Terminal for my-alias launched.')
    expect(mockedToast.success).toHaveBeenCalledWith(
      'Terminal for my-alias launched.'
    )
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
      // Check toast flow
      expect(mockedToast.loading).toHaveBeenCalledWith(
        'Connecting to my-alias...'
      )
      expect(mockedToast.dismiss).toHaveBeenCalledWith('toast-123')
      expect(mockedToast.error).toHaveBeenCalledWith(
        'Connection failed: Network unreachable'
      )
    })
  })

  it('should handle internal strategy for remote terminal and call onOpenTerminal', async () => {
    mockConnectInTerminal.mockResolvedValue(
      new types.ConnectionResult({ success: true })
    )
    const mockSessionInfo = new types.TerminalSessionInfo({
      id: 'session-123',
      alias: 'my-alias',
      url: 'ws://localhost:1234',
      type: 'remote',
    })
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

    await waitFor(() => {
      expect(mockedToast.loading).toHaveBeenCalledWith(
        'Connecting to my-alias...'
      )
      expect(mockedToast.dismiss).toHaveBeenCalledWith('toast-123')
      expect(mockedToast.success).toHaveBeenCalledWith(
        'Terminal for my-alias is ready.'
      )
    })
    expect(mockOnOpenTerminal).toHaveBeenCalledWith(mockSessionInfo)
  })

  it('should handle internal strategy for local terminal', async () => {
    // For local terminals, no backend connection call is made in the hook's logic.
    // The hook directly calls StartLocalSession.
    const mockSessionInfo = new types.TerminalSessionInfo({
      id: 'local-session-123',
      alias: 'local',
      url: 'ws://localhost:1234/ws/terminal/local-session-123',
      type: 'local',
    })
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

    await waitFor(() => {
      expect(mockedToast.loading).toHaveBeenCalledWith('Connecting to local...')
      expect(mockedToast.dismiss).toHaveBeenCalledWith('toast-123')
      expect(mockedToast.success).toHaveBeenCalledWith(
        'Terminal for local is ready.'
      )
    })
    expect(mockStartLocalSession).toHaveBeenCalledWith('local-session-123')
    expect(mockOnOpenTerminal).toHaveBeenCalledWith(mockSessionInfo)
    expect(mockConnectInTerminal).not.toHaveBeenCalled()
  })

  it('should handle "verify" strategy and not show toast', async () => {
    mockVerifyTunnelConfigConnection.mockResolvedValue(
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
        strategy: 'verify',
        tunnelConfigID: 'tunnel-1',
      })
    })

    await expect(promise!).resolves.toBe('')

    expect(mockVerifyTunnelConfigConnection).toHaveBeenCalledWith(
      'tunnel-1',
      ''
    )
    expect(mockedToast.loading).not.toHaveBeenCalled()
    expect(mockedToast.success).not.toHaveBeenCalled()
    expect(mockedToast.error).not.toHaveBeenCalled()
    expect(mockedToast.info).not.toHaveBeenCalled()
  })

  it('should handle host key verification during "verify" strategy', async () => {
    // 1. Initial call fails with host key error
    mockVerifyTunnelConfigConnection.mockResolvedValueOnce(
      new types.ConnectionResult({
        hostKeyVerificationRequired: new types.HostKeyVerificationRequiredError(
          {
            alias: 'my-tunnel',
            fingerprint: 'SHA256:xyz',
            hostAddress: '1.2.3.4',
          }
        ),
        success: false,
      })
    )
    // 2. User trusts the host
    mockShowDialog.mockResolvedValue({ buttonValue: 'yes' })
    // 3. Trusting the key on the backend succeeds
    mockTrustHostKeyForTunnel.mockResolvedValue(undefined)
    // 4. Second verification call succeeds
    mockVerifyTunnelConfigConnection.mockResolvedValueOnce(
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
        alias: 'my-tunnel',
        strategy: 'verify',
        tunnelConfigID: 'tunnel-abc',
      })
    })

    // Wait for dialog to be called
    await waitFor(() => {
      expect(mockShowDialog).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Host Key Verification for my-tunnel',
        })
      )
    })

    // Wait for the key to be trusted
    await waitFor(() => {
      expect(mockTrustHostKeyForTunnel).toHaveBeenCalledWith('tunnel-abc')
    })

    // Wait for the second verification attempt
    await waitFor(() => {
      expect(mockVerifyTunnelConfigConnection).toHaveBeenCalledTimes(2)
    })

    // The final promise should resolve with an empty string (the password)
    await expect(promise!).resolves.toBe('')
  })
})
