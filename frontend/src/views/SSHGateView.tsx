import React, { useState, useEffect, useCallback, useMemo } from 'react'
import type { types } from '@wailsjs/go/models'
import {
  GetSSHHosts,
  ConnectInTerminal,
  DeleteSSHHost,
  GetSSHConfigFileContent,
  SaveSSHConfigFileContent,
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

// #############################################################################
// #  主视图组件 (Main View Component)
// #############################################################################
export function SSHGateView() {
  // 这个 state 用于在两个 Tab 之间同步数据刷新
  // 当 RawEditor 保存了文件，或 VisualEditor 增删改了主机，
  // 我们就增加 dataVersion 的值，这会强制两个 Tab 都重新获取数据
  const [dataVersion, setDataVersion] = useState(0)
  const refreshData = () => setDataVersion((v) => v + 1)

  return (
    <div className="p-4 h-full flex flex-col">
      <div className="flex-shrink-0">
        <h1 className="text-2xl font-bold mb-2">SSH Gate</h1>
        <p className="text-muted-foreground mb-4">
          Manage hosts from `~/.ssh/config`
        </p>
      </div>
      {/* Tabs 组件作为主容器 */}
      <Tabs defaultValue="visual" className="flex-1 flex flex-col min-h-0">
        <TabsList className="flex-shrink-0">
          <TabsTrigger value="visual">Visual Editor</TabsTrigger>
          <TabsTrigger value="raw">Raw File Editor</TabsTrigger>
        </TabsList>

        {/* 可视化编辑器 Tab (现在内部是主从布局) */}
        <TabsContent value="visual" className="flex-1 min-h-0 mt-4">
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
    })
    if (choice !== 'yes') return
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
      await ConnectInTerminal(alias)
    } catch (error) {
      await showDialog({
        type: 'error',
        title: 'Error',
        message: `Failed to connect: ${String(error)}`,
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
      await showDialog({ title: 'Success', message: 'SSH config file saved.' })
      onDataChange() // 通知父组件数据已变动
    } catch (error) {
      await showDialog({ title: 'Validation Error', message: String(error) })
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
