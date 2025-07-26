import { UiScale } from '@/types'
import { WindowToggleMaximise } from '@wailsjs/runtime/runtime'
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
      // 使用 h-[40px] 来设置一个固定的、绝对的像素高度
      // flex items-center: 让所有子元素垂直居中。
      // justify-end: 让所有内容靠右对齐。
      // px-4: 左右两边留出16px的内边距。
      className="h-[40px] w-full flex-shrink-0 select-none flex items-center justify-end px-4"
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
