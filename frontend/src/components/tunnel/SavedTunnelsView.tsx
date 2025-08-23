import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
} from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  TrainFrontTunnel,
} from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
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

// Helper component for the navigation list item with conditional tooltip
const NavListItem = ({
  tunnel,
  statusBgColorClass,
  isSelected,
  onClick,
}: {
  tunnel: sshtunnel.SavedTunnelConfig
  statusBgColorClass: string
  isSelected: boolean
  onClick: () => void
}) => {
  const [isTruncated, setIsTruncated] = useState(false)
  const nameRef = useRef<HTMLDivElement>(null)

  // This effect now runs on every render. The parent component will be
  // forced to re-render after the sidebar transition ends, which will
  // trigger this effect to re-measure correctly.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const element = nameRef.current
    if (element) {
      const hasOverflow = element.scrollWidth > element.clientWidth
      // Only update state if the truncation status has changed,
      // to prevent an infinite re-render loop.
      if (hasOverflow !== isTruncated) {
        setIsTruncated(hasOverflow)
      }
    }
  })

  const navButton = (
    <Button
      variant={isSelected ? 'secondary' : 'ghost'}
      className="w-full h-8 justify-start pl-2"
      onClick={onClick}
    >
      <span
        className={cn(
          'h-2 w-2 rounded-full flex-shrink-0 mr-2',
          statusBgColorClass
        )}
      />
      {/* Using a div as the flex item is more reliable for truncation and measurement than a span. */}
      <div ref={nameRef} className="truncate min-w-0">
        {tunnel.name}
      </div>
    </Button>
  )

  // Only wrap with TooltipProvider and Tooltip if the name is actually truncated.
  if (isTruncated) {
    return (
      <TooltipProvider>
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>{navButton}</TooltipTrigger>
          <TooltipContent side="right" align="start">
            <p>{tunnel.name}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return navButton
}

interface SavedTunnelsViewProps {
  hosts: types.SSHHost[]
  activeTunnels: sshtunnel.ActiveTunnelInfo[]
}

export interface SavedTunnelsViewRef {
  handleCreate: () => void
}

export const SavedTunnelsView = forwardRef<
  SavedTunnelsViewRef,
  SavedTunnelsViewProps
>(({ hosts, activeTunnels }, ref) => {
  const [savedTunnels, setSavedTunnels] = useState<
    sshtunnel.SavedTunnelConfig[]
  >([])
  const [isLoading, setIsLoading] = useState(true)
  const [startingTunnelId, setStartingTunnelId] = useState<string | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingTunnel, setEditingTunnel] = useState<
    sshtunnel.SavedTunnelConfig | undefined
  >(undefined)

  // This dummy state is used to force a re-render of the component.
  const [, setForceRender] = useState(0)
  const navPanelRef = useRef<HTMLDivElement>(null)

  // This effect adds a 'transitionend' listener to the navigation panel.
  // When the collapse/expand animation finishes, it forces a re-render
  // of the component. This ensures that the NavListItem components inside
  // re-run their layout effects to correctly calculate if text is truncated.
  useEffect(() => {
    const panel = navPanelRef.current
    if (!panel) return

    const handleTransitionEnd = () => {
      setForceRender((c) => c + 1)
    }

    panel.addEventListener('transitionend', handleTransitionEnd)
    return () => panel.removeEventListener('transitionend', handleTransitionEnd)
  }, []) // Empty array ensures this runs only on mount and unmount.

  const [isNavCollapsed, setIsNavCollapsed] = useState(
    () => localStorage.getItem('tunnel-nav-collapsed') === 'true'
  )

  useEffect(() => {
    localStorage.setItem('tunnel-nav-collapsed', String(isNavCollapsed))
  }, [isNavCollapsed])

  // New state for active navigation item
  const [selectedNavId, setSelectedNavId] = useState<string | null>(null)

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

    const activeTunnel = activeTunnelMap.get(getTunnelKey(tunnel))

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
      // If there's an active tunnel, stop it first.
      if (activeTunnel) {
        await StopForward(activeTunnel.id)
      }

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

  useImperativeHandle(ref, () => ({
    handleCreate,
  }))

  const getTunnelKey = (tunnel: sshtunnel.SavedTunnelConfig): string => {
    const bindAddr = tunnel.gatewayPorts ? '0.0.0.0' : '127.0.0.1'
    return `${bindAddr}:${tunnel.localPort}`
  }

  const handleNavClick = (tunnelId: string) => {
    const element = document.getElementById(`tunnel-card-${tunnelId}`)
    if (element) {
      // Using `block: 'nearest'` is often smoother than `start` if the item is already visible.
      element.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      setSelectedNavId(tunnelId)
    }
  }

  const activeTunnelMap = useMemo(() => {
    return new Map(activeTunnels.map((t) => [t.localAddr, t]))
  }, [activeTunnels])

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 flex gap-6 min-h-0">
        {/* Left Navigation Panel */}
        <div
          ref={navPanelRef}
          className={cn(
            'flex-shrink-0 border-r transition-all duration-300 ease-in-out flex flex-col', // Adjust collapsed width
            isNavCollapsed ? 'w-10' : 'w-56'
          )}
        >
          <div className="flex-1 h-full overflow-y-auto pr-2 pt-2">
            <div className="space-y-1">
              {savedTunnels.map((tunnel) => {
                const activeTunnel = activeTunnelMap.get(getTunnelKey(tunnel))
                const status = activeTunnel?.status
                const isRunning = status === 'active'
                const isDisconnected = status === 'disconnected'
                const isBusy =
                  startingTunnelId === tunnel.id || status === 'stopping'

                // Use Tailwind classes for better JIT compilation and consistency
                let statusColorClass = 'text-gray-400'
                let statusBgColorClass = 'bg-gray-400'
                if (isRunning) {
                  statusColorClass = 'text-green-500'
                  statusBgColorClass = 'bg-green-500'
                } else if (isDisconnected) {
                  statusColorClass = 'text-red-500'
                  statusBgColorClass = 'bg-red-500'
                } else if (isBusy) {
                  statusColorClass = 'text-yellow-500'
                  statusBgColorClass = 'bg-yellow-500'
                }

                if (isNavCollapsed) {
                  const navButton = (
                    <Button
                      variant={
                        selectedNavId === tunnel.id ? 'secondary' : 'ghost'
                      }
                      className="w-full h-8 justify-center px-0"
                      onClick={() => handleNavClick(tunnel.id)}
                    >
                      <TrainFrontTunnel
                        className={cn('h-5 w-5', statusColorClass)}
                      />
                    </Button>
                  )
                  return (
                    <TooltipProvider key={tunnel.id}>
                      <Tooltip delayDuration={0}>
                        <TooltipTrigger asChild>{navButton}</TooltipTrigger>
                        <TooltipContent side="right">
                          <p>{tunnel.name}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )
                }

                return (
                  <NavListItem
                    key={tunnel.id}
                    tunnel={tunnel}
                    statusBgColorClass={statusBgColorClass}
                    isSelected={selectedNavId === tunnel.id}
                    onClick={() => handleNavClick(tunnel.id)}
                  />
                )
              })}
            </div>
          </div>
          <div className="flex-shrink-0 border-t p-2">
            <TooltipProvider>
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    className={cn(
                      'w-full h-8',
                      isNavCollapsed // Correct icon direction
                        ? 'justify-center px-0'
                        : 'justify-start pl-2'
                    )}
                    onClick={() => setIsNavCollapsed(!isNavCollapsed)}
                  >
                    {isNavCollapsed ? (
                      <PanelLeftOpen className="h-4 w-4" />
                    ) : (
                      <>
                        <PanelLeftClose className="h-4 w-4" />
                        <span className="ml-2">Collapse</span>
                      </>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>{isNavCollapsed ? 'Expand' : 'Collapse'}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        {/* Right Content Panel */}
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
                  // This div wrapper gets an ID for the scroll-to-view functionality.
                  <div
                    id={`tunnel-card-${tunnel.id}`}
                    key={tunnel.id}
                    className="scroll-mt-4"
                    onClick={() => setSelectedNavId(tunnel.id)}
                  >
                    <SavedTunnelItem
                      tunnel={tunnel}
                      activeTunnel={activeTunnel}
                      onStart={handleStart}
                      onStop={handleStop}
                      onDelete={() => void handleDelete(tunnel.id)}
                      onEdit={handleEdit}
                      onDuplicate={() => void handleDuplicate(tunnel.id)}
                      isStarting={startingTunnelId === tunnel.id}
                      isSelected={selectedNavId === tunnel.id}
                    />
                  </div>
                )
              })}
            </div>
          )}
        </div>
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
})
