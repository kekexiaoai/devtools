import type { types } from '../../../wailsjs/go/models'
import { SyncPairsManager } from './SyncPairsManager'

interface ConfigDetailProps {
  config: types.SSHConfig
  isWatching: boolean
  onToggleWatcher: (id: string, isActive: boolean) => void
  onConfigUpdate: () => void
}

export function ConfigDetail({
  config,
  isWatching,
  onToggleWatcher,
  // onConfigUpdate,
}: ConfigDetailProps) {
  return (
    <div className="space-y-8">
      {/* 同步目录管理器 */}
      <SyncPairsManager
        config={config}
        isWatching={isWatching}
        onToggleWatcher={onToggleWatcher}
      />
      {/* 暂时用占位符 */}
      <div className="p-6 bg-card rounded-lg shadow">
        Clipboard Tool will be here.
      </div>
    </div>
  )
}
