// src/hooks/useSshConnection.ts

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { types } from '@wailsjs/go/models'
import {
  ConnectInTerminal,
  ConnectInTerminalAndTrustHost,
  ConnectInTerminalWithPassword,
} from '@wailsjs/go/sshgate/Service'
import {
  StartLocalSession,
  StartRemoteSession,
} from '@wailsjs/go/terminal/Service'
import { useDialog } from '@/hooks/useDialog'

// --- State Machine Types ---
interface ConnectionContext {
  alias: string
  type: 'local' | 'remote'
  strategy: 'internal' | 'external' | 'verify'
  sessionID?: string
  password?: string
  savePassword?: boolean
  trustHost?: boolean
  // For resolving the promise
  resolve: (value: string | null) => void
  reject: (reason?: unknown) => void
}

type ConnectionState =
  | { status: 'idle' }
  | { status: 'connecting'; context: ConnectionContext }
  | {
      status: 'awaiting_password'
      context: ConnectionContext
      error: types.PasswordRequiredError
    }
  | {
      status: 'awaiting_host_key'
      context: ConnectionContext
      error: types.HostKeyVerificationRequiredError
    }
  | { status: 'success'; context: ConnectionContext; message: string }
  | { status: 'cancelled'; context: ConnectionContext }
  | { status: 'failure'; context: ConnectionContext; error: Error }

/**
 * Wraps a promise with a timeout.
 * @param promise The promise to wrap.
 * @param ms The timeout in milliseconds.
 * @param timeoutMessage The error message to use on timeout.
 * @returns A new promise that races the original promise against a timeout.
 */
function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  timeoutMessage: string
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(timeoutMessage))
    }, ms)

    promise
      .then((res) => {
        clearTimeout(timeoutId)
        resolve(res)
      })
      .catch((err) => {
        clearTimeout(timeoutId)
        reject(err instanceof Error ? err : new Error(String(err)))
      })
  })
}

// Hook 的参数类型定义
interface UseSshConnectionProps {
  showDialog: ReturnType<typeof useDialog>['showDialog']
  onOpenTerminal: (sessionInfo: types.TerminalSessionInfo) => void
}

/**
 * 一个用于处理 SSH 连接逻辑的自定义 Hook。
 * 它封装了密码输入、主机密钥验证以及内部/外部终端启动的复杂流程。
 *
 * @param {UseSshConnectionProps} props - 包含 Hook 依赖项的对象。
 * @param {Function} props.showDialog - 用于显示模态对话框的函数。
 * @param {Function} props.onOpenTerminal - 在 'internal' 模式连接成功后用于打开新终端会话的回调函数。
 * @returns {{ connect: (alias: string, type?: 'local' | 'remote', sessionID?: string, strategy: 'internal' | 'external' | 'verify' = 'external') => Promise<string | null> }} - 返回一个 connect 函数，它返回一个 Promise，在 'verify' 模式下成功时解析为密码，失败或取消时为 null。
 */
export function useSshConnection({
  showDialog,
  onOpenTerminal,
}: UseSshConnectionProps) {
  const [state, setState] = useState<ConnectionState>({ status: 'idle' })

  useEffect(() => {
    const processState = async () => {
      switch (state.status) {
        case 'connecting': {
          const { context } = state
          const {
            alias,
            type,
            strategy,
            password,
            savePassword,
            trustHost,
            sessionID,
          } = context
          const dryRun = strategy !== 'external'
          const TIMEOUT_MS = 15000

          try {
            let result: types.ConnectionResult | null = null
            if (type === 'local') {
              result = new types.ConnectionResult({ success: true })
            } else {
              if (trustHost) {
                result = await withTimeout(
                  ConnectInTerminalAndTrustHost(
                    alias,
                    password ?? '',
                    savePassword ?? false,
                    dryRun
                  ),
                  TIMEOUT_MS,
                  `Connection to ${alias} timed out.`
                )
              } else {
                result = password
                  ? await withTimeout(
                      ConnectInTerminalWithPassword(
                        alias,
                        password,
                        savePassword ?? false,
                        dryRun
                      ),
                      TIMEOUT_MS,
                      `Connection to ${alias} timed out.`
                    )
                  : await withTimeout(
                      ConnectInTerminal(alias, dryRun),
                      TIMEOUT_MS,
                      `Connection to ${alias} timed out.`
                    )
              }
            }

            if (result.success) {
              switch (strategy) {
                case 'verify':
                  setState({
                    status: 'success',
                    context,
                    message: password ?? '',
                  })
                  break
                case 'internal': {
                  let sessionInfo: types.TerminalSessionInfo
                  if (type === 'local') {
                    sessionInfo = await StartLocalSession(sessionID ?? '')
                  } else {
                    sessionInfo = await StartRemoteSession(
                      alias,
                      sessionID ?? '',
                      password ?? ''
                    )
                  }
                  onOpenTerminal(sessionInfo)
                  setState({
                    status: 'success',
                    context,
                    message: `Terminal for ${alias} is ready.`,
                  })
                  break
                }
                case 'external':
                default:
                  setState({
                    status: 'success',
                    context,
                    message: `Terminal for ${alias} launched.`,
                  })
                  break
              }
            } else if (result.passwordRequired) {
              setState({
                status: 'awaiting_password',
                context,
                error: result.passwordRequired,
              })
            } else if (result.hostKeyVerificationRequired) {
              setState({
                status: 'awaiting_host_key',
                context,
                error: result.hostKeyVerificationRequired,
              })
            } else if (result.errorMessage) {
              setState({
                status: 'failure',
                context,
                error: new Error(result.errorMessage),
              })
            } else {
              setState({
                status: 'failure',
                context,
                error: new Error('An unknown connection error occurred.'),
              })
            }
          } catch (error) {
            setState({
              status: 'failure',
              context,
              error: error as Error,
            })
          }
          break
        }

        case 'awaiting_password': {
          const { context, error } = state
          const dialogResult = await showDialog({
            type: 'confirm',
            title: `Password Required for ${context.alias}`,
            message: error.message
              ? `${error.message}\nPlease enter the password.`
              : `Please enter the password to connect.`,
            prompt: { label: 'Password', type: 'password' },
            checkboxes: [
              {
                label: 'Save password to system keychain',
                value: 'save',
              },
            ],
            buttons: [
              { text: 'Cancel', variant: 'outline', value: 'cancel' },
              { text: 'Connect', variant: 'default', value: 'connect' },
            ],
          })

          if (
            dialogResult.buttonValue === 'connect' &&
            dialogResult.inputValue
          ) {
            setState({
              status: 'connecting',
              context: {
                ...context,
                password: dialogResult.inputValue,
                savePassword:
                  dialogResult.checkedValues?.includes('save') || false,
                trustHost: false, // Reset trust host on password prompt
              },
            })
          } else {
            setState({ status: 'cancelled', context })
          }
          break
        }

        case 'awaiting_host_key': {
          const { context, error } = state
          const { fingerprint, hostAddress } = error
          const choice = await showDialog({
            type: 'confirm',
            title: `Host Key Verification for ${context.alias}`,
            message: `The authenticity of host '${hostAddress}' can't be established.\n\nFingerprint: ${fingerprint}\n\nAre you sure you want to continue connecting?`,
            buttons: [
              { text: 'Cancel', variant: 'outline', value: 'cancel' },
              {
                text: 'Yes, Trust Host',
                variant: 'default',
                value: 'yes',
              },
            ],
          })

          if (choice.buttonValue === 'yes') {
            setState({
              status: 'connecting',
              context: { ...context, trustHost: true },
            })
          } else {
            setState({ status: 'cancelled', context })
          }
          break
        }

        case 'success': {
          const { context, message } = state
          context.resolve(message)
          setState({ status: 'idle' })
          break
        }

        case 'failure': {
          const { context, error } = state
          await showDialog({
            type: 'error',
            title: 'Connection Failed',
            message: error.message,
          })
          context.reject(error)
          setState({ status: 'idle' })
          break
        }

        case 'cancelled': {
          const { context } = state
          context.resolve(null)
          setState({ status: 'idle' })
          break
        }
      }
    }
    void processState()
  }, [state, showDialog, onOpenTerminal])

  const connect = useCallback(
    (
      alias: string,
      type: 'local' | 'remote' = 'remote',
      sessionID?: string,
      strategy: 'internal' | 'external' | 'verify' = 'external'
    ): Promise<string | null> => {
      const connectionPromise = new Promise<string | null>(
        (resolve, reject) => {
          setState({
            status: 'connecting',
            context: {
              alias,
              type,
              strategy,
              sessionID,
              resolve,
              reject,
            },
          })
        }
      )

      // 仅在非 'verify' 模式下显示 toast.promise
      if (strategy !== 'verify') {
        toast.promise(connectionPromise, {
          loading: `Connecting to ${alias}...`,
          duration: 1500,
          success: (successMessage) => successMessage as string,
          error: (error: unknown) =>
            error instanceof Error
              ? error.message
              : 'An unknown error occurred.',
        })
      }
      return connectionPromise
    },
    [] // No dependencies, connect function is stable
  )

  return { connect }
}
