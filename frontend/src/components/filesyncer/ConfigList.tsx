import { Button } from '@/components/ui/button'
import { PencilIcon, TrashIcon } from 'lucide-react'
import type { types } from '@wailsjs/go/models'
import { useState } from 'react'

interface ConfigListProps {
  configs: types.SSHConfig[]
  selectedId: string | null
  onSelect: (id: string) => void
  onNew: () => void
  onEdit: (id: string) => void
  onDelete: (id: string) => void
}

export function ConfigList({
  configs,
  selectedId,
  onSelect,
  onNew,
  onEdit,
  onDelete,
}: ConfigListProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  return (
    <div className="p-2 h-full flex flex-col bg-muted/50">
      <Button onClick={onNew} className="w-full mb-4">
        + New Configuration
      </Button>

      <ul className="space-y-1 overflow-y-auto text-left">
        {configs.map((config) => (
          <li
            key={config.id}
            onClick={() => onSelect(config.id)}
            className={`group p-3 rounded-md cursor-pointer flex justify-between items-center transition-all duration-200 ${
              selectedId === config.id
                ? 'bg-accent/90 text-accent-foreground border-1 border-accent-foreground/30 shadow-lg shadow-accent/20'
                : 'hover:bg-accent/10 hover:text-accent-foreground border border-transparent hover:border-accent/30 hover:shadow-sm'
            }`}
            onMouseEnter={() => {
              setHoveredId(config.id)
              console.log('Hover on:', config.id)
            }} // 调试 hover
            onMouseLeave={() => {
              setHoveredId(null)
              console.log('Hover leave:', config.id)
            }}
          >
            <div>
              <h3 className="font-semibold text-sm">{config.name}</h3>
              <p className="text-xs text-muted-foreground">
                {config.user}@{config.host}
              </p>
            </div>

            <div
              className={`flex items-center opacity-0 group-hover:opacity-100 transition-opacity ${
                hoveredId === config.id ? 'opacity-100' : 'opacity-0'
              }`}
            >
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={(e) => {
                  e.stopPropagation()
                  onEdit(config.id)
                }}
                title="Edit Configuration"
              >
                <PencilIcon className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 hover:bg-destructive/10 hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete(config.id)
                }}
                title="Delete Configuration"
              >
                <TrashIcon className="h-4 w-4" />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
