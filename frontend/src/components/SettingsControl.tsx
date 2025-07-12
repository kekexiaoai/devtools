import { UiScale } from '@/App'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select'

interface SettingsControlProps {
  uiScale: UiScale
  onScaleChange: (scale: UiScale) => void
}

export function SettingsControl({
  uiScale,
  onScaleChange,
}: SettingsControlProps) {
  return (
    //为这个控件的容器设置 --wails-draggable: no-drag
    // 这样即使用户从这个控件上开始拖拽，也不会移动整个窗口
    <div style={{ '--wails-draggable': 'no-drag' } as React.CSSProperties}>
      <Select
        value={uiScale}
        onValueChange={(value) => onScaleChange(value as UiScale)}
      >
        <SelectTrigger className="w-[120px] h-7 text-xs border-none bg-transparent hover:bg-muted focus:ring-0">
          <SelectValue placeholder="UI Scale" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="small">Small</SelectItem>
          <SelectItem value="default">Default</SelectItem>
          <SelectItem value="large">Large</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}
