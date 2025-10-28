import { useEffect, useState, useCallback } from 'react'
import {
  DeleteSyncPair,
  GetSyncPairs,
  SaveSyncPair,
} from '@wailsjs/go/filesyncer/Service'
import { SelectDirectory } from '@wailsjs/go/backend/App'
import { types } from '@wailsjs/go/models'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Pencil, Trash2 } from 'lucide-react'
import { useDialog } from '@/hooks/useDialog'

interface SyncPairsManagerProps {
  config: types.SSHConfig
  isWatching: boolean
  onToggleWatcher: (id: string, isActive: boolean) => void
}

export function SyncPairsManager({
  config,
  isWatching,
  onToggleWatcher,
}: SyncPairsManagerProps) {
  const [syncPairs, setSyncPairs] = useState<types.SyncPair[]>([])
  const [showAddForm, setShowAddForm] = useState<boolean>(false)
  const [newPair, setNewPair] = useState({ localPath: '', remotePath: '' })

  // --- 新增状态，用于追踪正在编辑的条目 ---
  const [editingPairId, setEditingPairId] = useState<string | null>(null)
  const [editingPairData, setEditingPairData] = useState<{
    localPath: string
    remotePath: string
  }>({ localPath: '', remotePath: '' })

  const { showDialog } = useDialog()

  const fetchSyncPairs = useCallback(async () => {
    if (!config.id) return
    try {
      const pairs = await GetSyncPairs(config.id)
      setSyncPairs(pairs)
    } catch (error) {
      await showDialog({
        title: 'Error',
        message: `Failed to fetch sync pairs: ${String(error)}`,
        type: 'error',
      })
    } finally {
      console.log(`successed to fetch sync pairs for ${config.id}`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.id])

  // 这个 effect 会在组件首次挂载时，以及 props.config.id 发生变化时
  // (即用户在左侧切换了配置) 自动重新获取同步对列表。
  useEffect(() => {
    void fetchSyncPairs()
  }, [fetchSyncPairs])

  const handleBrowseLocal = async (isEditing: boolean) => {
    const dirPath = await SelectDirectory('Select Local Directory')
    if (dirPath) {
      if (isEditing) {
        setEditingPairData((prev) => ({ ...prev, localPath: dirPath }))
      } else {
        setNewPair((prev) => ({ ...prev, localPath: dirPath }))
      }
    }
  }

  const handleStartEdit = (pair: types.SyncPair) => {
    setEditingPairId(pair.id)
    setEditingPairData({
      localPath: pair.localPath,
      remotePath: pair.remotePath,
    })
    setShowAddForm(false) // 关闭“新增”表单，避免界面混乱
  }

  const handleSaveNewPair = async () => {
    if (!newPair.localPath || !newPair.remotePath) {
      return await showDialog({
        title: 'Error',
        message: 'Local and Remote paths cannot be empty.',
        type: 'error',
      })
    }
    try {
      await SaveSyncPair({
        id: '',
        configId: config.id,
        localPath: newPair.localPath,
        remotePath: newPair.remotePath,
        syncDeletes: true, //默认开启删除同步
      })
      await fetchSyncPairs()
      setNewPair({ localPath: '', remotePath: '' })
      setShowAddForm(false)
    } catch (error) {
      await showDialog({
        title: 'Error',
        message: `Failed to save sync pair: ${String(error)}`,
        type: 'error',
      })
    }
  }

  const handleUpdatePair = async () => {
    if (!editingPairId) return

    if (!editingPairData.localPath || !editingPairData.remotePath) {
      return await showDialog({
        title: 'Error',
        message: 'Local and Remote paths cannot be empty.',
        type: 'error',
      })
    }

    try {
      await SaveSyncPair({
        id: editingPairId, // 传入现有 ID 以进行更新
        configId: config.id,
        localPath: editingPairData.localPath,
        remotePath: editingPairData.remotePath,
        syncDeletes: true, // 暂时硬编码
      })
      await fetchSyncPairs()
      setEditingPairId(null) // 退出编辑模式
    } catch (error) {
      await showDialog({
        title: 'Error',
        message: `Failed to update sync pair: ${String(error)}`,
        type: 'error',
      })
    }
  }

  const handleDeletePair = async (pairId: string) => {
    const choice = await showDialog({
      title: 'Confirm Deletion',
      message: 'Are you sure?',
      type: 'confirm',
      buttons: [
        { text: 'Cancel', variant: 'outline', value: 'cancel' },
        { text: 'Yes, Delete', variant: 'destructive', value: 'yes' },
      ],
    })

    if (choice.buttonValue !== 'yes') return
    try {
      await DeleteSyncPair(pairId)
      await fetchSyncPairs() // 删除后刷新列表
    } catch (error) {
      await showDialog({
        title: 'Error',
        message: `Failed to delete sync pair: ${String(error)}`,
        type: 'error',
      })
    }
  }

  return (
    <Card className="border-border">
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="space-y-1.5">
          <CardTitle>Sync Directories</CardTitle>
        </div>

        {/* 操作按钮组 */}
        <div className="flex items-center space-x-4">
          {/* 同步开关 */}
          <div className="flex items-center space-x-2">
            <Label
              htmlFor="sync-switch"
              className={`text-sm font-medium ${isWatching ? 'text-green-600' : 'text-muted-foreground'}`}
            >
              {isWatching ? 'Active' : 'Paused'}
            </Label>
            <Switch
              id="sync-switch"
              checked={isWatching}
              // 显式定义参数类型或使用类型守卫，可以在编译阶段就确保类型安全。
              // 显式定义参数类型
              onCheckedChange={(checked: boolean) =>
                onToggleWatcher(config.id, checked)
              }
              // 使用类型守卫
              //   onCheckedChange={(checked: boolean) => {
              //     if (typeof checked === 'boolean') {
              //       onToggleWatcher(config.id, checked)
              //     }
              //   }}
              // 使用默认值（如果 checked 可能为 undefined）
              //   onCheckedChange={(checked) => {
              //     const isChecked = Boolean(checked) // 确保转换为布尔值
              //     onToggleWatcher(config.id, isChecked)
              //   }}
            />
          </div>
          <Button onClick={() => setShowAddForm(!showAddForm)} size="sm">
            + Add Pair
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {/* 添加新同步对的表单 (条件渲染) */}
        {showAddForm && (
          <div className="p-2 mb-4 bg-muted/50 rounded-lg space-y-4">
            <div>
              <Label className="text-xs">Local Path</Label>
              <div className="flex items-center">
                <Input
                  value={newPair.localPath}
                  readOnly
                  placeholder="Click Browse to select"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                />
                <Button
                  onClick={() => void handleBrowseLocal(false)}
                  variant="outline"
                  className="ml-2"
                >
                  Browse
                </Button>
              </div>
            </div>

            <div>
              <Label className="text-xs">Remote Path</Label>
              <Input
                value={newPair.remotePath}
                onChange={(e) =>
                  setNewPair((prev) => ({
                    ...prev,
                    remotePath: e.target.value,
                  }))
                }
                placeholder="/var/www/my-project"
              />
            </div>
            <div className="flex justify-end space-x-2">
              <Button
                onClick={() => setShowAddForm(false)}
                variant="ghost"
                size="sm"
              >
                Cancel
              </Button>
              <Button onClick={() => void handleSaveNewPair()} size="sm">
                Save Pair
              </Button>
            </div>
          </div>
        )}

        {/* 已有同步对的列表 */}
        <div className="space-y-2">
          {syncPairs.length === 0 ? (
            <div className="text-center text-muted-foreground py-4">
              No sync pairs configured.
            </div>
          ) : (
            syncPairs.map((pair) => (
              <div
                key={pair.id}
                className="p-3 bg-muted rounded-md transition-all"
              >
                {editingPairId === pair.id ? (
                  // --- 编辑模式 ---
                  <div className="space-y-4">
                    <div>
                      <Label className="text-xs">Local Path</Label>
                      <div className="flex items-center">
                        <Input value={editingPairData.localPath} readOnly />
                        <Button
                          onClick={() => void handleBrowseLocal(true)}
                          variant="outline"
                          className="ml-2"
                        >
                          Browse
                        </Button>
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Remote Path</Label>
                      <Input
                        value={editingPairData.remotePath}
                        onChange={(e) =>
                          setEditingPairData((prev) => ({
                            ...prev,
                            remotePath: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="flex justify-end space-x-2">
                      <Button
                        onClick={() => setEditingPairId(null)}
                        variant="ghost"
                        size="sm"
                      >
                        Cancel
                      </Button>
                      <Button onClick={() => void handleUpdatePair()} size="sm">
                        Save
                      </Button>
                    </div>
                  </div>
                ) : (
                  // --- 显示模式 ---
                  <div className="flex items-center justify-between">
                    <div className="font-mono text-sm">
                      <p className="text-sky-600 dark:text-sky-400">
                        {pair.localPath}
                      </p>
                      <p className="text-muted-foreground">
                        ➔ {pair.remotePath}
                      </p>
                    </div>
                    <div className="flex items-center">
                      <Button
                        onClick={() => handleStartEdit(pair)}
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        onClick={() => void handleDeletePair(pair.id)}
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}
