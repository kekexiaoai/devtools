import { UiScale } from '@/App'
import { WindowToggleMaximise } from '../../wailsjs/runtime/runtime'
import { SettingsControl } from './SettingsControl'

interface TitleBarProps {
  uiScale: UiScale
  onScaleChange: (scale: UiScale) => void
}

export function TitleBar({ uiScale, onScaleChange }: TitleBarProps) {
  return (
    <div
      onDoubleClick={WindowToggleMaximise}
      style={{ '--wails-draggable': 'drag' } as React.CSSProperties}
      className="h-10 w-full flex-shrink-0 select-none"
    >
      <div className="flex h-full items-center justify-between px-4 ml-25">
        <div></div>
        <div style={{ '--wails-draggable': 'no-drag' } as React.CSSProperties}>
          <SettingsControl uiScale={uiScale} onScaleChange={onScaleChange} />
        </div>
      </div>
    </div>
  )
}
