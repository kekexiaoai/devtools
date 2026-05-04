import { types } from '@wailsjs/go/models'
import { Button } from '@/components/ui/button'
import React from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { FileInput, GripVertical, Plus, Star } from 'lucide-react'
import type { SSHHostMetadataMap } from '@/lib/ssh-host-metadata'

interface HostListProps {
  hosts: types.SSHHost[]
  metadata: SSHHostMetadataMap
  selectedAlias: string | null
  onSelect: (alias: string) => void
  onNew: () => void
  onImport: () => void
  onHover: (alias: string) => void
  onOrderChange: (orderedIds: string[]) => void
  onFavoriteToggle: (alias: string) => void
}

function SortableHostItem({
  host,
  metadata,
  selectedAlias,
  onSelect,
  onHover,
  onFavoriteToggle,
}: {
  host: types.SSHHost
  metadata: SSHHostMetadataMap
  selectedAlias: string | null
  onSelect: (alias: string) => void
  onHover: (alias: string) => void
  onFavoriteToggle: (alias: string) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: host.alias })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }
  const hostMetadata = metadata[host.alias] ?? { tags: [], favorite: false }

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-1">
      <button
        {...attributes}
        {...listeners}
        className="p-1 cursor-grab touch-none text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-5 w-5" />
      </button>
      <div
        onMouseEnter={() => onHover(host.alias)}
        onClick={() => onSelect(host.alias)}
        className={`min-w-0 flex-1 px-3 py-2 rounded-md cursor-pointer transition-colors text-sm font-medium ${
          selectedAlias === host.alias
            ? 'bg-accent text-accent-foreground'
            : 'hover:bg-muted'
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate">{host.alias}</p>
            {hostMetadata.tags.length > 0 && (
              <p className="mt-1 truncate text-xs font-normal text-muted-foreground">
                {hostMetadata.tags.join(', ')}
              </p>
            )}
          </div>
          <button
            type="button"
            className={`rounded-sm p-0.5 ${
              hostMetadata.favorite
                ? 'text-yellow-500'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            aria-label="Toggle favorite"
            onClick={(event) => {
              event.stopPropagation()
              onFavoriteToggle(host.alias)
            }}
          >
            <Star
              className="h-4 w-4"
              fill={hostMetadata.favorite ? 'currentColor' : 'none'}
            />
          </button>
        </div>
      </div>
    </div>
  )
}

export function HostList(props: HostListProps) {
  const {
    hosts,
    metadata,
    selectedAlias,
    onSelect,
    onNew,
    onImport,
    onHover,
    onOrderChange,
    onFavoriteToggle,
  } = props
  const sensors = useSensors(
    useSensor(PointerSensor, {
      // Require the mouse to move by 8 pixels before starting a drag
      activationConstraint: {
        distance: 8,
      },
    })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const oldIndex = hosts.findIndex((h) => h.alias === active.id)
      const newIndex = hosts.findIndex((h) => h.alias === over.id)
      const newOrderIds = arrayMove(hosts, oldIndex, newIndex).map(
        (h) => h.alias
      )
      onOrderChange(newOrderIds)
    }
  }

  return (
    <div className="p-2 h-full flex flex-col">
      <div className="mb-4 grid grid-cols-2 gap-2">
        <Button onClick={onNew}>
          <Plus className="mr-2 h-4 w-4" />
          Add
        </Button>
        <Button onClick={onImport} variant="outline">
          <FileInput className="mr-2 h-4 w-4" />
          Import
        </Button>
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={hosts.map((h) => h.alias)}
          strategy={verticalListSortingStrategy}
        >
          <div className="flex-1 overflow-y-auto pr-2 space-y-1">
            {hosts.map((host) => (
              <SortableHostItem
                key={host.alias}
                host={host}
                metadata={metadata}
                selectedAlias={selectedAlias}
                onSelect={onSelect}
                onHover={onHover}
                onFavoriteToggle={onFavoriteToggle}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  )
}
