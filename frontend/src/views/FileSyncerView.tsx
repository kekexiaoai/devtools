import { ConfigList } from '../components/filesyncer/ConfigList'

import type { types } from '../../wailsjs/go/models'
import {
  DeleteConfig,
  GetConfigs,
  ShowConfirmDialog,
  ShowErrorDialog,
} from '../../wailsjs/go/main/App'
import { useCallback, useEffect, useState, useMemo, useRef } from 'react'
import React from 'react'
import { EventsOn, EventsOff } from '../../wailsjs/runtime/runtime'

export function FileSyncerView() {
  const [configs, setConfigs] = useState<types.SSHConfig[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selectedIdRef = useRef(selectedId)

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

  const handleNew = () => {
    console.log("TODO: open 'New Configuration' modal")
  }
  const handleEdit = (id: string) => {
    console.log(`TODO: Open 'Edit Configuration' modal for ID: ${id}`)
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
          onNew={handleNew}
          onEdit={handleEdit}
          onDelete={(id) => {
            void handleDelete(id)
          }}
        />
      </div>
      {/* 右侧 */}
      <div>
        {SelectedConfig ? (
          <div>Details for: {SelectedConfig.name}</div>
        ) : (
          <div className="p-4 text-muted-foreground flex items-center justify-center h-full">
            <p className="text-center">
              Please select or create a configuration to get started.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
