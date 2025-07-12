import React, { useEffect, useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { JsonToolsView } from './views/JsonToolsView'
import { FileSyncerView } from './views/FileSyncerView'
import { TitleBar } from './components/TitleBar'
import { EventsOn } from '../wailsjs/runtime/runtime'

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

  useEffect(() => {
    const handler = (newScale: UiScale) => {
      console.log('Zoom event received from Go:', newScale)
      setUiScale(newScale)
    }
    EventsOn('zoom_change', handler)

    return () => {
      // 清理事件监听器
      EventsOn('zoom_change', () => {}) // 取消订阅事件，传递一个空函数
    }
  }, [])

  return (
    <div id="App" className="w-screen h-screen bg-transparent">
      <div className="w-full h-full flex flex-col rounded-lg overflow-hidden bg-background text-foreground">
        {/* 将缩放状态和更新函数传递给 TitleBar */}
        <TitleBar uiScale={uiScale} onScaleChange={setUiScale} />
        {/* 主内容区 */}
        <div className="flex flex-grow overflow-hidden">
          <Sidebar activeTool={activeTool} onToolChange={setActiveTool} />
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
