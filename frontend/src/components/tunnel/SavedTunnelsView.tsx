import React, { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { PlusCircle, Loader2 } from 'lucide-react'
import {
  GetSavedTunnels,
  DeleteTunnelConfig,
  DeletePassword,
  StartTunnelFromConfig,
} from '@wailsjs/go/sshgate/Service'
import { sshtunnel, types } from '@wailsjs/go/models'
import { useDialog } from '@/hooks/useDialog'
import { SavedTunnelItem } from './SavedTunnelItem'
import { useSshConnection } from '@/hooks/useSshConnection'
import { toast } from 'sonner'
import { CreateTunnelDialog } from './CreateTunnelDialog'

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

  const fetchSavedTunnels = useCallback(async () => {
    setIsLoading(true)
    try {
      const tunnels = await GetSavedTunnels()
      setSavedTunnels(tunnels)
    } catch (error) {
      void showDialog({
        type: 'error',
        title: 'Failed to load saved tunnels',
        message: String(error),
      })
    } finally {
      setIsLoading(false)
    }
  }, [showDialog])

  useEffect(() => {
    void fetchSavedTunnels()
  }, [fetchSavedTunnels])

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
      await fetchSavedTunnels() // Refresh the list
    } catch (error) {
      toast.error(`Failed to delete tunnel: ${String(error)}`)
    }
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
          void fetchSavedTunnels()
        }}
        hosts={hosts}
        tunnelToEdit={editingTunnel}
      />
    </div>
  )
}
