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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import CodeMirror from '@uiw/react-codemirror'
import { oneDark } from '@codemirror/theme-one-dark'
// 导入 legacy-modes 中的 shell 对象
import { shell } from '@codemirror/legacy-modes/mode/shell'
// 导入 StreamLanguage 转换器
import { StreamLanguage } from '@codemirror/language'
import { Extension } from '@codemirror/state'
import { PlayCircle, Pencil, Trash2, Save } from 'lucide-react'
import { HostFormDialog } from '@/components/sshgate/HostFormDialog'

// #############################################################################
// #  主视图组件 (Main View Component)
// #############################################################################
export function SSHGateView() {
  // 这个 state 用于在两个 Tab 之间同步数据刷新
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

        {/* 可视化编辑器 Tab */}
        <TabsContent
          value="visual"
          className="flex-1 overflow-y-auto mt-4 min-h-0"
        >
          <VisualEditor key={dataVersion} onDataChange={refreshData} />
        </TabsContent>

        {/* 原始文件编辑器 Tab */}
        <TabsContent
          value="raw"
          className="flex-1 mt-2 flex flex-col overflow-y-auto min-h-0"
        >
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
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingHost, setEditingHost] = useState<types.SSHHost | null>(null)

  const { showDialog } = useDialog()

  const fetchHosts = useCallback(async () => {
    setIsLoading(true)
    try {
      setHosts(await GetSSHHosts())
    } catch (error) {
      await showDialog({
        title: 'Error',
        message: `Failed to load SSH hosts: ${String(error)}`,
      })
    } finally {
      setIsLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    void fetchHosts()
  }, [fetchHosts])

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

  return (
    <div>
      <div className="flex justify-end mb-4">
        <Button onClick={handleOpenNew}>+ Add Host</Button>
      </div>
      {isLoading ? (
        <p>Loading...</p>
      ) : (
        <div className="overflow-y-auto pr-2">
          {hosts.length === 0 ? (
            <p>No hosts found.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {hosts.map((host) => (
                <Card key={host.alias}>
                  <CardHeader>
                    <CardTitle className="font-mono flex items-center justify-between">
                      {host.alias}
                      <div className="flex items-center space-x-1">
                        <Button
                          onClick={() => handleOpenEdit(host)}
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          onClick={() => void handleDelete(host.alias)}
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        <Button
                          onClick={() => void handleConnect(host.alias)}
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                        >
                          <PlayCircle className="h-5 w-5" />
                        </Button>
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground space-y-1">
                    <p>
                      <span className="font-semibold text-foreground">
                        Host:
                      </span>{' '}
                      {host.hostName}
                    </p>
                    <p>
                      <span className="font-semibold text-foreground">
                        User:
                      </span>{' '}
                      {host.user}
                    </p>
                    {host.port && (
                      <p>
                        <span className="font-semibold text-foreground">
                          Port:
                        </span>{' '}
                        {host.port}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
      <HostFormDialog
        host={editingHost}
        isOpen={isFormOpen}
        onOpenChange={setIsFormOpen}
        // Fixed: Call the fetchHosts function
        onSave={() => void fetchHosts()}
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
