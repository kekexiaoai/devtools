import { ConfigList } from '../components/filesyncer/ConfigList'

import type { types } from '../../wailsjs/go/models'
import {
  DeleteConfig,
  GetConfigs,
  SaveConfig,
  TestConnection,
  ShowConfirmDialog,
  ShowErrorDialog,
  ShowInfoDialog,
  // SelectFile,
} from '../../wailsjs/go/main/App'
import { useCallback, useEffect, useState, useMemo, useRef } from 'react'
import React from 'react'
import { EventsOn, EventsOff } from '../../wailsjs/runtime/runtime'

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
// import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Button } from '@/components/ui/button'

export function FileSyncerView() {
  const [configs, setConfigs] = useState<types.SSHConfig[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selectedIdRef = useRef(selectedId)

  // 模态框相关
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingConfigId, setEditingConfigId] = useState<string | null>(null)
  const [form, setForm] = useState<types.SSHConfig>({} as types.SSHConfig)
  const [testResult, setTestResult] = useState({ status: '', message: '' })

  // 更新 selectedIdRef 每次 selectedId 变化
  useEffect(() => {
    selectedIdRef.current = selectedId
  }, [selectedId])

  // 使用 useCallback 缓存函数， 防止不必要的重渲染
  // --- 数据获取 ---
  const fetchConfigs = useCallback(async () => {
    try {
      const fetchedConfigs = await GetConfigs()
      setConfigs(fetchedConfigs)
      return fetchedConfigs
    } catch (error) {
      await ShowErrorDialog(
        'Error',
        `Failed to load configurations: ${String(error)}`
      )
      return []
    }
  }, []) // 无依赖，保持函数引用稳定

  useEffect(() => {
    void fetchConfigs().then((fetchedConfigs) => {
      if (
        fetchedConfigs.length > 0 &&
        (!selectedId || !fetchedConfigs.find((c) => c.id === selectedId))
      ) {
        setSelectedId(fetchedConfigs[0].id) // 默认选中第一个配置
      } else if (fetchedConfigs.length === 0) {
        setSelectedId(null) // 如果没有配置，清空选中状态
      }
    })
  }, [fetchConfigs, selectedId])

  // const debounce = (func, wait) => {
  //   let timeout
  //   return (...args) => {
  //     clearTimeout(timeout)
  //     timeout = setTimeout(() => func(...args), wait)
  //   }
  // }

  // 定义防抖函数的类型
  type DebouncedFunction<T extends (...args: unknown[]) => unknown> = {
    (...args: Parameters<T>): void
    cancel: () => void
  }

  // 手动实现的防抖函数
  const debounce = useCallback(
    <T extends (...args: unknown[]) => unknown>(
      func: T,
      wait: number
    ): DebouncedFunction<T> => {
      let timeout: NodeJS.Timeout | undefined

      const debounced = (...args: Parameters<T>): void => {
        clearTimeout(timeout)
        timeout = setTimeout(() => func(...args), wait)
      }

      debounced.cancel = () => {
        clearTimeout(timeout)
        timeout = undefined
      }

      return debounced
    },
    []
  )

  // --- 事件处理 ---
  useEffect(() => {
    const handleConfigUpdate = debounce(() => {
      console.log('Configuration updated, refetching...')
      void fetchConfigs().then((fetchedConfigs) => {
        const currentSelectedId = selectedIdRef.current
        if (
          fetchedConfigs.length > 0 &&
          (!currentSelectedId ||
            !fetchedConfigs.find((c) => c.id === currentSelectedId))
        ) {
          setSelectedId(fetchedConfigs[0].id) // 默认选中第一个配置
        } else if (fetchedConfigs.length === 0) {
          setSelectedId(null) // 如果没有配置，清空选中状态
        }
      })
    }, 500)

    EventsOn('config_updated', handleConfigUpdate)
    return () => {
      EventsOff('config_updated')
    }
  }, [fetchConfigs, debounce]) // 依赖 fetchConfigs

  const handleSelect = (id: string) => {
    setSelectedId(id)
  }

  const handleDelete = async (id: string) => {
    console.log(`TODO: Delete configuration with ID: ${id}`)
    const choice = await ShowConfirmDialog(
      'Confirm Deletion',
      'Are you sure? This will delete the configuration and all associated sysnc pairs.'
    )
    if (choice !== 'Yes') return
    console.log(`Deleting configuration with ID: ${id}`)
    try {
      await DeleteConfig(id)
      await fetchConfigs()
    } catch (error) {
      await ShowErrorDialog(
        'Error',
        `Failed to delete configuration: ${String(error)}`
      )
    }
  }

  const handleOpenNewModal = () => {
    setForm({} as types.SSHConfig) // 重置表单
    setTestResult({ status: '', message: '' })
    setEditingConfigId(null)
    setIsModalOpen(true)
  }

  const handleOpenEditModal = (id: string) => {
    const configToEdit = configs.find((c) => c.id === id)
    if (configToEdit) {
      setForm({ ...configToEdit })
      setTestResult({ status: '', message: '' })
      setEditingConfigId(id)
      setIsModalOpen(true)
    }
  }

  const handleSaveConfig = async () => {
    try {
      await SaveConfig(form)
      await ShowInfoDialog('Success', 'Configuration saved!')
      setIsModalOpen(false)
      await fetchConfigs() // 保存成功后刷新列表
    } catch (error) {
      await ShowErrorDialog(
        'Error',
        `Failed to save configuration: ${String(error)}`
      )
    }
  }

  const handleTestConnection = async () => {
    setTestResult({ status: 'testing', message: 'Connecting...' })
    try {
      const result = await TestConnection(form)
      setTestResult({ status: 'success', message: result })
    } catch (error) {
      setTestResult({ status: 'error', message: String(error) })
    }
  }

  // const handleSelectKeyFile = async () => {
  //   const filePath = await SelectFile('Select SSH Private Key')
  //   if (filePath) {
  //     setForm((prevForm) => ({ ...prevForm, keyPath: filePath }))
  //   }
  // }

  const SelectedConfig = useMemo(() => {
    if (!selectedId) return null
    return configs.find((c) => c.id === selectedId) || null
  }, [selectedId, configs]) // 当selectedId 或者 configs变化时，重新计算

  return (
    <div className="flex h-full">
      {/* 左侧 */}
      <div className="w-1/3 max-w-xs flex-shrink-0 border-r">
        <ConfigList
          configs={configs}
          selectedId={selectedId}
          onSelect={handleSelect}
          onNew={handleOpenNewModal}
          onEdit={handleOpenEditModal}
          onDelete={(id) => {
            void handleDelete(id)
          }}
        />
      </div>
      {/* 右侧 */}
      <div className="flex-1 p-6 overflow-y-auto">
        {SelectedConfig ? (
          <div>
            <h2>Details for: {SelectedConfig.name}</h2>
            <p>Next step: Refactor ConfigDetail component here.</p>
            <pre className="mt-4 p-2 bg-muted rounded-md text-xs">
              {JSON.stringify(SelectedConfig, null, 2)}
            </pre>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <p>Select or create a configuration.</p>
          </div>
        )}
      </div>

      {/* 新建，编辑配置的模态框 */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[625px]">
          <DialogHeader>
            <DialogTitle>
              {editingConfigId ? 'Edit Configuration' : 'New Configuration'}
            </DialogTitle>
            <DialogDescription>
              Provide SSH connection details.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">
                Name
              </Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setForm({ ...form, name: e.target.value })
                }
                className="col-span-3"
              ></Input>
            </div>
          </div>
          <DialogFooter>
            <p
              className={`text-sm mr-auto ${testResult.status === 'success' ? 'text-green-600' : 'text-red-600'}`}
            >
              {testResult.message}
            </p>

            <Button
              type="button"
              variant={'outline'}
              onClick={() => void handleTestConnection()}
            >
              {' '}
              Test
            </Button>
            <Button type="button" onClick={() => void handleSaveConfig()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
