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
} from '@wailsjs/go/backend/App'
import { useDialog } from '@/hooks/useDialog'

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

// #############################################################################
// #  主视图组件 (Main View Component)
// #############################################################################
export function SSHGateView({ isActive }: { isActive: boolean }) {
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
          <VisualEditor key={dataVersion} onDataChange={refreshData} />
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
function VisualEditor({ onDataChange }: { onDataChange: () => void }) {
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

  const handleConnect = async (alias: string) => {
    try {
      // 1. 调用 ConnectInTerminal，先尝试无密码连接,它现在总会成功地 resolve 一个 result 对象
      const result = await ConnectInTerminal(alias)

      debugger
      // 2. 在前端检查 result 的内容来决定下一步操作
      if (result.success) {
        // 连接成功，无需任何操作
        return
      }

      // 3. 如果连接失败，检查错误信息
      // 这个 if 块就是类型守卫。在块内部，TypeScript 确信 result.passwordRequired 存在。
      if (result.passwordRequired) {
        // 提示用户输入密码
        const result = await showDialog({
          title: `Password Required for ${alias}`,
          message: `Please enter the password to connect.`,
          prompt: {
            label: 'Password',
            type: 'password',
          },
          checkboxes: [
            {
              label: 'Save password to system keychian',
              value: 'save',
              CheckedState: true,
            },
          ],
          buttons: [
            { text: 'Cancel', variant: 'outline', value: 'cancel' },
            { text: 'Connect', variant: 'default', value: 'connect' },
          ],
        })

        console.log('handleConnect, result', result)
        // 根据用户的选择和输入，调用带密码的连接方法
        if (result.buttonValue === 'connect' && result.inputValue) {
          const savePassword = result.checkedValues?.includes('save') || false
          try {
            await ConnectInTerminalWithPassword(
              alias,
              result.inputValue,
              savePassword
            )
          } catch (connectError) {
            await showDialog({
              type: 'error',
              title: 'Connect Failed',
              message: String(connectError),
            })
          }
        } else if (result.buttonValue === 'cancel') {
          // 用户取消，不做任何操作
        } else {
          // 其他情况，例如用户没有输入密码
          await showDialog({
            type: 'error',
            title: 'Error',
            message: 'Please enter a password to connect.',
          })
        }
      }

      // 4. 检查是否需要主机验证
      else if (result.hostKeyVerificationRequired) {
        const { Fingerprint, HostAddress } = result.hostKeyVerificationRequired
        const choice = await showDialog({
          title: `Host Key Verification for ${alias}`,
          message: `The authenticity of host '${HostAddress}' can't be established.\n\nFingerprint: ${Fingerprint}\n\nAre you sure you want to continue connecting?`,
          buttons: [
            { text: 'Cancel', variant: 'outline', value: 'cancel' },
            { text: 'Yes, Trust Host', variant: 'default', value: 'yes' },
          ],
        })

        if (choice.buttonValue === 'yes') {
          try {
            // 调用新的信任并连接的函数
            // 注意：这里可能也需要处理密码
            await ConnectInTerminalAndTrustHost(alias, '', false)
          } catch (trustError) {
            console.error(trustError)
            // 在这里递归调用 handleConnect 是一种简单的处理方式
            // 更复杂的应用可能会直接在这里再次弹出密码框
            await handleConnect(alias)
          }
        }
        // 5. 其他通用错误
        else {
          await showDialog({
            type: 'error',
            title: 'Error',
            message: `Failed to connect: ${result.errorMessage}`,
          })
        }
      }
    } catch (systemError) {
      // 这里的 catch 现在只捕获 Wails 本身的系统级错误
      await showDialog({
        type: 'error',
        title: 'System Error',
        message: `A critical error occurred: ${String(systemError)}`,
      })
    }
  }

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
            onConnect={() => void handleConnect(selectedHost.alias)}
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
