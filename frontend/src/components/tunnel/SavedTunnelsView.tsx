import React, {
  useEffect,
  useMemo,
  useRef,
  useLayoutEffect,
  useState,
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
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { sshtunnel } from '@wailsjs/go/models'
import { SavedTunnelItem } from './SavedTunnelItem'
import { appLogger } from '@/lib/logger'

// Helper for the sortable wrapper
const SortableWrapper = ({
  id,
  children,
}: {
  id: string
  children: React.ReactNode
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    // The listeners are spread onto this div to make it draggable.
    // The cursor classes provide visual feedback.
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="cursor-grab active:cursor-grabbing"
    >
      {children}
    </div>
  )
}
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
  savedTunnels: sshtunnel.SavedTunnelConfig[]
  activeTunnels: sshtunnel.ActiveTunnelInfo[]
  isLoading: boolean
  startingTunnelIds: string[]
  onStartTunnel: (id: string) => void
  onStopTunnel: (id: string) => void
  onDeleteTunnel: (id: string) => void | Promise<void>
  onDuplicateTunnel: (id: string) => void | Promise<void>
  tunnelErrors: Map<string, Error>
  onOrderChange: (orderedIds: string[]) => void
  onOpenInTerminal: (tunnel: sshtunnel.SavedTunnelConfig) => void
  onEditTunnel: (tunnel: sshtunnel.SavedTunnelConfig) => void
}

export const SavedTunnelsView: React.FC<SavedTunnelsViewProps> = ({
  savedTunnels,
  activeTunnels,
  isLoading,
  startingTunnelIds,
  onStartTunnel,
  onStopTunnel,
  onDeleteTunnel,
  onDuplicateTunnel,
  tunnelErrors,
  onOpenInTerminal,
  onOrderChange,
  onEditTunnel,
}) => {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        // Require mouse to move 8px to start dragging, to avoid interfering with clicks
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const logger = useMemo(() => {
    return appLogger.withPrefix('SavedTunnelsView')
  }, [])

  logger.debug('SavedTunnelsView is rendering')

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      const oldIndex = savedTunnels.findIndex((item) => item.id === active.id)
      const newIndex = savedTunnels.findIndex((item) => item.id === over.id)

      if (oldIndex === -1 || newIndex === -1) return

      const newOrder = arrayMove(savedTunnels, oldIndex, newIndex)
      const newOrderIds = newOrder.map((item) => item.id)
      onOrderChange(newOrderIds)
    }
  }

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
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={savedTunnels.map((t) => t.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="flex-1 h-full overflow-y-auto pr-2 pt-2">
                <div className="space-y-1">
                  {savedTunnels.map((tunnel) => {
                    const activeTunnel = activeTunnelMap.get(
                      getTunnelKey(tunnel)
                    )
                    const status = activeTunnel?.status
                    const isRunning = status === 'active'
                    const isDisconnected = status === 'disconnected'
                    const isBusy =
                      startingTunnelIds.includes(tunnel.id) ||
                      status === 'stopping'

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

                    return (
                      <SortableWrapper key={tunnel.id} id={tunnel.id}>
                        {isNavCollapsed ? (
                          <TooltipProvider>
                            <Tooltip delayDuration={0}>
                              <TooltipTrigger asChild>
                                <Button
                                  variant={
                                    selectedNavId === tunnel.id
                                      ? 'secondary'
                                      : 'ghost'
                                  }
                                  className="w-full h-8 justify-center px-0"
                                  onClick={() => handleNavClick(tunnel.id)}
                                >
                                  <TrainFrontTunnel
                                    className={cn('h-5 w-5', statusColorClass)}
                                  />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="right">
                                <p>{tunnel.name}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          <NavListItem
                            tunnel={tunnel}
                            statusBgColorClass={statusBgColorClass}
                            isSelected={selectedNavId === tunnel.id}
                            onClick={() => handleNavClick(tunnel.id)}
                          />
                        )}
                      </SortableWrapper>
                    )
                  })}
                </div>
              </div>
            </SortableContext>
          </DndContext>
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
                      onStart={onStartTunnel}
                      onStop={onStopTunnel}
                      onDelete={() => void onDeleteTunnel(tunnel.id)}
                      onEdit={onEditTunnel}
                      onDuplicate={() => void onDuplicateTunnel(tunnel.id)}
                      lastError={tunnelErrors.get(tunnel.id)}
                      onOpenInTerminal={() => onOpenInTerminal(tunnel)}
                      isStarting={startingTunnelIds.includes(tunnel.id)}
                      isSelected={selectedNavId === tunnel.id}
                    />
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
