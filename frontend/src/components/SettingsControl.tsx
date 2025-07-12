import { UiScale } from '@/App'
import { Button } from '@/components/ui/button'
import { ZoomIn, ZoomOut, Scale } from 'lucide-react'

interface SettingsControlProps {
  uiScale: UiScale
  onScaleChange: (scale: UiScale) => void
}

export function SettingsControl({
  uiScale,
  onScaleChange,
}: SettingsControlProps) {
  const scaleOptions: {
    scale: UiScale
    icon: React.ElementType
    title: string
  }[] = [
    { scale: 'small', icon: ZoomOut, title: 'Smaller UI' },
    { scale: 'default', icon: Scale, title: 'Default UI' },
    { scale: 'large', icon: ZoomIn, title: 'Larger UI' },
  ]
  return (
    //为这个控件的容器设置 --wails-draggable: no-drag
    // 这样即使用户从这个控件上开始拖拽，也不会移动整个窗口
    <div style={{ '--wails-draggable': 'no-drag' } as React.CSSProperties}>
      {/* // p-0.5: 在按钮组周围创建一个非常小的内边距 */}
      {/* // rounded-md: 让整个按钮组的容器也带有圆角 */}
      {/* // bg-muted: 给按钮组一个区别于标题栏的背景色 */}
      <div className="flex items-center bg-muted p-0.5 rounded-md">
        {scaleOptions.map((option) => (
          <Button
            key={option.scale}
            variant={uiScale === option.scale ? 'default' : 'ghost'}
            size="icon"
            className="h-[24px] w-[24px]"
            title={option.title}
            onClick={() => onScaleChange(option.scale)}
          >
            <option.icon className="h-[16px] w-[16px]" />
          </Button>
        ))}
      </div>
    </div>
  )
}
