import { types } from '@wailsjs/go/models'
import { Button } from '@/components/ui/button'

interface HostListProps {
  hosts: types.SSHHost[]
  selectedAlias: string | null
  onSelect: (alias: string) => void
  onNew: () => void
  onHover: (alias: string) => void
}

export function HostList(props: HostListProps) {
  const { hosts, selectedAlias, onSelect, onNew, onHover } = props

  return (
    <div className="p-2 h-full flex flex-col">
      <Button onClick={onNew} className="w-full mb-4">
        + Add Host
      </Button>
      <div className="flex-1 overflow-y-auto pr-2">
        <ul className="space-y-1">
          {hosts.map((host) => (
            <li
              key={host.alias}
              onMouseEnter={() => onHover(host.alias)}
              onClick={() => onSelect(host.alias)}
              className={`px-3 py-2 rounded-md cursor-pointer transition-colors text-sm font-medium ${
                selectedAlias === host.alias
                  ? 'bg-accent text-accent-foreground'
                  : 'hover:bg-muted'
              }`}
            >
              <p>{host.alias}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
