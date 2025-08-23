import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { PlusCircle, Loader2 } from 'lucide-react'
import {
  GetSavedTunnels,
  DeleteTunnelConfig,
  DuplicateTunnelConfig,
  DeletePassword,
  StopForward,
  StartTunnelFromConfig,
} from '@wailsjs/go/sshgate/Service'
import { EventsOn } from '@wailsjs/runtime'
import { sshtunnel, types } from '@wailsjs/go/models'
import { useDialog } from '@/hooks/useDialog'
import { SavedTunnelItem } from './SavedTunnelItem'
import { useSshConnection } from '@/hooks/useSshConnection'
import { toast } from 'sonner'
import { CreateTunnelDialog } from './CreateTunnelDialog'
import { appLogger } from '@/lib/logger'

interface SavedTunnelsViewProps {
  hosts: types.SSHHost[]
  activeTunnels: sshtunnel.ActiveTunnelInfo[]
}

export function SavedTunnelsView({
  hosts,
  activeTunnels,
}: SavedTunnelsViewProps) {
  const [savedTunnels, setSavedTunnels] = useState<
    sshtunnel.SavedTunnelConfig[]
  >([])
  const [isLoading, setIsLoading] = useState(true)
  const [startingTunnelId, setStartingTunnelId] = useState<string | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingTunnel, setEditingTunnel] = useState<
    sshtunnel.SavedTunnelConfig | undefined
  >(undefined)

  const [shouldStartNext, setShouldStartNext] = useState(false)
  const prevTunnelsRef = useRef<sshtunnel.SavedTunnelConfig[] | undefined>(
    undefined
  )

  const { showDialog } = useDialog()

  const { connect: verifyAndGetPassword } = useSshConnection({
    showDialog,
    onOpenTerminal: () => {}, // Not used in 'verify' mode
  })

  const logger = useMemo(() => {
    return appLogger.withPrefix('SavedTunnelsView')
  }, [])

  const fetchSavedTunnels = useCallback(async () => {
    try {
      const tunnels = await GetSavedTunnels()
      setSavedTunnels(tunnels)
    } catch (error) {
      await showDialog({
        type: 'error',
        title: 'Failed to load saved tunnels',
        message: String(error),
      })
    }
  }, [showDialog])

  useEffect(() => {
    setIsLoading(true)
    fetchSavedTunnels()
      .catch((error) => logger.error('Failed to fetch tunnels:', error))
      .finally(() => setIsLoading(false))

    // Listen for changes from the backend to automatically refresh the list
    const cleanup = EventsOn('saved_tunnels_changed', () => {
      void fetchSavedTunnels()
    })

    return cleanup
  }, [fetchSavedTunnels, logger])

  useEffect(() => {
    // prevTunnelsRef.current 的类型是 sshtunnel.SavedTunnelConfig[] | undefined。
    // 尽管您在外层的 if 语句中已经检查了 prevTunnelsRef.current 是否存在，
    // 但 TypeScript 的控制流分析（即类型收窄）有时无法将这个信息传递到嵌套的箭头函数（find 的回调函数）内部。
    // 因此，在回调函数的作用域里，TypeScript 仍然认为 prevTunnelsRef.current 有可能是 undefined，从而导致了编译错误。
    // 解决方案
    // 解决这个问题的最佳实践是，在 if 检查之前，将 ref.current 的值赋给一个局部常量。
    // 这样，TypeScript 就可以在这个 useEffect 的作用域内正确地推断出该常量的类型。
    const prevTunnels = prevTunnelsRef.current
    if (
      shouldStartNext &&
      prevTunnels &&
      savedTunnels.length > prevTunnels.length
    ) {
      // Find the newly added tunnel by comparing IDs. Using a Set is efficient.
      const prevTunnelIds = new Set(prevTunnels.map((pt) => pt.id))
      const newTunnel = savedTunnels.find((t) => !prevTunnelIds.has(t.id))
      if (newTunnel) {
        handleStart(newTunnel.id)
      }
      setShouldStartNext(false)
    }
    prevTunnelsRef.current = savedTunnels
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedTunnels, shouldStartNext])

  const handleStart = (id: string) => {
    setStartingTunnelId(id)
    const tunnel = savedTunnels.find((t) => t.id === id)
    if (!tunnel) {
      toast.error('Could not find tunnel configuration.')
      setStartingTunnelId(null)
      return
    }

    const promise = (async (): Promise<string> => {
      // The `alias` parameter for the hook is used for display in dialogs.
      const aliasForDisplay =
        tunnel.hostSource === 'ssh_config' ? tunnel.hostAlias! : tunnel.name

      // Use the hook to handle password/host key verification.
      // It returns the password if successful, or null if cancelled.
      const password = await verifyAndGetPassword({
        alias: aliasForDisplay,
        strategy: 'verify',
        tunnelConfigID: id,
      })

      if (password === null) {
        throw new Error('Tunnel creation cancelled.')
      }

      // Now, start the tunnel with the obtained password (which could be empty for key auth)
      await StartTunnelFromConfig(id, password)

      return `Tunnel "${tunnel.name}" started successfully.`
    })()

    toast.promise(promise, {
      loading: `Starting tunnel "${tunnel.name}"...`,
      success: (msg) => {
        // The 'tunnels:changed' event will refresh the active tunnels list automatically.
        return msg
      },
      error: (error: unknown) => {
        const err = error instanceof Error ? error : new Error(String(error))
        return err.message.includes('cancelled')
          ? 'Operation cancelled.'
          : `Failed to start tunnel: ${err.message}`
      },
      finally: () => setStartingTunnelId(null),
    })
  }

  const handleStop = (tunnelId: string) => {
    const activeTunnel = activeTunnels.find((t) => t.id === tunnelId)
    if (!activeTunnel) return

    const promise = StopForward(tunnelId)
    toast.promise(promise, {
      loading: `Stopping tunnel "${activeTunnel.alias}"...`,
      success: () => {
        return `Tunnel "${activeTunnel.alias}" stopped.`
      },
      error: (err) => `Failed to stop tunnel: ${String(err)}`,
    })
  }

  const handleDelete = async (id: string) => {
    const tunnel = savedTunnels.find((t) => t.id === id)
    if (!tunnel) return

    const choice = await showDialog({
      type: 'confirm',
      title: `Delete Tunnel "${tunnel.name}"?`,
      message:
        'Are you sure you want to permanently delete this tunnel configuration?',
      buttons: [
        { text: 'Cancel', variant: 'outline', value: 'cancel' },
        { text: 'Delete', variant: 'destructive', value: 'delete' },
      ],
    })

    if (choice.buttonValue !== 'delete') return

    try {
      await DeleteTunnelConfig(id)
      // Also attempt to delete any saved password for this tunnel.
      // We don't need to block or show an error if this fails, as the main
      // action (deleting the config) was successful.
      DeletePassword(id).catch((err) => {
        console.warn(`Could not delete password for tunnel ${id}:`, err)
      })

      toast.success(`Tunnel "${tunnel.name}" deleted.`)
      // The list will be refreshed automatically by the event listener.
    } catch (error) {
      toast.error(`Failed to delete tunnel: ${String(error)}`)
    }
  }

  const handleDuplicate = (id: string) => {
    const tunnel = savedTunnels.find((t) => t.id === id)
    if (!tunnel) return

    const promise = DuplicateTunnelConfig(id)

    toast.promise(promise, {
      loading: `Duplicating tunnel "${tunnel.name}"...`,
      success: (newTunnel) => {
        // The list will be refreshed automatically by the event listener.
        return `Tunnel "${newTunnel.name}" created.`
      },
      error: (err) => `Failed to duplicate tunnel: ${String(err)}`,
    })
  }

  const handleEdit = (tunnel: sshtunnel.SavedTunnelConfig) => {
    setEditingTunnel(tunnel)
    setIsDialogOpen(true)
  }

  const handleCreate = () => {
    setEditingTunnel(undefined)
    setIsDialogOpen(true)
  }

  const getTunnelKey = (tunnel: sshtunnel.SavedTunnelConfig): string => {
    const bindAddr = tunnel.gatewayPorts ? '0.0.0.0' : '127.0.0.1'
    return `${bindAddr}:${tunnel.localPort}`
  }

  const activeTunnelMap = useMemo(() => {
    return new Map(activeTunnels.map((t) => [t.localAddr, t]))
  }, [activeTunnels])

  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">Saved Tunnel Configurations</h2>
        <Button onClick={handleCreate}>
          <PlusCircle className="mr-2 h-4 w-4" />
          Create Tunnel
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto pr-2">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : savedTunnels.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <p>No saved tunnels. Click "Create Tunnel" to add one.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {savedTunnels.map((tunnel) => {
              const activeTunnel = activeTunnelMap.get(getTunnelKey(tunnel))
              return (
                <SavedTunnelItem
                  key={tunnel.id}
                  tunnel={tunnel}
                  activeTunnel={activeTunnel}
                  onStart={handleStart}
                  onStop={handleStop}
                  onDelete={() => void handleDelete(tunnel.id)}
                  onEdit={handleEdit}
                  onDuplicate={() => void handleDuplicate(tunnel.id)}
                  isStarting={startingTunnelId === tunnel.id}
                />
              )
            })}
          </div>
        )}
      </div>
      <CreateTunnelDialog
        isOpen={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onSuccess={(shouldStart) => {
          setIsDialogOpen(false)
          if (shouldStart) {
            setShouldStartNext(true)
          }
        }}
        hosts={hosts}
        tunnelToEdit={editingTunnel}
      />
    </div>
  )
}
