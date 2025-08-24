import React, { useCallback, useMemo } from 'react'
import { SavedTunnelsView } from '@/components/tunnel/SavedTunnelsView'
import { SavedTunnelsWithMiniMapView } from '@/components/tunnel/SavedTunnelsWithMiniMapView'
import {
  DeleteTunnelConfig,
  DeletePassword,
  DuplicateTunnelConfig,
  StopForward,
} from '@wailsjs/go/sshgate/Service'
import { sshtunnel } from '@wailsjs/go/models'
import { Button } from '@/components/ui/button'
import { PlusCircle } from 'lucide-react'
import { SshConnectionHook } from '@/hooks/useSshConnection'
import { toast } from 'sonner'
import { appLogger } from '@/lib/logger'
import { useSettingsStore } from '@/hooks/useSettingsStore'
import { useDialog } from '@/hooks/useDialog'

interface TunnelsViewProps {
  onConnect: SshConnectionHook['connect']
  savedTunnels: sshtunnel.SavedTunnelConfig[]
  activeTunnels: sshtunnel.ActiveTunnelInfo[]
  startingTunnelIds: string[]
  tunnelErrors: Map<string, Error>
  isLoadingTunnels: boolean
  onStartTunnel: (id: string) => void
  onStopTunnel: (runtimeId: string) => void
  onOrderChange: (orderedIds: string[]) => void
  onOpenCreateTunnel: () => void
  onEditTunnel: (tunnel: sshtunnel.SavedTunnelConfig) => void
}

export function TunnelsView({
  onConnect,
  savedTunnels,
  activeTunnels,
  startingTunnelIds,
  tunnelErrors,
  isLoadingTunnels,
  onStartTunnel,
  onStopTunnel,
  onOrderChange,
  onOpenCreateTunnel,
  onEditTunnel,
}: TunnelsViewProps) {
  const { useTunnelMiniMap } = useSettingsStore()

  const logger = useMemo(() => {
    return appLogger.withPrefix('TunnelsView')
  }, [])

  const { showDialog } = useDialog()

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

  return (
    <div className="p-2 h-full flex flex-col">
      <div className="flex-shrink-0 mb-2">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">Tunnels</h1>
          <Button onClick={onOpenCreateTunnel} size="sm">
            <PlusCircle className="mr-2 h-4 w-4" />
            Create Tunnel
          </Button>
        </div>
        <p className="text-muted-foreground">
          Manage and monitor your SSH tunnels.
        </p>
      </div>
      <div className="flex-1 min-h-0">
        {useTunnelMiniMap ? (
          <SavedTunnelsWithMiniMapView
            savedTunnels={savedTunnels}
            activeTunnels={activeTunnels}
            isLoading={isLoadingTunnels}
            startingTunnelIds={startingTunnelIds}
            onStartTunnel={onStartTunnel}
            onStopTunnel={onStopTunnel}
            onDeleteTunnel={handleDeleteTunnel}
            onDuplicateTunnel={handleDuplicateTunnel}
            onOrderChange={onOrderChange}
            tunnelErrors={tunnelErrors}
            onOpenInTerminal={handleOpenInTerminal}
            onEditTunnel={onEditTunnel}
          />
        ) : (
          <SavedTunnelsView
            savedTunnels={savedTunnels}
            activeTunnels={activeTunnels}
            isLoading={isLoadingTunnels}
            startingTunnelIds={startingTunnelIds}
            onStartTunnel={onStartTunnel}
            onStopTunnel={onStopTunnel}
            onDeleteTunnel={handleDeleteTunnel}
            onDuplicateTunnel={handleDuplicateTunnel}
            onOrderChange={onOrderChange}
            tunnelErrors={tunnelErrors}
            onOpenInTerminal={handleOpenInTerminal}
            onEditTunnel={onEditTunnel}
          />
        )}
      </div>
    </div>
  )
}
