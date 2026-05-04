import React, { useState, useEffect, useCallback, useMemo } from 'react'
import type { types, sshtunnel } from '@wailsjs/go/models'
import {
  DiagnoseSSHHost,
  GetSSHHosts,
  DeleteSSHHost,
  GetSSHConfigFileContent,
  ImportSSHConfigHosts,
  PreviewSSHConfigImport,
  SaveSSHConfigFileContent,
  GetActiveTunnels,
  UpdateHostsOrder,
} from '@wailsjs/go/sshgate/Service'
import { SelectFile } from '@wailsjs/go/backend/App'
import { useDialog } from '@/hooks/useDialog'

// --- UI 组件导入 ---
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import {
  createEmptyHostMetadata,
  filterSSHHosts,
  getAllHostTags,
  loadSSHHostMetadata,
  saveSSHHostMetadata,
  type SSHHostMetadata,
  type SSHHostMetadataMap,
} from '@/lib/ssh-host-metadata'

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
  onCreateTunnelFromHost: (alias: string) => void
  isDarkMode: boolean
}

export function SshGateView({
  isActive,
  onConnect,
  onCreateTunnelFromHost,
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
            onCreateTunnelFromHost={onCreateTunnelFromHost}
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
  onCreateTunnelFromHost,
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
  onCreateTunnelFromHost: (alias: string) => void
  activeTunnels: sshtunnel.ActiveTunnelInfo[]
  dataVersion: number
  isDarkMode: boolean
  onOrderChange: (orderedIds: string[]) => void
}) {
  const [selectedAlias, setSelectedAlias] = useState<string | null>(null)
  const [hoveredAlias, setHoveredAlias] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [tagFilter, setTagFilter] = useState('all')
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [hostMetadata, setHostMetadata] = useState<SSHHostMetadataMap>(() =>
    loadSSHHostMetadata()
  )

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

  const visibleHosts = useMemo(() => {
    return filterSSHHosts(hosts, hostMetadata, {
      query,
      tag: tagFilter,
      favoritesOnly,
    })
  }, [hosts, hostMetadata, query, tagFilter, favoritesOnly])

  const allTags = useMemo(() => getAllHostTags(hostMetadata), [hostMetadata])

  const handleMetadataChange = useCallback(
    (alias: string, metadata: SSHHostMetadata) => {
      setHostMetadata((current) => {
        const next = { ...current, [alias]: metadata }
        if (!metadata.favorite && metadata.tags.length === 0) {
          delete next[alias]
        }
        saveSSHHostMetadata(next)
        return next
      })
    },
    []
  )

  const handleFavoriteToggle = useCallback(
    (alias: string) => {
      const current = hostMetadata[alias] ?? createEmptyHostMetadata()
      handleMetadataChange(alias, {
        ...current,
        favorite: !current.favorite,
      })
    },
    [hostMetadata, handleMetadataChange]
  )

  const handleVisibleOrderChange = useCallback(
    (orderedVisibleAliases: string[]) => {
      const visibleSet = new Set(visibleHosts.map((host) => host.alias))
      let visibleIndex = 0
      const mergedAliases = hosts.map((host) => {
        if (!visibleSet.has(host.alias)) return host.alias
        const nextVisibleAlias = orderedVisibleAliases[visibleIndex]
        visibleIndex += 1
        return nextVisibleAlias
      })
      onOrderChange(mergedAliases)
    },
    [hosts, visibleHosts, onOrderChange]
  )

  // 这个 effect 只负责在 hosts 列表变化后，处理默认选中
  useEffect(() => {
    if (visibleHosts.length > 0) {
      const currentSelectionExists = visibleHosts.some(
        (h) => h.alias === selectedAlias
      )
      if (!currentSelectionExists) {
        setSelectedAlias(visibleHosts[0].alias)
      }
    } else {
      setSelectedAlias(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleHosts]) // 只依赖可见 hosts

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

  const handleImportConfig = async () => {
    try {
      const path = await SelectFile('Import SSH Config')
      if (!path) return

      const previewHosts = await PreviewSSHConfigImport(path)
      const existingAliases = new Set(hosts.map((host) => host.alias))
      const newHosts = previewHosts.filter(
        (host) => !existingAliases.has(host.alias)
      )
      const skippedCount = previewHosts.length - newHosts.length

      if (newHosts.length === 0) {
        toast.info(
          skippedCount > 0
            ? 'All importable hosts already exist.'
            : 'No importable hosts found in that file.'
        )
        return
      }

      const choice = await showDialog({
        type: 'confirm',
        title: 'Import SSH Hosts',
        message:
          `Found ${newHosts.length} new host(s) in:\n${path}` +
          (skippedCount > 0
            ? `\n\n${skippedCount} existing host(s) will be skipped.`
            : ''),
        buttons: [
          { text: 'Cancel', variant: 'outline', value: 'cancel' },
          { text: 'Import', variant: 'default', value: 'import' },
        ],
      })
      if (choice.buttonValue !== 'import') return

      const results = await ImportSSHConfigHosts(newHosts, false)
      const importedCount = results.filter(
        (result) => result.status === 'imported'
      ).length
      const failedCount = results.filter(
        (result) => result.status === 'failed'
      ).length
      if (failedCount > 0) {
        toast.error(`Imported ${importedCount} host(s), ${failedCount} failed.`)
      } else {
        toast.success(`Imported ${importedCount} SSH host(s).`)
      }
      onDataChange()
    } catch (error) {
      await showDialog({
        type: 'error',
        title: 'Import Failed',
        message: String(error),
      })
    }
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
    return visibleHosts.find((h) => h.alias === aliasToShow) || null
  }, [hoveredAlias, selectedAlias, visibleHosts])

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
        <div className="space-y-2 p-2 pb-0">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search hosts, tags..."
          />
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Select value={tagFilter} onValueChange={setTagFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Tag" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tags</SelectItem>
                {allTags.map((tag) => (
                  <SelectItem key={tag} value={tag}>
                    {tag}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant={favoritesOnly ? 'default' : 'outline'}
              onClick={() => setFavoritesOnly((value) => !value)}
            >
              Favorites
            </Button>
          </div>
        </div>
        <HostList
          hosts={visibleHosts}
          metadata={hostMetadata}
          selectedAlias={selectedAlias}
          onSelect={handleSelectHost}
          onNew={handleOpenNew}
          onImport={() => void handleImportConfig()}
          onHover={handleHoverHost}
          onOrderChange={handleVisibleOrderChange}
          onFavoriteToggle={handleFavoriteToggle}
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
            onCreateTunnel={onCreateTunnelFromHost}
            activeTunnels={activeTunnels}
            onConnectInternal={() =>
              void handleConnect(hostToDisplay.alias, 'internal', undefined)
            }
            onDiagnose={(alias) => DiagnoseSSHHost(alias, '')}
            metadata={hostMetadata[hostToDisplay.alias]}
            onMetadataChange={handleMetadataChange}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <p>Select a host to view details, or add a new one.</p>
          </div>
        )}
      </div>

      <HostFormDialog
        host={editingHost}
        allHosts={hosts}
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
