import { useState } from 'react'

import { Button } from '@/components/ui/button'

// 从 lucide-react 导入图标
import {
  FolderDown,
  ChevronsRight,
  ChevronLeft,
  FileJson2,
  TerminalIcon,
  TerminalSquare,
  TrainFrontTunnel,
} from 'lucide-react'

// 在 TypeScript 中，我们为组件的 props 定义一个接口(interface)，
// 这类似于 Vue 的 defineProps，但类型更严格，IDE提示更友好。
interface SidebarProps {
  // 当前激活的工具 ID
  activeTool: string
  // 用于通知父组件工具已经变更
  onToolChange: (toolId: string) => void
}

// React 组件是一个函数，它通过解构赋值接收 props
export function Sidebar({ activeTool, onToolChange }: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)

  const tools = [
    { id: 'FileSyncer', name: 'File Syncer', icon: FolderDown },
    { id: 'JsonTools', name: 'JSON Tools', icon: FileJson2 },
    { id: 'SshGate', name: 'SSH Gate', icon: TerminalSquare },
    { id: 'Tunnel', name: 'SSH Tunnel', icon: TrainFrontTunnel },
    { id: 'Terminal', name: 'Terminal', icon: TerminalIcon },
    // 这里可以添加更多工具
  ]
  return (
    // `class` 在 JSX 中必须写成 `className`
    <aside
      // 动态 className：使用模板字符串和三元运算符，比 v-bind:class 更直接
      className={`bg-background p-2 flex flex-col shadow-lg transition-all duration-300  ease-in-out select-none ${isCollapsed ? 'w-16' : 'w-56'}`}
    >
      {/* 工具栏按钮 */}
      <div className="flex flex-col flex-grow">
        {/* React 中没有 v-for，我们使用标准的 JavaScript .map() 数组方法 */}
        {/* .map 会遍历 tools 数组，并为每个 tool 对象返回一个 <Button> JSX 元素 */}
        {tools.map((tool) => (
          <Button
            key={tool.id}
            variant={activeTool === tool.id ? 'secondary' : 'ghost'}
            size="lg"
            className={`w-full my-1 flex items-center ${isCollapsed ? 'justify-center' : 'justify-start'}`}
            onClick={() => onToolChange(tool.id)}
            title={tool.name}
          >
            {/* 在JSX中，我们可以直接使用变量(函数)作为组件 */}
            <tool.icon className="h-6 w-6 flex-shrink-0" />

            {/* React 中没有 v-if，我们使用JS的逻辑与(&&)操作符 */}
            {/* 如果 !isCollapsed 为 true，则渲染后面的 <span> */}
            {!isCollapsed && (
              <span className="ml-4 font-semibold text-sm whitespace-nowrap transition-all duration-200 ${isCollapsed ? 'w-0 opacity-0 ml-0' : 'w-auto opacity-100 ml-4'}">
                {tool.name}
              </span>
            )}
          </Button>
        ))}
      </div>

      {/* 底部收起/展开按钮 */}
      <div className="mt-auto gap-y-2">
        {/* 收起/展开按钮 */}

        {isCollapsed ? (
          // --- 收起状态下的按钮 ---
          <Button
            variant="ghost"
            size="icon" // 使用专门的图标按钮尺寸
            className="w-full h-12" // 给一个固定的高度
            onClick={() => setIsCollapsed(false)}
            title="Expand sidebar"
          >
            <ChevronsRight className="h-6 w-6" />
          </Button>
        ) : (
          // --- 展开状态下的按钮 ---
          <Button
            variant="ghost"
            size="lg"
            className="w-full my-1 flex items-center justify-start gap-3"
            onClick={() => setIsCollapsed(true)}
            title="Collapse sidebar"
          >
            <ChevronLeft className="h-full" />
            <span className="font-semibold text-sm whitespace-nowrap">
              Collapse
            </span>
          </Button>
        )}
      </div>
    </aside>
  )
}
