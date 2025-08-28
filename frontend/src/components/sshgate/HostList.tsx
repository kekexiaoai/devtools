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
import { GripVertical } from 'lucide-react'

interface HostListProps {
  hosts: types.SSHHost[]
  selectedAlias: string | null
  onSelect: (alias: string) => void
  onNew: () => void
  onHover: (alias: string) => void
  onOrderChange: (orderedIds: string[]) => void
}

function SortableHostItem({
  host,
  selectedAlias,
  onSelect,
  onHover,
}: {
  host: types.SSHHost
  selectedAlias: string | null
  onSelect: (alias: string) => void
  onHover: (alias: string) => void
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
        className={`flex-1 px-3 py-2 rounded-md cursor-pointer transition-colors text-sm font-medium ${
          selectedAlias === host.alias
            ? 'bg-accent text-accent-foreground'
            : 'hover:bg-muted'
        }`}
      >
        <p>{host.alias}</p>
      </div>
    </div>
  )
}

export function HostList(props: HostListProps) {
  const { hosts, selectedAlias, onSelect, onNew, onHover, onOrderChange } =
    props
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
      <Button onClick={onNew} className="w-full mb-4">
        + Add Host
      </Button>
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
                selectedAlias={selectedAlias}
                onSelect={onSelect}
                onHover={onHover}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  )
}
