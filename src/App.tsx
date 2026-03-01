import { Toolbar } from './components/Toolbar'
import { LayersPanel } from './components/LayersPanel'
import { Canvas } from './components/Canvas'
import { PropertiesPanel } from './components/PropertiesPanel'
import { StatusBar } from './components/StatusBar'

function App() {
  return (
    <div id="app" className="h-screen w-screen flex flex-col">
      <Toolbar />
      <div className="flex flex-1 min-h-0">
        <LayersPanel />
        <Canvas />
        <PropertiesPanel />
      </div>
      <StatusBar />
    </div>
  )
}

export default App
