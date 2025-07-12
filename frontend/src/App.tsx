import React, { useEffect, useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { JsonToolsView } from './views/JsonToolsView'
import { FileSyncerView } from './views/FileSyncerView'
import { WindowToggleMaximise } from '../wailsjs/runtime/runtime'

export type UiScale = 'small' | 'default' | 'large'

const toolComponents = [
  { id: 'FileSyncer', component: FileSyncerView },

  { id: 'JsonTools', component: JsonToolsView },
]

function App() {
  const [activeTool, setActiveTool] = useState('FileSyncer')

  const [uiScale, setUiScale] = useState<UiScale>('default')

  useEffect(() => {
    const htmlEl = document.documentElement
    let fontSize = '16px'
    switch (uiScale) {
      case 'small':
        fontSize = '12px'
        break
      case 'large':
        fontSize = '16px'
        break
      default:
        fontSize = '14px'
    }
    htmlEl.style.fontSize = fontSize
  }, [uiScale])

  return (
    <div id="App" className="w-screen h-screen bg-transparent">
      <div className="w-full h-full flex flex-col rounded-lg overflow-hidden bg-background text-foreground">
        {/* 将缩放状态和更新函数传递给 TitleBar */}
        {/* <TitleBar uiScale={uiScale} onScaleChange={setUiScale} /> */}
        {/* 在这里创建一个 div 作为可拖拽的标题栏区域和顶部留白 */}
        <div
          className="h-8 w-full flex-shrink-0"
          style={{ '--wails-draggable': 'drag' } as React.CSSProperties}
          onDoubleClick={WindowToggleMaximise}
        ></div>
        {/* 主内容区 */}
        <div className="flex flex-grow overflow-hidden">
          <Sidebar
            activeTool={activeTool}
            onToolChange={setActiveTool}
            uiScale={uiScale}
            onScaleChange={setUiScale}
          />
          <main className="flex-1 flex flex-col overflow-hidden relative">
            {toolComponents.map(({ id, component: ToolComponent }) => (
              <div
                key={id}
                hidden={activeTool !== id}
                className="absolute inset-0 h-full w-full"
              >
                <ToolComponent />
              </div>
            ))}
          </main>
        </div>
      </div>
    </div>
  )
}

export default App
