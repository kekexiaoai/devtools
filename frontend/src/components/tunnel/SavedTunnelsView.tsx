import React, { useState, useMemo } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { SavedTunnelItem } from './SavedTunnelItem'
import { SortableTunnelItem } from './SortableTunnelItem'
import { sshtunnel } from '@wailsjs/go/models'
import { Loader2 } from 'lucide-react'

interface SavedTunnelsViewProps {
  savedTunnels: sshtunnel.SavedTunnelConfig[]
  activeTunnels: sshtunnel.ActiveTunnelInfo[]
  isLoading: boolean
  startingTunnelIds: string[]
  onStartTunnel: (id: string) => void
  onStopTunnel: (runtimeId: string) => void
  onDeleteTunnel: (id: string) => void | Promise<void>
  onDuplicateTunnel: (id: string) => void | Promise<void>
  onOrderChange: (orderedIds: string[]) => void
  tunnelErrors: Map<string, Error>
  onOpenInTerminal: (tunnel: sshtunnel.SavedTunnelConfig) => void
  onEditTunnel: (tunnel: sshtunnel.SavedTunnelConfig) => void
}

export function SavedTunnelsView({
  savedTunnels,
  activeTunnels,
  isLoading,
  startingTunnelIds,
  onStartTunnel,
  onStopTunnel,
  onDeleteTunnel,
  onDuplicateTunnel,
  onOrderChange,
  tunnelErrors,
  onOpenInTerminal,
  onEditTunnel,
}: SavedTunnelsViewProps) {
  const [activeDragId, setActiveDragId] = useState<string | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, {
      // Require the mouse to move by 8 pixels before starting a drag
      activationConstraint: {
        distance: 8,
      },
    })
  )

  const activeTunnelMap = useMemo(() => {
    return new Map(activeTunnels.map((t) => [t.configId, t]))
  }, [activeTunnels])

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(event.active.id as string)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null)
    const { active, over } = event
    if (over && active.id !== over.id) {
      const oldIndex = savedTunnels.findIndex((t) => t.id === active.id)
      const newIndex = savedTunnels.findIndex((t) => t.id === over.id)
      const newOrderIds = arrayMove(savedTunnels, oldIndex, newIndex).map(
        (t) => t.id
      )
      onOrderChange(newOrderIds)
    }
  }

  const activeDragItem = useMemo(() => {
    if (!activeDragId) return null
    return savedTunnels.find((t) => t.id === activeDragId)
  }, [activeDragId, savedTunnels])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (savedTunnels.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p>No saved tunnels. Create one to get started.</p>
      </div>
    )
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveDragId(null)}
    >
      <SortableContext
        items={savedTunnels.map((t) => t.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-1 overflow-y-auto h-full pr-2">
          {savedTunnels.map((tunnel) => (
            <SortableTunnelItem key={tunnel.id} id={tunnel.id}>
              <SavedTunnelItem
                tunnel={tunnel}
                activeTunnel={activeTunnelMap.get(tunnel.id)}
                isStarting={startingTunnelIds.includes(tunnel.id)}
                lastError={tunnelErrors.get(tunnel.id)}
                onStart={onStartTunnel}
                onStop={onStopTunnel}
                onDelete={() => void onDeleteTunnel(tunnel.id)}
                onDuplicate={() => void onDuplicateTunnel(tunnel.id)}
                onEdit={onEditTunnel}
                onOpenInTerminal={() => onOpenInTerminal(tunnel)}
                isSelected={activeDragId === tunnel.id}
              />
            </SortableTunnelItem>
          ))}
        </div>
      </SortableContext>
      <DragOverlay dropAnimation={null}>
        {activeDragItem ? (
          <div className="flex items-center gap-2">
            {/* We don't render the handle in the overlay */}
            <div className="p-2 text-muted-foreground">
              <div className="h-5 w-5" />
            </div>
            <div className="flex-grow">
              <SavedTunnelItem
                tunnel={activeDragItem}
                activeTunnel={activeTunnelMap.get(activeDragItem.id)}
                isStarting={startingTunnelIds.includes(activeDragItem.id)}
                lastError={tunnelErrors.get(activeDragItem.id)}
                onStart={() => {}}
                onStop={() => {}}
                onDelete={() => {}}
                onDuplicate={() => {}}
                onEdit={() => {}}
                onOpenInTerminal={() => {}}
                isSelected={true}
              />
            </div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
