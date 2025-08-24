import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { SavedTunnelsView } from '@/components/tunnel/SavedTunnelsView'
import {
  GetActiveTunnels,
  GetSavedTunnels,
  StartTunnelFromConfig,
  StopForward,
  DeleteTunnelConfig,
  DeletePassword,
  DuplicateTunnelConfig,
  UpdateTunnelsOrder,
} from '@wailsjs/go/sshgate/Service'
import { sshtunnel, types } from '@wailsjs/go/models'
import { EventsOn } from '@wailsjs/runtime'
import { appLogger } from '@/lib/logger'
import { Button } from '@/components/ui/button'
import { PlusCircle } from 'lucide-react'
import { useSshConnection } from '@/hooks/useSshConnection'
import { useDialog } from '@/hooks/useDialog'
import { toast } from 'sonner'
import { CreateTunnelDialog } from '@/components/tunnel/CreateTunnelDialog'
import { SshConnectionHook } from '@/hooks/useSshConnection'

interface TunnelsViewProps {
  onConnect: SshConnectionHook['connect']
}

export function TunnelsView({ onConnect }: TunnelsViewProps) {
  const [savedTunnels, setSavedTunnels] = useState<
    sshtunnel.SavedTunnelConfig[]
  >([])
  const [activeTunnels, setActiveTunnels] = useState<
    sshtunnel.ActiveTunnelInfo[]
  >([])

  // State to track which tunnels are currently in the process of starting.
  // Using an array of IDs allows handling multiple concurrent starting operations.
  const [startingTunnelIds, setStartingTunnelIds] = useState<string[]>([])

  // State to track the last error for each tunnel, keyed by tunnel ID.
  const [tunnelErrors, setTunnelErrors] = useState<Map<string, Error>>(
    new Map()
  )

  // State for the Create/Edit dialog
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingTunnel, setEditingTunnel] = useState<
    sshtunnel.SavedTunnelConfig | undefined
  >(undefined)
  const [shouldStartNext, setShouldStartNext] = useState(false)
  const prevTunnelsRef = useRef<sshtunnel.SavedTunnelConfig[] | undefined>(
    undefined
  )

  const logger = useMemo(() => {
    return appLogger.withPrefix('TunnelsView')
  }, [])

  // This is a workaround to satisfy the `CreateTunnelDialog`'s `hosts` prop,
  // which expects the older `types.SSHHost[]` structure for validation.
  // The long-term fix is to refactor `CreateTunnelDialog` to use `sshtunnel.SavedTunnelConfig[]`.
  const sshHostsForDialog = useMemo(
    (): types.SSHHost[] =>
      savedTunnels.map((t) => {
        // For manual hosts, the connection details are stored in the `manualHost` object.
        // For ssh_config hosts, these details are not available on the SavedTunnelConfig object.
        const hostName =
          t.hostSource === 'manual' ? (t.manualHost?.hostName ?? '') : ''
        const user = t.hostSource === 'manual' ? (t.manualHost?.user ?? '') : ''
        const port = t.hostSource === 'manual' ? (t.manualHost?.port ?? '') : ''

        return new types.SSHHost({
          id: t.id,
          name: t.name,
          alias: t.hostAlias ?? '',
          hostName,
          user,
          port,
        })
      }),
    [savedTunnels]
  )

  const [isLoadingTunnels, setIsLoadingTunnels] = useState(true)

  useEffect(() => {
    logger.debug('isLoadingTunnels', isLoadingTunnels)
  }, [isLoadingTunnels, logger])

  const { showDialog } = useDialog()
  const { connect: verifyAndGetPassword } = useSshConnection({
    showDialog,
    onOpenTerminal: () => {}, // Not used in 'verify' mode
  })

  const handleStartTunnel = useCallback(
    (id: string) => {
      const tunnel = savedTunnels.find((t) => t.id === id)
      if (!tunnel) {
        toast.error('Could not find tunnel configuration.')
        return
      }

      // Add the tunnel ID to the starting list to update the UI
      setStartingTunnelIds((prev) => [...prev, id])

      const promise = (async (): Promise<string> => {
        const aliasForDisplay =
          tunnel.hostSource === 'ssh_config' ? tunnel.hostAlias! : tunnel.name

        const password = await verifyAndGetPassword({
          alias: aliasForDisplay,
          strategy: 'verify',
          tunnelConfigID: id,
        })

        if (password === null) {
          throw new Error('Tunnel creation cancelled.')
        }

        await StartTunnelFromConfig(id, password)
        return `Tunnel "${tunnel.name}" started successfully.`
      })()

      toast.promise(promise, {
        loading: `Starting tunnel "${tunnel.name}"...`,
        success: (msg) => {
          // On success, clear any previous error for this tunnel.
          setTunnelErrors((prev) => {
            const newErrors = new Map(prev)
            newErrors.delete(id)
            return newErrors
          })
          return msg
        },
        error: (error: unknown) => {
          const err = error instanceof Error ? error : new Error(String(error))
          // On failure, store the error message.
          setTunnelErrors((prev) => new Map(prev).set(id, err))
          return err.message.includes('cancelled')
            ? 'Operation cancelled.'
            : `Failed to start tunnel: ${err.message}`
        },
        finally: () => {
          // Remove the tunnel ID from the starting list, regardless of outcome
          setStartingTunnelIds((prev) =>
            prev.filter((tunnelId) => tunnelId !== id)
          )
        },
      })
    },
    [savedTunnels, verifyAndGetPassword] // No dependency on tunnelErrors needed here
  )

  const handleOpenInTerminal = useCallback(
    (tunnel: sshtunnel.SavedTunnelConfig) => {
      if (tunnel.hostSource !== 'ssh_config' || !tunnel.hostAlias) {
        toast.error(
          'This feature is only available for tunnels based on an SSH config alias.'
        )
        return
      }
      // Use the connect function passed from App.tsx, which is configured
      // to open a new terminal session.
      onConnect({
        alias: tunnel.hostAlias,
        strategy: 'internal',
        type: 'remote',
      }).catch((err) =>
        logger.warn('Opening terminal failed or was cancelled', err)
      )
    },
    [onConnect, logger]
  )

  useEffect(() => {
    // This effect handles the "start after create" feature.
    // It compares the new list of tunnels with the previous one to find the new tunnel.
    const prevTunnels = prevTunnelsRef.current
    if (
      shouldStartNext &&
      prevTunnels &&
      savedTunnels.length > prevTunnels.length
    ) {
      const prevTunnelIds = new Set(prevTunnels.map((t) => t.id))
      const newTunnel = savedTunnels.find((t) => !prevTunnelIds.has(t.id))

      if (newTunnel) {
        logger.info(`Auto-starting newly created tunnel: ${newTunnel.name}`)
        handleStartTunnel(newTunnel.id)
      }
      // Reset the flag after attempting to start
      setShouldStartNext(false)
    }

    // Update the ref for the next comparison
    prevTunnelsRef.current = savedTunnels
  }, [savedTunnels, shouldStartNext, handleStartTunnel, logger])

  const handleStopTunnel = useCallback(
    (tunnelId: string) => {
      const activeTunnel = activeTunnels.find((t) => t.id === tunnelId)
      if (!activeTunnel) return

      const promise = StopForward(activeTunnel.id)
      toast.promise(promise, {
        loading: `Stopping tunnel "${activeTunnel.alias}"...`,
        success: () => {
          return `Tunnel "${activeTunnel.alias}" stopped.`
        },
        error: (err) => `Failed to stop tunnel: ${String(err)}`,
      })
    },
    [activeTunnels]
  )

  const handleDeleteTunnel = useCallback(
    async (id: string) => {
      const tunnel = savedTunnels.find((t) => t.id === id)
      if (!tunnel) return

      const activeTunnel = activeTunnels.find((t) => t.id === id)

      const choice = await showDialog({
        type: 'confirm',
        title: `Delete Tunnel "${tunnel.name}"?`,
        message:
          'Are you sure you want to permanently delete this tunnel configuration?' +
          (activeTunnel
            ? '\n\nThe associated active tunnel will also be stopped.'
            : ''),
        buttons: [
          { text: 'Cancel', variant: 'outline', value: 'cancel' },
          { text: 'Delete', variant: 'destructive', value: 'delete' },
        ],
      })

      if (choice.buttonValue !== 'delete') return

      try {
        if (activeTunnel) {
          await StopForward(activeTunnel.id)
        }
        await DeleteTunnelConfig(id)
        DeletePassword(id).catch((err) => {
          logger.warn(`Could not delete password for tunnel ${id}:`, err)
        })
        toast.success(`Tunnel "${tunnel.name}" deleted.`)
      } catch (error) {
        toast.error(`Failed to delete tunnel: ${String(error)}`)
      }
    },
    [savedTunnels, activeTunnels, showDialog, logger]
  )

  const handleDuplicateTunnel = useCallback(
    (id: string) => {
      const tunnel = savedTunnels.find((t) => t.id === id)
      if (!tunnel) return

      const promise = DuplicateTunnelConfig(id)
      toast.promise(promise, {
        loading: `Duplicating tunnel "${tunnel.name}"...`,
        success: (newTunnel) => `Tunnel "${newTunnel.name}" created.`,
        error: (err) => `Failed to duplicate tunnel: ${String(err)}`,
      })
    },
    [savedTunnels]
  )

  const fetchSavedTunnels = useCallback(async () => {
    try {
      setSavedTunnels(await GetSavedTunnels())
    } catch (error) {
      logger.error(`Failed to load saved tunnels: ${String(error)}`)
    }
  }, [logger])

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

  const handleOrderChange = useCallback(
    (orderedIds: string[]) => {
      // Optimistically update the UI
      setSavedTunnels((currentTunnels) => {
        const tunnelMap = new Map(currentTunnels.map((t) => [t.id, t]))
        return orderedIds
          .map((id) => tunnelMap.get(id))
          .filter(Boolean) as sshtunnel.SavedTunnelConfig[]
      })

      // Persist to the backend
      UpdateTunnelsOrder(orderedIds).catch((err) => {
        toast.error('Failed to save tunnel order.')
        logger.error('Failed to update tunnel order:', err)
        // On failure, refetch from the backend to revert to the correct state
        void fetchSavedTunnels()
      })
    },
    [fetchSavedTunnels, logger]
  )

  const handleCreateTunnel = () => {
    setEditingTunnel(undefined)
    setIsDialogOpen(true)
  }

  const handleEditTunnel = (tunnel: sshtunnel.SavedTunnelConfig) => {
    setEditingTunnel(tunnel)
    setIsDialogOpen(true)
  }

  const handleDialogSuccess = (shouldStart: boolean) => {
    setIsDialogOpen(false)
    if (shouldStart) setShouldStartNext(true)
  }

  useEffect(() => {
    void fetchSavedTunnels()
    void fetchTunnels(true) // Initial load
    const cleanupTunnelChangedEvent = EventsOn(
      'tunnels:changed',
      () => void fetchTunnels(false)
    )
    const cleanupSavedTunnelsChangedEvent = EventsOn(
      'saved_tunnels_changed',
      () => void fetchSavedTunnels()
    )

    return () => {
      cleanupTunnelChangedEvent()
      cleanupSavedTunnelsChangedEvent()
    }
  }, [fetchTunnels, fetchSavedTunnels])

  return (
    <div className="p-2 h-full flex flex-col">
      <div className="flex-shrink-0 mb-2">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">Tunnels</h1>
          <Button onClick={handleCreateTunnel} size="sm">
            <PlusCircle className="mr-2 h-4 w-4" />
            Create Tunnel
          </Button>
        </div>
        <p className="text-muted-foreground">
          Manage and monitor your SSH tunnels.
        </p>
      </div>
      <div className="flex-1 min-h-0">
        <SavedTunnelsView
          savedTunnels={savedTunnels}
          activeTunnels={activeTunnels}
          isLoading={isLoadingTunnels}
          startingTunnelIds={startingTunnelIds}
          onStartTunnel={handleStartTunnel}
          onStopTunnel={handleStopTunnel}
          onDeleteTunnel={handleDeleteTunnel}
          onDuplicateTunnel={handleDuplicateTunnel}
          onOrderChange={handleOrderChange}
          tunnelErrors={tunnelErrors}
          onOpenInTerminal={handleOpenInTerminal}
          onEditTunnel={handleEditTunnel}
        />
      </div>
      <CreateTunnelDialog
        isOpen={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onSuccess={handleDialogSuccess}
        hosts={sshHostsForDialog}
        tunnelToEdit={editingTunnel}
      />
    </div>
  )
}
