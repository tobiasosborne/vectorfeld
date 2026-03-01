import { useCallback, useState } from 'react'
import { Toolbar } from './components/Toolbar'
import { LayersPanel } from './components/LayersPanel'
import { Canvas } from './components/Canvas'
import type { CanvasState, DocumentDimensions } from './components/Canvas'
import { PropertiesPanel } from './components/PropertiesPanel'
import { StatusBar } from './components/StatusBar'
import { ArtboardDialog } from './components/ArtboardDialog'

function App() {
  const [dimensions, setDimensions] = useState<DocumentDimensions>({ width: 210, height: 297 })
  const [showArtboard, setShowArtboard] = useState(false)
  const [canvasState, setCanvasState] = useState<CanvasState>({
    cursorX: 0,
    cursorY: 0,
    zoomPercent: 100,
  })

  const handleCanvasState = useCallback((state: CanvasState) => {
    setCanvasState(state)
  }, [])

  return (
    <div id="app" className="h-screen w-screen flex flex-col">
      <Toolbar onArtboardSetup={() => setShowArtboard(true)} />
      <div className="flex flex-1 min-h-0">
        <LayersPanel />
        <Canvas dimensions={dimensions} onStateChange={handleCanvasState} />
        <PropertiesPanel />
      </div>
      <StatusBar
        cursorX={canvasState.cursorX}
        cursorY={canvasState.cursorY}
        zoomPercent={canvasState.zoomPercent}
      />
      {showArtboard && (
        <ArtboardDialog
          dimensions={dimensions}
          onApply={setDimensions}
          onClose={() => setShowArtboard(false)}
        />
      )}
    </div>
  )
}

export default App
