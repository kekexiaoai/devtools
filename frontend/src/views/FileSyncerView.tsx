// eslint-disable-next-line @typescript-eslint/no-unused-vars
import React, { useCallback, useEffect, useState, useMemo, useRef } from 'react'
import { useDialog } from '../hooks/useDialog'

import { ConfigList } from '../components/filesyncer/ConfigList'
import { ConfigDetail } from '../components/filesyncer/ConfigDetail'
import { LogPanel } from '@/components/logPanel'

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
  StartWatching,
  StopWatching,
} from '../../wailsjs/go/main/App'

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
import { Button } from '@/components/ui/button'
import { RadioGroup } from '@radix-ui/react-radio-group'
import { RadioGroupItem } from '@/components/ui/radio-group'

export function FileSyncerView() {
  const [configs, setConfigs] = useState<types.SSHConfig[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)

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
  const [activeWatchers, setActiveWatchers] = useState<Record<string, boolean>>(
    {}
  )

  // 解构赋值获取所需属性
  const { showDialog } = useDialog()
  // 下面的内容是用于测试 provider 提供多个属性时的使用方法
  // 解构赋值获取所需属性
  // const { showDialog, closeDialog } = useDialog()

  // const handleClick = () => {
  //   showDialog({
  //     title: '提示',
  //     message: '这是一个对话框消息',
  //   })
  // }

  // const handleClose = () => {
  //   closeDialog()
  // }

  // async function handleSomeAction() {
  //   showDialog({ title: 'Processing...', message: 'Please wait.' })
  //   await someLongRunningTask() // 等待一个长时间的任务
  //   closeDialog() // 任务完成后，程序自动关闭对话框！
  // }

  const toggleWatcher = async (configId: string, isActive: boolean) => {
    try {
      if (isActive) {
        await StartWatching(configId)
        // 更新对象 state 的正确方式
        // 我们传入一个函数，它接收前一个状态 (prevWatchers)
        // 然后返回一个全新的对象，这个对象是旧对象的拷贝，并更新了对应的键值
        // 为什么用 [configId]: true？
        // 在 JavaScript 和 TypeScript 中，对象字面量（如 { key: value }）的键可以是静态的（直接写死的字符串）或动态的（通过表达式计算）。[configId]: true 使用中括号表示动态键
        // 在对象字面量中，[expression]: value 允许使用表达式的结果作为对象的键。
        // configId 是一个变量（类型为 string），其值在运行时确定（例如 "config1"、"config2"）。
        // [configId]: true 表示将 configId 的值（例如 "config1"）作为键，true 作为值，生成类似 { "config1": true } 的对象。
        setActiveWatchers((prevWatchers) => ({
          ...prevWatchers,
          [configId]: true,
        }))
      } else {
        await StopWatching(configId)
        // 从对象 state 中移除一个键的正确方式
        setActiveWatchers((prevWatchers) => {
          const newWatchers = { ...prevWatchers } // 创建一个新对象
          delete newWatchers[configId] // 从新对象中删除键
          return newWatchers // 返回新对象
        })
      }
    } catch (error) {
      await ShowErrorDialog(
        'Error',
        `Failed to ${isActive ? 'start' : 'stop'} watching: ${String(error)}`
      )
    }
  }

  // const selectedIdRef = useRef(selectedId)
  // // 更新 selectedIdRef 每次 selectedId 变化
  // useEffect(() => {
  //   selectedIdRef.current = selectedId
  // }, [selectedId])

  // 使用 useCallback 缓存函数， 防止不必要的重渲染
  // --- 数据获取 ---
  const fetchConfigs = useCallback(async () => {
    try {
      const fetchedConfigs = await GetConfigs()
      // showDialog({ title: 'configs', message: JSON.stringify(fetchedConfigs) })
      console.log('fetched configs, fetchConfigs:', fetchConfigs)
      console.log('fetched configs, fetchedConfigs:', fetchedConfigs)
      setConfigs(fetchedConfigs)
      return fetchedConfigs
    } catch (error) {
      showDialog({
        title: 'Error',
        message: `Failed to load configurations: ${String(error)}`,
      })
      return []
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // 无依赖, 保持函数引用稳定, 它的引用永远不会改变

  // --方案2-----------------------------------------------------------------------------------
  // 只在组件首次挂载时获取初始数据
  useEffect(() => {
    // fetchConfigs: 这是一个 async 函数。您可以把它看作一本**“异步菜谱”**，它描述了如何“去服务器取回配置数据”这道菜。
    // fetchConfigs(): 当您调用这个函数时，您并不是立刻就拿到了“菜肴”（即 fetchedConfigs 数据）。
    //      您只是把“菜谱”交给了“厨房”（JavaScript 运行环境），并说：“请开始做这道菜”。厨房给了您一张“取餐小票”，这个小票就是 Promise。它承诺“我将来会把菜给你”。
    // void fetchConfigs(): void 是一个一元操作符，它的唯一作用就是执行它后面的表达式（即开始做菜），然后立即返回 undefined。
    //      它就像是您把菜谱交给厨房后，直接把取餐小票撕掉了。

    // void fetchConfigs()

    // fetchConfigs() 返回一个 Promise
    fetchConfigs()
      .then((fetchedConfigs) => {
        // 当 Promise 成功完成时，.then() 里的回调函数会被执行
        // 这里的 fetchedConfigs 才是我们真正从后端拿到的数据！
        console.log('configs from .then()', fetchedConfigs)

        // 我们可以在这里继续执行依赖这些数据的逻辑
        if (fetchedConfigs && fetchedConfigs.length > 0) {
          // ...
        }
      })
      .catch((error) => {
        console.error('fetchConfigs promise was rejected:', error)
      })

    // --IIFE-----------------------------------------------------------------------------------------------
    // 下面是除了 .then() 的另一种写法。
    // .then() 是处理 Promise 的经典方式，但现代 React 开发中，有一种更流行、代码可读性更高的替代方案：使用 async/await 语法的立即调用函数表达式 (IIFE)。

    // 教学：什么是 IIFE (Immediately Invoked Function Expression)？
    // 它就是一个定义完之后立即执行的匿名函数。

    // 为什么需要它？
    // useEffect 的主回调函数本身不能是 async 的，因为它可能会返回一个 Promise，而 useEffect 只期望它返回一个“清理函数”。为了在 useEffect 内部使用 async/await 这种更优雅的语法，我们就创建了一个 async 的 IIFE。

    //
    // // 1. 定义一个 async 箭头函数
    // const fetchData = async () => {
    //   try {
    //     // 2. 在这个函数内部，我们就可以自由地使用 await
    //     const fetchedConfigs = await fetchConfigs()
    //     console.log('configs from async/await', fetchedConfigs)

    //     if (fetchedConfigs && fetchedConfigs.length > 0) {
    //       // ...
    //     }
    //   } catch (error) {
    //     console.error('fetchConfigs failed:', error)
    //   }
    // }

    // // 3. 立即调用这个函数
    // void fetchData()
    // --IIFE-----------------------------------------------------------------------------------------------
  }, [fetchConfigs]) // 因为 fetchConfigs 不会变，所以这个 effect 只运行一次

  // 只在 configs 数组本身发生变化时运行，用于设置默认选中项
  useEffect(() => {
    // 如果 configs 成功加载且不为空
    if (configs.length > 0) {
      // 检查当前选中的ID是否还存在于新的列表中
      const currentSelectionExists = configs.some((c) => c.id === selectedId)
      if (!currentSelectionExists) {
        setSelectedId(configs[0].id)
      }
    } else {
      setSelectedId(null)
    }
    // --- 禁用 ESLint 规则 ---
    // 这里明确地告诉 ESLint，有意不将 selectedId 作为依赖项。
    // 因为这个 effect 的意图是“当配置列表变化时设置默认选项”，
    // 而不是“当选项变化时做某事”。
    // 这样做可以避免在每次用户点击切换选项时都重新运行这个 effect。
    // 这是一个安全的操作，因为我们只关心在 configs 变化的那一刻 selectedId 的状态。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configs]) // 故意只依赖 configs, 这个 effect 只在 configs 数组的内容更新后才运行
  // --方案2-----------------------------------------------------------------------------------

  // --方案1-----------------------------------------------------------------------------------
  // useEffect(() => {
  //   void fetchConfigs().then((fetchedConfigs) => {
  //     if (
  //       fetchedConfigs.length > 0 &&
  //       (!selectedId || !fetchedConfigs.find((c) => c.id === selectedId))
  //     ) {
  //       setSelectedId(fetchedConfigs[0].id) // 默认选中第一个配置
  //     } else if (fetchedConfigs.length === 0) {
  //       setSelectedId(null) // 如果没有配置，清空选中状态
  //     }
  //   })
  // // eslint-disable-next-line react-hooks/exhaustive-deps
  // }, [fetchConfigs])

  // // const debounce = (func, wait) => {
  // //   let timeout
  // //   return (...args) => {
  // //     clearTimeout(timeout)
  // //     timeout = setTimeout(() => func(...args), wait)
  // //   }
  // // }

  // // 定义防抖函数的类型
  // type DebouncedFunction<T extends (...args: unknown[]) => unknown> = {
  //   (...args: Parameters<T>): void
  //   cancel: () => void
  // }

  // // 手动实现的防抖函数
  // const debounce = useCallback(
  //   <T extends (...args: unknown[]) => unknown>(
  //     func: T,
  //     wait: number
  //   ): DebouncedFunction<T> => {
  //     let timeout: NodeJS.Timeout | undefined

  //     const debounced = (...args: Parameters<T>): void => {
  //       clearTimeout(timeout)
  //       timeout = setTimeout(() => func(...args), wait)
  //     }

  //     debounced.cancel = () => {
  //       clearTimeout(timeout)
  //       timeout = undefined
  //     }

  //     return debounced
  //   },
  //   []
  // )

  // // --- 事件处理 ---
  // useEffect(() => {
  //   const handleConfigUpdate = debounce(() => {
  //     console.log('Configuration updated, refetching...')
  //     void fetchConfigs().then((fetchedConfigs) => {
  //       const currentSelectedId = selectedIdRef.current
  //       if (
  //         fetchedConfigs.length > 0 &&
  //         (!currentSelectedId ||
  //           !fetchedConfigs.find((c) => c.id === currentSelectedId))
  //       ) {
  //         setSelectedId(fetchedConfigs[0].id) // 默认选中第一个配置
  //       } else if (fetchedConfigs.length === 0) {
  //         setSelectedId(null) // 如果没有配置，清空选中状态
  //       }
  //     })
  //   }, 500)

  //   EventsOn('config_updated', handleConfigUpdate)
  //   return () => {
  //     EventsOff('config_updated')
  //   }
  // }, [fetchConfigs, debounce]) // 依赖 fetchConfigs
  // --方案1-----------------------------------------------------------------------------------

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
    // --- 校验逻辑 ---
    if (!form.name || !form.name.trim()) {
      showDialog({
        title: 'Validation Error',
        message: 'Configuration Name cannot be empty.',
      })
      return
    }
    if (!form.host || !form.host.trim()) {
      showDialog({
        title: 'Validation Error',
        message: 'Host cannot be empty.',
      })
      return
    }
    if (!form.user || !form.user.trim()) {
      showDialog({
        title: 'Validation Error',
        message: 'User cannot be empty.',
      })
      return
    }

    try {
      await SaveConfig(form)
      await ShowInfoDialog('Success', 'Configuration saved!')
      setIsModalOpen(false)
      await fetchConfigs() // 保存成功后刷新列表
    } catch (error) {
      // await ShowErrorDialog(
      //   'Error',
      //   `Failed to save configuration: ${String(error)}`
      // )
      // 依然可以使用 AlertDialog 显示保存错误
      showDialog({
        title: 'Save Error',
        message: `Failed to save configuration: ${String(error)}`,
      })
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

  const selectedConfig = useMemo(() => {
    if (!selectedId) return null
    return configs.find((c) => c.id === selectedId) || null
  }, [selectedId, configs]) // 当selectedId 或者 configs变化时，重新计算

  // --- 日志相关 ---
  const [logs, setLogs] = useState<types.LogEntry[]>([])
  const [isLogPanelOpen, setIsLogPanelOpen] = useState(false) // 初始关闭
  // useEffect 来监听日志事件
  const addLogEntry = useCallback((logEntry: types.LogEntry) => {
    // 使用函数式更新，确保我们总是基于最新的状态进行修改
    setLogs((prevLogs) => {
      const newLogs = [...prevLogs, logEntry]
      // 保持日志数组的最大长度
      return newLogs.length > 200 ? newLogs.slice(1) : newLogs
    })
  }, [])

  useEffect(() => {
    // 组件挂载时，开始监听来自Go后端的日志事件
    const cleanup = EventsOn('log_event', addLogEntry)

    // 组件卸载时，返回一个清理函数来注销监听，防止内存泄漏
    return cleanup
  }, [addLogEntry])

  const clearLogs = () => setLogs([])
  const toggleLogPanel = () => setIsLogPanelOpen((prev) => !prev)

  const latestLogStatus = useMemo(() => {
    if (logs.length === 0) {
      return { level: 'INFO', message: 'Ready' } as types.LogEntry
    }
    return logs[logs.length - 1]
  }, [logs])

  const statusColorClass = useMemo(() => {
    switch (latestLogStatus.level) {
      case 'DEBUG':
        return 'text-blue-500 dark:text-blue-400'
      case 'INFO':
        return 'text-green-500 dark:text-green-400'
      case 'WARN':
        return 'text-yellow-500 dark:text-yellow-400'
      case 'ERROR':
        return 'text-red-600 dark:text-red-400 font-bold'
      case 'SUCCESS':
        return 'text-green-600 dark:text-green-400 font-bold'
      default:
        return 'text-gray-600 dark:text-gray-400'
    }
  }, [latestLogStatus])

  return (
    // relative & h-full
    // 我们给这个根 div 添加 `relative`，是为了让内部的日志面板可以使用 `absolute` 进行定位。
    // `h-full` 确保这个视图能撑满父容器（<main>）的全部高度。
    <div className="flex h-full relative">
      {/* 左侧 */}
      {/* 移除了 border-r (右边框)，添加了 bg-muted/50，让这个区域有一个非常浅的、半透明的背景色 
      这会使它与右侧的 p-6 主内容区在视觉上自然分离开来 */}
      <div className="w-1/3 max-w-xs flex-shrink-0 bg-muted/50">
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
        {selectedConfig ? (
          <ConfigDetail
            key={selectedConfig.id}
            config={selectedConfig}
            onConfigUpdate={() => void fetchConfigs()}
            isWatching={activeWatchers[selectedConfig.id] || false}
            onToggleWatcher={function (id: string, isActive: boolean): void {
              console.log(id, isActive)
              void toggleWatcher(id, isActive)
            }}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <p>Select or create a configuration.</p>
          </div>
        )}
      </div>
      {/* 日志面板和状态 */}
      {/* absolute & bottom-0
        - `absolute`: 让这个容器脱离正常的文档流，浮动起来。
        - `bottom-0`: 将它“钉”在父容器（带有 `relative` 的那个）的底部。
        - `w-full`: 让它宽度占满父容器。
        这样，日志面板就不会挤占主内容区的空间，而是优雅地从底部滑出。
      */}
      <div className=" absolute bottom-0 left-0 w-full flex flex-col">
        {isLogPanelOpen && (
          // flex-shrink-0: 防止这个 div 在空间不足时被压缩
          <div className="h-48 flex-shrink-0">
            <LogPanel logs={logs} onClear={clearLogs} />
          </div>
        )}

        {/* 状态栏 */}
        <div className="h-6 flex-shrink-0 bg-background border-t flex items-center justify-between px-2 text-xs select-none">
          <button
            onClick={toggleLogPanel}
            className="flex items-center space-x-1 text-muted-foreground hover:text-foreground"
          >
            <span>{isLogPanelOpen ? '▼' : '▲'}</span>
            <span>logs</span>
          </button>

          <div
            className={`flex-1 pl-2 text-right truncate ${statusColorClass}`}
            title={latestLogStatus.message}
          >
            <span>{latestLogStatus.message}</span>
          </div>
        </div>
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
              <Label htmlFor="name" className="justify-self-end">
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
              <Label htmlFor="host" className="justify-self-end">
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
              <Label htmlFor="user" className="justify-self-end">
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
              <Label className="justify-self-end">Auth Method</Label>
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
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="password" className="justify-self-end">
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
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="key" className="justify-self-end">
                  Key Path
                </Label>
                <div className="col-span-3 flex items-center">
                  <Input
                    id="key"
                    value={form.keyPath}
                    readOnly
                    placeholder="Click Browse..."
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
            {/* <Button onClick={handleClick} type="button" variant="secondary">
              open
            </Button>

            <Button onClick={handleClose} type="button" variant="ghost">
              close
            </Button> */}

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
