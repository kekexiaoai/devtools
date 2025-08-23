import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { SavedTunnelsView } from '@/components/tunnel/SavedTunnelsView'
import { GetActiveTunnels, GetSSHHosts } from '@wailsjs/go/sshgate/Service'
import { sshtunnel, types } from '@wailsjs/go/models'
import { EventsOn } from '@wailsjs/runtime'
import { appLogger } from '@/lib/logger'

export function TunnelsView() {
  const [hosts, setHosts] = useState<types.SSHHost[]>([])
  const [activeTunnels, setActiveTunnels] = useState<
    sshtunnel.ActiveTunnelInfo[]
  >([])

  const logger = useMemo(() => {
    return appLogger.withPrefix('TunnelsView')
  }, [])

  const [isLoadingTunnels, setIsLoadingTunnels] = useState(true)

  useEffect(() => {
    logger.debug('isLoadingTunnels', isLoadingTunnels)
  }, [isLoadingTunnels, logger])

  const fetchHosts = useCallback(async () => {
    try {
      setHosts(await GetSSHHosts())
    } catch (error) {
      logger.error(`Failed to load SSH hosts: ${String(error)}`)
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

  useEffect(() => {
    void fetchHosts()
    void fetchTunnels(true) // Initial load
    const cleanupTunnelChangedEvent = EventsOn(
      'tunnels:changed',
      () => void fetchTunnels(false)
    )
    const cleanupSavedTunnelsChangedEvent = EventsOn(
      'saved_tunnels_changed',
      () => void fetchHosts()
    )

    return () => {
      cleanupTunnelChangedEvent()
      cleanupSavedTunnelsChangedEvent()
    }
  }, [fetchTunnels, fetchHosts])

  return (
    <div className="p-4 h-full flex flex-col">
      <div className="flex-shrink-0 mb-4">
        <h1 className="text-2xl font-bold">Tunnels</h1>
        <p className="text-muted-foreground">
          Manage and monitor your SSH tunnels.
        </p>
      </div>
      <div className="flex-1 min-h-0">
        <SavedTunnelsView hosts={hosts} activeTunnels={activeTunnels} />
      </div>
    </div>
  )
}
