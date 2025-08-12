// src/hooks/useSshConnection.ts

import { useCallback } from 'react'
import { toast } from 'sonner'
import type { types } from '@wailsjs/go/models'
import {
  ConnectInTerminal,
  ConnectInTerminalWithPassword,
  ConnectInTerminalAndTrustHost,
} from '@wailsjs/go/sshgate/Service'
import {
  StartLocalSession,
  StartRemoteSession,
} from '@wailsjs/go/terminal/Service'
import { useDialog } from '@/hooks/useDialog'

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
  const connect = useCallback(
    (
      alias: string,
      type?: 'local' | 'remote',
      sessionID?: string,
      strategy: 'internal' | 'external' | 'verify' = 'external'
    ): Promise<string | null> => {
      const connectionPromise = new Promise<string | null>(
        (resolve, reject) => {
          // 使用 void 明确告知 linter 我们有意不 await 这个 IIFE
          void (async () => {
            let currentPassword = ''
            let savePassword = false
            let trustHost = false
            const dryRun = strategy === 'internal'

            // 使用一个循环来处理多步骤的交互式对话
            while (true) {
              try {
                let result: types.ConnectionResult | null = null

                // 对于本机的直接设置成功
                if (type === 'local') {
                  strategy = 'internal'
                  result = { success: true } as types.ConnectionResult
                } else {
                  if (trustHost) {
                    result = await ConnectInTerminalAndTrustHost(
                      alias,
                      currentPassword,
                      savePassword,
                      dryRun
                    )
                    trustHost = false // 重置信任标志，只用一次
                  } else {
                    result = currentPassword
                      ? await ConnectInTerminalWithPassword(
                          alias,
                          currentPassword,
                          savePassword,
                          dryRun
                        )
                      : await ConnectInTerminal(alias, dryRun)
                  }
                }

                if (result.success) {
                  if (strategy === 'verify') {
                    resolve(currentPassword)
                    return
                  }
                  if (strategy === 'internal') {
                    let sessionInfo: types.TerminalSessionInfo
                    switch (type) {
                      case 'local':
                        sessionInfo = await StartLocalSession(
                          sessionID as string
                        )
                        break
                      case 'remote':
                        sessionInfo = await StartRemoteSession(
                          alias,
                          sessionID as string,
                          currentPassword
                        )

                        break
                      default:
                        reject(new Error(`unknown type ${type}`))
                        return
                    }
                    onOpenTerminal(sessionInfo)
                    console.log(`Connection for ${alias} opened successfully.`)
                    // 在 'internal' 模式下，由调用方决定是否显示 toast
                    // toast.success(`Terminal for ${alias} is ready.`)
                    resolve(`Terminal for ${alias} is ready.`)
                  } else {
                    console.log('Connection successful!')
                    // 在 'external' 模式下，显示 toast 是合适的
                    // toast.success(`Terminal for ${alias} launched.`)
                    resolve(`Terminal for ${alias} launched.`)
                  }
                  return // 成功，结束循环
                }

                if (result.passwordRequired) {
                  const dialogResult = await showDialog({
                    type: 'confirm',
                    title: `Password Required for ${alias}`,
                    message: result.errorMessage
                      ? `${result.errorMessage}\nPlease enter the password.`
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
                    currentPassword = dialogResult.inputValue
                    savePassword =
                      dialogResult.checkedValues?.includes('save') || false
                    continue // 继续循环，这次会带着密码
                  } else {
                    resolve(null) // 用户取消
                    return // 用户取消，结束循环
                  }
                } else if (result.hostKeyVerificationRequired) {
                  const { Fingerprint, HostAddress } =
                    result.hostKeyVerificationRequired
                  const choice = await showDialog({
                    type: 'confirm',
                    title: `Host Key Verification for ${alias}`,
                    message: `The authenticity of host '${HostAddress}' can't be established.\n\nFingerprint: ${Fingerprint}\n\nAre you sure you want to continue connecting?`,
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
                    trustHost = true // 设置信任标志
                    continue // 继续循环，这次会信任主机
                  } else {
                    resolve(null) // 用户取消
                    return // 用户取消，结束循环
                  }
                } else if (result.errorMessage) {
                  await showDialog({
                    type: 'error',
                    title: 'Connection Failed',
                    message: result.errorMessage,
                  })
                  reject(new Error(result.errorMessage))
                  return // 错误，结束循环
                } else {
                  await showDialog({
                    type: 'error',
                    title: 'Error',
                    message: 'An unknown connection error occurred.',
                  })
                  reject(new Error('An unknown connection error occurred.'))
                  return // 未知错误，结束循环
                }
              } catch (systemError) {
                await showDialog({
                  type: 'error',
                  title: 'System Error',
                  message: `A critical error occurred: ${String(systemError)}`,
                })
                reject(systemError as Error)
                return // 系统错误，结束循环
              }
            }
          })()
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
    [showDialog, onOpenTerminal] // Hook 的依赖项
  )

  return { connect }
}
