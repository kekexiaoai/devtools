import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { PlusCircle, Loader2 } from 'lucide-react'
import {
  GetSavedTunnels,
  DeleteTunnelConfig,
  DuplicateTunnelConfig,
  DeletePassword,
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
}

export function SavedTunnelsView({ hosts }: SavedTunnelsViewProps) {
  const [savedTunnels, setSavedTunnels] = useState<
    sshtunnel.SavedTunnelConfig[]
  >([])
  const [isLoading, setIsLoading] = useState(true)
  const [startingTunnelId, setStartingTunnelId] = useState<string | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingTunnel, setEditingTunnel] = useState<
    sshtunnel.SavedTunnelConfig | undefined
  >(undefined)
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
      .finally(() => setIsLoading(false))
      .catch((error) => logger.error('Failed to fetch tunnels:', error))

    // Listen for changes from the backend to automatically refresh the list
    const cleanup = EventsOn('saved_tunnels_changed', () => {
      void fetchSavedTunnels()
    })

    return cleanup
  }, [fetchSavedTunnels, logger]) // The dependency is stable, so this runs once on mount.

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
      error: (err: Error) =>
        err.message.includes('cancelled')
          ? 'Operation cancelled.'
          : `Failed to start tunnel: ${err.message}`,
      finally: () => setStartingTunnelId(null),
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
            {savedTunnels.map((tunnel) => (
              <SavedTunnelItem
                key={tunnel.id}
                tunnel={tunnel}
                onStart={handleStart}
                onDelete={() => void handleDelete(tunnel.id)}
                onEdit={handleEdit}
                onDuplicate={() => void handleDuplicate(tunnel.id)}
                isStarting={startingTunnelId === tunnel.id}
              />
            ))}
          </div>
        )}
      </div>
      <CreateTunnelDialog
        isOpen={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onSuccess={() => {
          setIsDialogOpen(false)
          // The list will be refreshed automatically by the event listener.
        }}
        hosts={hosts}
        tunnelToEdit={editingTunnel}
      />
    </div>
  )
}
