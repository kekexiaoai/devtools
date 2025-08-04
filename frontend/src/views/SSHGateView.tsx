import React, { useState, useEffect, useCallback, useMemo } from 'react'
import type { types } from '@wailsjs/go/models'
import {
  GetSSHHosts,
  ConnectInTerminal,
  DeleteSSHHost,
  GetSSHConfigFileContent,
  SaveSSHConfigFileContent,
  ConnectInTerminalWithPassword,
  ConnectInTerminalAndTrustHost,
} from '@wailsjs/go/sshgate/Service'
import { useDialog } from '@/hooks/useDialog'
import { toast } from 'sonner'

// --- UI 组件导入 ---
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import CodeMirror from '@uiw/react-codemirror'
import { oneDark } from '@codemirror/theme-one-dark'
import { shell } from '@codemirror/legacy-modes/mode/shell'
import { StreamLanguage } from '@codemirror/language'
import { Extension } from '@codemirror/state'
import { HostFormDialog } from '@/components/sshgate/HostFormDialog'
import { HostList } from '@/components/sshgate/HostList'
import { HostDetail } from '@/components/sshgate/HostDetail'
import { Save } from 'lucide-react'
import { useOnVisible } from '@/hooks/useOnVisible'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { IntegratedTerminal } from '@/components/sshgate/IntegratedTerminal'
import { StartSession as StartTerminalSession } from '@wailsjs/go/terminal/Service'
import { TerminalSession } from '@/App'

// #############################################################################
// #  主视图组件 (Main View Component)
// #############################################################################

interface SSHGateViewProps {
  isActive: boolean
  onOpenTerminal: (host: TerminalSession) => void
}

export function SSHGateView({ isActive, onOpenTerminal }: SSHGateViewProps) {
  // 这个 state 用于在两个 Tab 之间同步数据刷新
  // 当 RawEditor 保存了文件，或 VisualEditor 增删改了主机，
  // 我们就增加 dataVersion 的值，这会强制两个 Tab 都重新获取数据
  const [dataVersion, setDataVersion] = useState(0)
  const refreshData = () => setDataVersion((v) => v + 1)
  const [activeTab, setActiveTab] = useState('visual')

  // 使用Hook，告诉 useOnVisible: 当这个组件可见时，执行 refreshData 函数
  useOnVisible(refreshData, isActive)
  console.log('ssh gate, data version:', dataVersion)

  return (
    // 根容器
    <div className="p-4 h-full flex flex-col">
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex-1 flex flex-col min-h-0"
      >
        {/* 集成式标题栏 */}
        <div className="flex-shrink-0 flex justify-between items-center mb-4">
          {/* 左侧标题区 */}
          <div>
            <h1 className="text-2xl font-bold">SSH Gate</h1>
            <p className="text-muted-foreground">
              Manage hosts from `~/.ssh/config`
            </p>
          </div>
          {/* 右侧操作区 */}
          <div className="flex items-center space-x-4">
            <TabsList>
              <TabsTrigger value="visual">Visual Editor</TabsTrigger>
              <TabsTrigger value="raw">Raw File Editor</TabsTrigger>
            </TabsList>
          </div>
        </div>

        {/* 可视化编辑器 Tab */}
        <TabsContent value="visual" className="flex-1 min-h-0">
          <VisualEditor
            key={dataVersion}
            onDataChange={refreshData}
            onOpenTerminal={onOpenTerminal}
          />
        </TabsContent>

        {/* 原始文件编辑器 Tab */}
        <TabsContent value="raw" className="flex-1 mt-2 flex flex-col min-h-0">
          <RawEditor key={dataVersion} onDataChange={refreshData} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// #############################################################################
// #  子组件：可视化编辑器 (Visual Editor)
// #############################################################################
function VisualEditor({
  onDataChange,
  onOpenTerminal,
}: {
  onDataChange: () => void
  onOpenTerminal: (session: TerminalSession) => void
}) {
  const [hosts, setHosts] = useState<types.SSHHost[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedAlias, setSelectedAlias] = useState<string | null>(null)

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingHost, setEditingHost] = useState<types.SSHHost | null>(null)
  const { showDialog } = useDialog()

  const fetchHosts = useCallback(async () => {
    setIsLoading(true)
    try {
      setHosts(await GetSSHHosts())
    } catch (error) {
      await showDialog({
        type: 'error',
        title: 'Error',
        message: `Failed to load SSH hosts: ${String(error)}`,
      })
    } finally {
      setIsLoading(false)
    }
  }, [showDialog])

  useEffect(() => {
    void fetchHosts()
  }, [fetchHosts])

  // 这个 effect 只负责在 hosts 列表变化后，处理默认选中
  useEffect(() => {
    if (hosts.length > 0) {
      const currentSelectionExists = hosts.some(
        (h) => h.alias === selectedAlias
      )
      if (!currentSelectionExists) {
        setSelectedAlias(hosts[0].alias)
      }
    } else {
      setSelectedAlias(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hosts]) // 只依赖 hosts

  const handleOpenNew = () => {
    setEditingHost(null)
    setIsFormOpen(true)
  }
  const handleOpenEdit = (host: types.SSHHost) => {
    setEditingHost(host)
    setIsFormOpen(true)
  }

  const handleDelete = async (alias: string) => {
    const choice = await showDialog({
      type: 'confirm',
      title: 'Delete Host',
      message: `Are you sure you want to delete the host "${alias}"?`,
      buttons: [
        { text: 'Cancel', variant: 'outline', value: 'cancel' },
        { text: 'Yes, Delete', variant: 'destructive', value: 'yes' },
      ],
    })
    console.log('handleDelete, choice', choice)
    if (choice.buttonValue !== 'yes') return
    try {
      await DeleteSSHHost(alias)
      await fetchHosts()
      onDataChange() // 通知父组件数据已变动
    } catch (error) {
      await showDialog({
        type: 'error',
        title: 'Error',
        message: `Failed to delete host: ${String(error)}`,
      })
    }
  }

  // === 终端会话管理 ===
  const [terminalSession, setTerminalSession] = useState<{
    alias: string
    url: string
  } | null>(null)

  const handleConnectionAttempt = useCallback(
    (alias: string, strategy: 'internal' | 'external') => {
      const connectionPromise = new Promise<string>((resolve, reject) => {
        // 使用 void 来明确告知 linter 我们有意不 await 这个 IIFE
        void (async () => {
          let currentPassword = ''
          let savePassword = false

          let trustHost = false

          // 使用一个循环来处理多步骤的交互式对话
          while (true) {
            try {
              let result: types.ConnectionResult | null = null

              // 根据 trustHost 状态，决定调用哪个函数
              if (trustHost) {
                result = await ConnectInTerminalAndTrustHost(
                  alias,
                  currentPassword,
                  savePassword
                )
                trustHost = false // 重置信任标志，只用一次
              } else {
                result = currentPassword
                  ? await ConnectInTerminalWithPassword(
                      alias,
                      currentPassword,
                      savePassword
                    )
                  : await ConnectInTerminal(alias)
              }

              if (result.success) {
                // 预检成功后，根据“策略”执行最终动作
                if (strategy === 'internal') {
                  const sessionInfo = await StartTerminalSession(
                    alias,
                    currentPassword
                  )
                  // 关键：调用从 App 组件传下来的 onOpenTerminal 函数
                  onOpenTerminal({
                    id: sessionInfo.id,
                    alias,
                    url: sessionInfo.url,
                  }) // 使用 url 作为唯一 ID
                  const url = sessionInfo.url

                  console.log(`Connecting ws ${url} ...`)
                  setTerminalSession({ alias, url })
                  console.log(`Connection for ${alias} opened successfully.`)
                  resolve(`Terminal for ${alias} is ready.`)
                } else {
                  console.log('Connection successful!')
                  resolve(`Terminal for ${alias} launched.`)
                }

                return
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
                  continue // 继续下一次循环，这次会带着密码
                } else {
                  reject(new Error('Connection cancelled by user.')) // 用户取消，Promise 失败
                  return // 用户取消，使用 return 终止
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
                  continue // 继续下一次循环，这次会信任主机
                } else {
                  reject(new Error('Connection cancelled by user.')) // 用户取消，Promise 失败
                  return // 用户取消，使用 return 终止
                }
              } else if (result.errorMessage) {
                await showDialog({
                  type: 'error',
                  title: 'Connection Failed',
                  message: result.errorMessage,
                })
                reject(new Error(result.errorMessage))
                return // 出现未知错误，使用 return 终止
              } else {
                await showDialog({
                  type: 'error',
                  title: 'Error',
                  message: 'An unknown connection error occurred.',
                })
                reject(new Error('An unknown connection error occurred.'))
                return // 出现未知错误，使用 return 终止
              }
            } catch (systemError) {
              // toast.error('System Error', {
              //   id: toastId,
              //   description: `A critical error occurred: ${String(systemError)}`,
              // })
              await showDialog({
                type: 'error',
                title: 'System Error',
                message: `A critical error occurred: ${String(systemError)}`,
              })
              reject(systemError as Error) // 系统级错误，Promise 失败
              return // 系统级错误，使用 return 终止
            }
          }
        })()
      })

      toast.promise(connectionPromise, {
        loading: `Connecting to ${alias}...`,
        success: (successMessage) => {
          return successMessage
        },
        // 在 error 回调中添加类型检查
        error: (error: unknown) => {
          if (error instanceof Error) {
            return error.message // 安全地访问 .message
          }
          return 'An unknown error occurred.'
        },
      })
    },
    [showDialog, onOpenTerminal]
  )

  const selectedHost = useMemo(() => {
    if (!selectedAlias) return null
    return hosts.find((h) => h.alias === selectedAlias) || null
  }, [selectedAlias, hosts])

  if (isLoading) return <p>Loading SSH hosts...</p>

  return (
    <div className="flex h-full">
      {/* 左侧主机列表 */}
      <div className="w-1/3 max-w-xs flex-shrink-0 bg-muted/50 rounded-md">
        <HostList
          hosts={hosts}
          selectedAlias={selectedAlias}
          onSelect={setSelectedAlias}
          onNew={handleOpenNew}
        />
      </div>

      {/* 右侧详情 */}
      <div className="flex-1 p-6 overflow-y-auto">
        {selectedHost ? (
          <HostDetail
            key={selectedHost.alias}
            host={selectedHost}
            onEdit={() => void handleOpenEdit(selectedHost)}
            onDelete={() => void handleDelete(selectedHost.alias)}
            onConnectExternal={() =>
              void handleConnectionAttempt(selectedHost.alias, 'external')
            }
            onConnectInternal={() =>
              void handleConnectionAttempt(selectedHost.alias, 'internal')
            }
          />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <p>Select a host to view details, or add a new one.</p>
          </div>
        )}
      </div>

      <HostFormDialog
        host={editingHost}
        isOpen={isFormOpen}
        onOpenChange={setIsFormOpen}
        onSave={() => {
          void fetchHosts()
          onDataChange()
        }}
      />

      {/* 渲染内置终端模态框 */}
      <Dialog
        open={!!terminalSession}
        onOpenChange={(isOpen) => !isOpen && setTerminalSession(null)}
      >
        <DialogContent className="w-[90vw] h-[90vh] max-w-none flex flex-col p-0">
          <div className="p-2 border-b flex justify-between items-center">
            <span className="font-mono text-sm font-semibold">
              Terminal: {terminalSession?.alias}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setTerminalSession(null)}
            >
              Close
            </Button>
          </div>
          <div className="flex-grow">
            {terminalSession && (
              <IntegratedTerminal websocketUrl={terminalSession.url} />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// #############################################################################
// #  子组件：原始文件编辑器 (Raw Editor)
// #############################################################################
function RawEditor({ onDataChange }: { onDataChange: () => void }) {
  const [content, setContent] = useState('')
  const [isDirty, setIsDirty] = useState(false)
  const { showDialog } = useDialog()
  const isDarkMode = useMemo(
    () => window.matchMedia?.('(prefers-color-scheme: dark)').matches,
    []
  )

  useEffect(() => {
    GetSSHConfigFileContent()
      .then(setContent)
      .catch((e) =>
        showDialog({ type: 'error', title: 'Error', message: String(e) })
      )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSave = async () => {
    try {
      await SaveSSHConfigFileContent(content)
      setIsDirty(false)
      await showDialog({
        type: 'success',
        title: 'Success',
        message: 'SSH config file saved.',
      })
      onDataChange() // 通知父组件数据已变动
    } catch (error) {
      await showDialog({
        type: 'error',
        title: 'Validation Error',
        message: String(error),
      })
    }
  }

  const onChange = useCallback((value: string) => {
    setContent(value)
    setIsDirty(true)
  }, [])
  // 在 useMemo 中使用 StreamLanguage.define() 来包装 shell
  const extensions = useMemo(() => {
    const exts: Extension[] = [StreamLanguage.define(shell) as Extension]
    if (isDarkMode) {
      exts.push(oneDark)
    }
    return exts
  }, [isDarkMode])

  return (
    //  容器设为 flex-1，让它在父级 Flex 容器中伸展
    //    relative 用于定位内部的“保存”按钮
    <div className="flex-1 relative">
      {/* CodeMirror 的 height="100%" 会让它填满这个容器，
           其内部的滚动条现在可以正常工作了
      */}
      <div className="absolute inset-0 border rounded-md overflow-y-auto">
        <CodeMirror
          value={content}
          onChange={onChange}
          extensions={extensions}
          height="100%"
          theme={isDarkMode ? 'dark' : 'light'}
        />
      </div>

      {isDirty && (
        <Button
          size="sm"
          className="absolute top-2 right-2 z-10"
          onClick={() => void handleSave()}
        >
          <Save className="mr-2 h-4 w-4" /> Save File
        </Button>
      )}
    </div>
  )
}
