import React from 'react'
import {
  WindowMinimise,
  WindowToggleMaximise,
  Quit,
} from '../../wailsjs/runtime/runtime'
// 导入我们需要的 Select 组件
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
// 导入类型
import { UiScale } from '@/App'

// 定义 props 类型
interface TitleBarProps {
  uiScale: UiScale
  onScaleChange: (scale: UiScale) => void
}

export function TitleBar({ uiScale, onScaleChange }: TitleBarProps) {
  return (
    <div
      style={{ '--wails-draggable': 'drag' } as React.CSSProperties}
      className="w-full h-10 bg-background border-b flex justify-between items-center px-2 select-none"
    >
      {/* 右侧区域：包含缩放控件和窗口控制按钮 */}
      <div
        style={{ '--wails-draggable': 'no-drag' } as React.CSSProperties}
        className="flex items-center space-x-4"
      >
        {/* 窗口控制按钮 */}
        <div className="flex space-x-2">
          <button
            onClick={WindowMinimise}
            className="h-4 w-4 bg-yellow-400 rounded-full hover:bg-yellow-500"
          ></button>
          <button
            onClick={WindowToggleMaximise}
            className="h-4 w-4 bg-green-400 rounded-full hover:bg-green-500"
          ></button>
          <button
            onClick={Quit}
            className="h-4 w-4 bg-red-500 rounded-full hover:bg-red-600"
          ></button>
        </div>

        {/* UI 缩放下拉菜单 */}
        <Select value={uiScale} onValueChange={onScaleChange}>
          <SelectTrigger className="w-[120px] h-7 text-xs">
            <SelectValue placeholder="UI Scale" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="small">Small</SelectItem>
            <SelectItem value="default">Default</SelectItem>
            <SelectItem value="large">Large</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {/* 左侧区域（如果需要可以放 logo 或菜单） */}
      <div></div>
    </div>
  )
}
