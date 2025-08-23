import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SavedTunnelsView } from '@/components/tunnel/SavedTunnelsView'
import { ActiveTunnels } from '@/components/sshgate/ActiveTunnels'
import { GetActiveTunnels, GetSSHHosts } from '@wailsjs/go/sshgate/Service'
import { sshtunnel, types } from '@wailsjs/go/models'
import { EventsOn } from '@wailsjs/runtime'
import { appLogger } from '@/lib/logger'

export function TunnelsView() {
  const [activeTab, setActiveTab] = useState('saved')
  const [hosts, setHosts] = useState<types.SSHHost[]>([])
  const [activeTunnels, setActiveTunnels] = useState<
    sshtunnel.ActiveTunnelInfo[]
  >([])

  const logger = useMemo(() => {
    return appLogger.withPrefix('TunnelsView')
  }, [])

  const [isLoadingTunnels, setIsLoadingTunnels] = useState(true)

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
    <div className="p-2 h-full flex flex-col">
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex-1 flex flex-col min-h-0"
      >
        <div className="flex-shrink-0 flex justify-between items-center mb-4">
          <div>
            <h1 className="text-2xl font-bold">Tunnels</h1>
            <p className="text-muted-foreground">
              Manage saved and active SSH tunnels.
            </p>
          </div>
          <TabsList>
            <TabsTrigger value="saved">Saved</TabsTrigger>
            <TabsTrigger value="active">Active</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="saved" className="flex-1 min-h-0">
          <SavedTunnelsView hosts={hosts} />
        </TabsContent>
        <TabsContent value="active" className="flex-1 min-h-0">
          <ActiveTunnels
            tunnels={activeTunnels}
            isLoading={isLoadingTunnels}
            onRefresh={() => void fetchTunnels(true)}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
