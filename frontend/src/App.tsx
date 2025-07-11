import { useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { JsonToolsView } from './views/JsonToolsView'

function App() {
  const [activeTool, setActiveTool] = useState('fileSyncer')

  return (
    <div id="App" className="flex h-screen bg-secondary/30">
      <Sidebar activeTool={activeTool} onToolChange={setActiveTool} />
      <main className="flex-1 flex flex-col  overflow-hidden">
        {activeTool === 'FileSyncer' && (
          <div className="p-4">File Syncer View be here.</div>
        )}
        {/* 当 activeTool 是 'JsonTools' 时，渲染我们的新组件 */}
        {activeTool === 'JsonTools' && <JsonToolsView />}
      </main>
    </div>
  )
}

export default App
