import { useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { JsonToolsView } from './views/JsonToolsView'
import { FileSyncerView } from './views/FileSyncerView'

const toolComponents = [
  { id: 'FileSyncer', component: FileSyncerView },
  { id: 'JsonTools', component: JsonToolsView },
]

function App() {
  const [activeTool, setActiveTool] = useState('FileSyncer')

  return (
    <div id="App" className="flex h-screen bg-secondary/30">
      <Sidebar activeTool={activeTool} onToolChange={setActiveTool} />
      <main className="flex-1 flex flex-col  overflow-hidden relative">
        {toolComponents.map(({ id, component: ToolComponent }) => (
          <div
            key={id}
            // 使用 hidden 属性来控制显示与隐藏，保留组件状态
            hidden={activeTool !== id}
            // 使用绝对定位让所有隐藏的 div 堆叠在一起，不影响布局
            // 激活的 div 会正常显示
            className="absolute inset-0 h-full w-full"
          >
            {/* 在JSX中，我们可以直接使用一个大写字母开头的变量来渲染对应的组件
            这是一个非常强大的动态渲染模式*/}
            <ToolComponent />
          </div>
        ))}
      </main>
    </div>
  )
}

export default App
