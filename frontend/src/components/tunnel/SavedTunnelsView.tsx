import React, { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { PlusCircle } from 'lucide-react'
import { GetSavedTunnels } from '@wailsjs/go/sshgate/Service'
import { sshtunnel } from '@wailsjs/go/models'
import { useDialog } from '@/hooks/useDialog'

export function SavedTunnelsView() {
  const [savedTunnels, setSavedTunnels] = useState<
    sshtunnel.SavedTunnelConfig[]
  >([])
  const [isLoading, setIsLoading] = useState(true)
  const { showDialog } = useDialog()

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

  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">Saved Tunnel Configurations</h2>
        <Button>
          <PlusCircle className="mr-2 h-4 w-4" />
          Create Tunnel
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <p>Loading saved tunnels...</p>
        ) : savedTunnels.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <p>No saved tunnels. Click "Create Tunnel" to add one.</p>
          </div>
        ) : (
          <div className="space-y-4"></div>
        )}
      </div>
    </div>
  )
}
