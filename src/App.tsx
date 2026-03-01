import { useCallback, useRef, useState } from 'react'
import { Toolbar } from './components/Toolbar'
import { LayersPanel } from './components/LayersPanel'
import { Canvas } from './components/Canvas'
import type { CanvasState, DocumentDimensions } from './components/Canvas'
import { PropertiesPanel } from './components/PropertiesPanel'
import { StatusBar } from './components/StatusBar'
import { ArtboardDialog } from './components/ArtboardDialog'
import { EditorProvider, useEditor } from './model/EditorContext'
import { useToolShortcuts } from './tools/useToolShortcuts'
import { registerAllTools } from './tools/registerAllTools'
import { exportSvg, exportPdf, importSvg } from './model/fileio'

function AppContent() {
  useToolShortcuts()
  const editor = useEditor()
  const svgRef = useRef<SVGSVGElement | null>(null)
  const toolsRegistered = useRef(false)

  const handleSvgReady = useCallback((svg: SVGSVGElement) => {
    svgRef.current = svg
    editor.setSvg(svg)
    if (!toolsRegistered.current) {
      registerAllTools(
        () => svgRef.current,
        () => editor.doc,
        () => editor.history
      )
      toolsRegistered.current = true
    }
  }, [editor])

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
      <Toolbar
        onArtboardSetup={() => setShowArtboard(true)}
        onExportSvg={() => editor.doc && exportSvg(editor.doc)}
        onExportPdf={() => editor.doc && exportPdf(editor.doc)}
        onImportSvg={() => editor.doc && importSvg(editor.doc)}
      />
      <div className="flex flex-1 min-h-0">
        <LayersPanel />
        <Canvas
          dimensions={dimensions}
          onStateChange={handleCanvasState}
          onSvgReady={handleSvgReady}
        />
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

function App() {
  return (
    <EditorProvider>
      <AppContent />
    </EditorProvider>
  )
}

export default App
