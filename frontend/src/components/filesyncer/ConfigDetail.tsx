import type { types } from '../../../wailsjs/go/models'

interface ConfigDetailProps {
  config: types.SSHConfig
  isWatching: boolean
  onToggleWatcher: (id: string, isActive: boolean) => void
  onConfigUpdate: () => void
}

export function ConfigDetail(
  {
    //   config,
    //   isWatching,
    //   onToggleWatcher,
    //   onConfigUpdate,
  }: ConfigDetailProps
) {
  return (
    <div className="space-y-8">
      <div>sync pairs manager</div>
      <div>clipboard tool</div>
    </div>
  )
}
