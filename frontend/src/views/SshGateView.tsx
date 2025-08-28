import React, { useState, useEffect, useCallback, useMemo } from 'react'
import type { types, sshtunnel } from '@wailsjs/go/models'
import {
  GetSSHHosts,
  DeleteSSHHost,
  GetSSHConfigFileContent,
  SaveSSHConfigFileContent,
  GetActiveTunnels,
  UpdateHostsOrder,
} from '@wailsjs/go/sshgate/Service'
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
import { EventsOn } from '@wailsjs/runtime'
import { appLogger } from '@/lib/logger'
import { toast } from 'sonner'

// #############################################################################
// #  主视图组件 (Main View Component)
// #############################################################################

interface SshGateViewProps {
  isActive: boolean
  onConnect: (
    alias: string,
    type: 'local' | 'remote',
    strategy: 'internal' | 'external'
  ) => void
  isDarkMode: boolean
}

export function SshGateView({
  isActive,
  onConnect,
  isDarkMode,
}: SshGateViewProps) {
  // 这个 state 用于在两个 Tab 之间同步数据刷新
  // 当 RawEditor 保存了文件，或 VisualEditor 增删改了主机，
  // 我们就增加 dataVersion 的值，这会强制两个 Tab 都重新获取数据
  const [dataVersion, setDataVersion] = useState(0)
  const refreshData = () => setDataVersion((v) => v + 1)
  const [activeTab, setActiveTab] = useState('hosts')
  const { showDialog } = useDialog()

  const logger = useMemo(() => {
    return appLogger.withPrefix('SshGateView')
  }, [])

  // --- Lifted State for SSH Hosts ---
  const [hosts, setHosts] = useState<types.SSHHost[]>([])
  const [isLoadingHosts, setIsLoadingHosts] = useState(true)

  const fetchHosts = useCallback(async () => {
    setIsLoadingHosts(true)
    try {
      setHosts(await GetSSHHosts())
    } catch (error) {
      void showDialog({
        type: 'error',
        title: 'Error',
        message: `Failed to load SSH hosts: ${String(error)}`,
      })
    } finally {
      setIsLoadingHosts(false)
    }
  }, [showDialog])

  // 使用Hook，告诉 useOnVisible: 当这个组件可见时，执行 refreshData 函数
  const [activeTunnels, setActiveTunnels] = useState<
    sshtunnel.ActiveTunnelInfo[]
  >([])
  const [isLoadingTunnels, setIsLoadingTunnels] = useState(true)

  useEffect(() => {
    logger.debug('isLoadingTunnels', isLoadingTunnels)
  }, [logger, isLoadingTunnels])

  const fetchTunnels = useCallback(
    async (isInitialLoad = false) => {
      if (isInitialLoad) {
        setIsLoadingTunnels(true)
      }
      try {
        const tunnels = await GetActiveTunnels()
        setActiveTunnels(tunnels)
      } catch (error) {
        logger.error(`Failed to fetch active tunnels: ${String(error)}`)
      } finally {
        if (isInitialLoad) {
          setIsLoadingTunnels(false)
        }
      }
    },
    [logger]
  )

  useEffect(() => {
    void fetchTunnels(true) // Initial load
    const cleanupTunnelChangedEvent = EventsOn(
      'tunnels:changed',
      () => void fetchTunnels(false)
    ) // Background refresh
    return () => {
      cleanupTunnelChangedEvent()
    }
  }, [fetchTunnels])

  useEffect(() => {
    void fetchHosts()
  }, [fetchHosts, dataVersion])

  const handleOrderChange = useCallback(
    (orderedAliases: string[]) => {
      const originalHosts = [...hosts]
      // Optimistic UI update
      setHosts((currentHosts) => {
        const hostMap = new Map(currentHosts.map((h) => [h.alias, h]))
        return orderedAliases
          .map((alias) => hostMap.get(alias))
          .filter(Boolean) as types.SSHHost[]
      })

      UpdateHostsOrder(orderedAliases).catch((err) => {
        toast.error('Failed to save host order.')
        logger.error('Failed to update host order:', err)
        setHosts(originalHosts) // Revert on error
      })
    },
    [hosts, logger]
  )

  useOnVisible(refreshData, isActive)
  console.log('ssh gate, data version:', dataVersion)

  return (
    // 根容器
    <div className="p-2 h-full flex flex-col">
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
              <TabsTrigger value="hosts">Hosts</TabsTrigger>
              <TabsTrigger value="raw">Raw Editor</TabsTrigger>
            </TabsList>
          </div>
        </div>

        {/* 可视化编辑器 Tab */}
        <TabsContent value="hosts" className="flex-1 min-h-0">
          <HostsView
            hosts={hosts}
            isLoading={isLoadingHosts}
            dataVersion={dataVersion}
            onDataChange={refreshData}
            onConnect={onConnect}
            activeTunnels={activeTunnels}
            isDarkMode={isDarkMode}
            onOrderChange={handleOrderChange}
          />
        </TabsContent>

        {/* 原始文件编辑器 Tab */}
        <TabsContent value="raw" className="flex-1 mt-2 flex flex-col min-h-0">
          <RawEditor
            dataVersion={dataVersion}
            onDataChange={refreshData}
            isDarkMode={isDarkMode}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// #############################################################################
// #  子组件：可视化编辑器 (Visual Editor)
// #############################################################################
const HostsView = React.memo(function HostsView({
  hosts,
  isLoading,
  onDataChange,
  onConnect,
  activeTunnels,
  dataVersion,
  isDarkMode,
  onOrderChange,
}: {
  hosts: types.SSHHost[]
  isLoading: boolean
  onDataChange: () => void
  onConnect: (
    alias: string,
    type: 'local' | 'remote',
    strategy: 'internal' | 'external',
    sessionID?: string
  ) => void
  activeTunnels: sshtunnel.ActiveTunnelInfo[]
  dataVersion: number
  isDarkMode: boolean
  onOrderChange: (orderedIds: string[]) => void
}) {
  const [selectedAlias, setSelectedAlias] = useState<string | null>(null)
  const [hoveredAlias, setHoveredAlias] = useState<string | null>(null)

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingHost, setEditingHost] = useState<types.SSHHost | null>(null)
  const { showDialog } = useDialog()

  const logger = useMemo(() => {
    return appLogger.withPrefix('SshGateView').withPrefix('HostsView')
  }, [])

  useEffect(() => {
    logger.info(
      'HostsView, isDarkMode:',
      isDarkMode,
      'dataVersion:',
      dataVersion
    )
  }, [isDarkMode, logger, dataVersion])

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

  const handleSelectHost = (alias: string) => {
    setSelectedAlias(alias)
    setHoveredAlias(null) // Clear hover state on explicit selection
  }

  const handleHoverHost = (alias: string) => {
    setHoveredAlias(alias)
  }

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
      onDataChange() // 通知父组件数据已变动
    } catch (error) {
      await showDialog({
        type: 'error',
        title: 'Error',
        message: `Failed to delete host: ${String(error)}`,
      })
    }
  }

  const handleConnect = (
    alias: string,
    strategy: 'internal' | 'external' = 'external',
    sessionID?: string
  ) => {
    void onConnect(alias, 'remote', strategy, sessionID)
  }

  const hostToDisplay = useMemo(() => {
    const aliasToShow = hoveredAlias || selectedAlias
    if (!aliasToShow) return null
    return hosts.find((h) => h.alias === aliasToShow) || null
  }, [hoveredAlias, selectedAlias, hosts])

  const isPreviewing = useMemo(() => {
    return !!hoveredAlias && hoveredAlias !== selectedAlias
  }, [hoveredAlias, selectedAlias])

  if (isLoading) return <p>Loading SSH hosts...</p>

  return (
    <div className="flex h-full">
      {/* 左侧主机列表 */}
      <div
        className="w-1/3 max-w-xs flex-shrink-0 bg-muted/50 rounded-md"
        onMouseLeave={() => setHoveredAlias(null)}
      >
        <HostList
          hosts={hosts}
          selectedAlias={selectedAlias}
          onSelect={handleSelectHost}
          onNew={handleOpenNew}
          onHover={handleHoverHost}
          onOrderChange={onOrderChange}
        />
      </div>

      {/* 右侧详情 */}
      <div className="flex-1 p-6 overflow-y-auto">
        {hostToDisplay ? (
          <HostDetail
            key={hostToDisplay.alias} // Use key to ensure re-mount on host change
            host={hostToDisplay}
            isPreview={isPreviewing}
            onEdit={() => void handleOpenEdit(hostToDisplay)}
            onDelete={() => void handleDelete(hostToDisplay.alias)}
            onConnectExternal={() =>
              void handleConnect(hostToDisplay.alias, 'external')
            }
            activeTunnels={activeTunnels}
            onConnectInternal={() =>
              void handleConnect(hostToDisplay.alias, 'internal', undefined)
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
        onSave={onDataChange}
      />
    </div>
  )
})

// #############################################################################
// #  子组件：原始文件编辑器 (Raw Editor)
// #############################################################################
const RawEditor = React.memo(function RawEditor({
  onDataChange,
  dataVersion,
  isDarkMode,
}: {
  onDataChange: () => void
  dataVersion: number
  isDarkMode: boolean
}) {
  const [content, setContent] = useState('')
  const [isDirty, setIsDirty] = useState(false)
  const { showDialog } = useDialog()
  // const isDarkMode = useMemo(
  //   () => window.matchMedia?.('(prefers-color-scheme: dark)').matches,
  //   []
  // )

  useEffect(() => {
    GetSSHConfigFileContent()
      .then(setContent)
      .catch((e) =>
        showDialog({ type: 'error', title: 'Error', message: String(e) })
      )
  }, [showDialog, dataVersion])

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
      <div className="absolute inset-0 border border-border rounded-md overflow-y-auto">
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
})
