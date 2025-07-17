import { ConfigList } from '../components/filesyncer/ConfigList'
import { ConfigDetail } from '../components/filesyncer/ConfigDetail'

import type { types } from '../../wailsjs/go/models'
import {
  DeleteConfig,
  GetConfigs,
  SaveConfig,
  TestConnection,
  ShowConfirmDialog,
  ShowErrorDialog,
  ShowInfoDialog,
  SelectFile,
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
import { RadioGroup } from '@radix-ui/react-radio-group'
import { RadioGroupItem } from '@/components/ui/radio-group'

export function FileSyncerView() {
  const [configs, setConfigs] = useState<types.SSHConfig[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selectedIdRef = useRef(selectedId)

  // 模态框相关
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingConfigId, setEditingConfigId] = useState<string | null>(null)
  const initialFormState: types.SSHConfig = {
    id: '',
    name: '',
    host: '',
    port: 22,
    user: 'root',
    authMethod: 'password',
    password: '',
    keyPath: '',
    clipboardFilePath: '',
  }
  const [form, setForm] = useState<types.SSHConfig>(initialFormState)
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
    setForm(initialFormState) // 重置表单
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

  const handleSelectKeyFile = async () => {
    const filePath = await SelectFile('Select SSH Private Key')
    if (filePath) {
      setForm((prevForm) => ({ ...prevForm, keyPath: filePath }))
    }
  }

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
          <ConfigDetail
            key={SelectedConfig.id}
            config={SelectedConfig}
            onConfigUpdate={() => void fetchConfigs()}
            isWatching={false}
            onToggleWatcher={function (id: string, isActive: boolean): void {
              console.log(id, isActive)
              throw new Error('Function not implemented.')
            }}
          />
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
          {/* --- 受控组件 (Controlled Components) ---
            在 React 中，表单元素的值由 React 的 state (我们的 form 对象) 完全控制。
            用户的每一次输入都会触发 onChange 事件，我们在这个事件中调用 setForm
            来更新 state，然后 state 的更新再反过来导致输入框的 value 改变。
            这个过程被称为“单向数据流”。
          */}
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
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="host" className="text-right">
                Host & Port
              </Label>
              <div className="col-span-3 grid grid-cols-3 gap-2">
                <Input
                  id="host"
                  value={form.host}
                  onChange={(e) => setForm({ ...form, host: e.target.value })}
                  className="col-span-2"
                  placeholder="192.168.1.1"
                />
                <Input
                  type="number"
                  value={form.port}
                  onChange={(e) =>
                    setForm({ ...form, port: Number(e.target.value) })
                  }
                  placeholder="22"
                />
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="user" className="text-right">
                User
              </Label>
              <Input
                id="user"
                value={form.user}
                onChange={(e) => setForm({ ...form, user: e.target.value })}
                className="col-span-3"
                placeholder="root"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Auth Method</Label>
              <RadioGroup
                value={form.authMethod}
                onValueChange={(value) =>
                  setForm({ ...form, authMethod: value })
                }
                className="col-span-3 flex items-center space-x-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="password" id="r-password" />
                  <Label htmlFor="r-password">Password</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="key" id="r-key" />
                  <Label htmlFor="r-key1">Key File</Label>
                </div>
              </RadioGroup>
            </div>
            {form.authMethod === 'password' && (
              <div className="grid grid-cols-4 text-center">
                <Label htmlFor="password" className="text-right">
                  Password
                </Label>
                <Input
                  id="password"
                  value={form.password}
                  onChange={(e) =>
                    setForm({ ...form, password: e.target.value })
                  }
                  type="password"
                  className="col-span-3"
                />
              </div>
            )}
            {form.authMethod === 'key' && (
              <div className="grid grid-cols-4 text-center">
                <Label htmlFor="key" className="text-right">
                  Key Path
                </Label>
                <div className="col-span-3 flex text-center">
                  <Input
                    id="key"
                    value={form.keyPath}
                    readOnly
                    placeholder="Click Broser..."
                    onChange={(e) =>
                      setForm({ ...form, keyPath: e.target.value })
                    }
                    className="col-span-3"
                  />
                  <Button
                    onClick={() => void handleSelectKeyFile()}
                    type="button"
                    variant="outline"
                    className="ml-2"
                  >
                    Browse
                  </Button>
                </div>
              </div>
            )}
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
