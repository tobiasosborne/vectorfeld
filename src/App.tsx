import { useCallback, useRef, useState } from 'react'
import { MenuBar } from './components/MenuBar'
import { ToolStrip } from './components/ToolStrip'
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
import { toggleGridVisible } from './model/grid'

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
  const [layersCollapsed, setLayersCollapsed] = useState(false)
  const [propsCollapsed, setPropsCollapsed] = useState(false)
  const [canvasState, setCanvasState] = useState<CanvasState>({
    cursorX: 0,
    cursorY: 0,
    zoomPercent: 100,
  })

  const handleCanvasState = useCallback((state: CanvasState) => {
    setCanvasState(state)
  }, [])

  const menus = [
    {
      label: 'File',
      items: [
        { label: 'Open SVG...', shortcut: '', action: () => editor.doc && importSvg(editor.doc) },
        { label: 'Export SVG', shortcut: '', action: () => editor.doc && exportSvg(editor.doc) },
        { label: 'Export PDF', shortcut: '', action: () => editor.doc && exportPdf(editor.doc) },
        { separator: true, label: '' },
        { label: 'Document Setup...', shortcut: '', action: () => setShowArtboard(true) },
      ],
    },
    {
      label: 'Edit',
      items: [
        { label: 'Undo', shortcut: 'Ctrl+Z', action: () => editor.history.undo() },
        { label: 'Redo', shortcut: 'Ctrl+Shift+Z', action: () => editor.history.redo() },
      ],
    },
    {
      label: 'View',
      items: [
        { label: 'Toggle Grid', shortcut: "Ctrl+'", action: () => toggleGridVisible() },
        { separator: true, label: '' },
        { label: 'Toggle Layers Panel', shortcut: '', action: () => setLayersCollapsed((c) => !c) },
        { label: 'Toggle Properties Panel', shortcut: '', action: () => setPropsCollapsed((c) => !c) },
      ],
    },
  ]

  return (
    <div id="app" className="h-screen w-screen flex flex-col">
      <MenuBar menus={menus} />
      <div className="flex flex-1 min-h-0">
        <ToolStrip />
        {layersCollapsed ? (
          <div
            className="w-6 bg-chrome-100 border-r border-chrome-300 flex items-center justify-center cursor-pointer hover:bg-chrome-200"
            onClick={() => setLayersCollapsed(false)}
            title="Show Layers"
          >
            <span className="text-xs text-chrome-500 select-none" style={{ writingMode: 'vertical-rl' }}>Layers</span>
          </div>
        ) : (
          <div className="relative">
            <LayersPanel />
            <button
              className="absolute top-0 right-0 w-4 h-4 text-xs text-chrome-400 hover:text-chrome-700"
              onClick={() => setLayersCollapsed(true)}
              title="Collapse"
            >
              &laquo;
            </button>
          </div>
        )}
        <Canvas
          dimensions={dimensions}
          onStateChange={handleCanvasState}
          onSvgReady={handleSvgReady}
        />
        {propsCollapsed ? (
          <div
            className="w-6 bg-chrome-100 border-l border-chrome-300 flex items-center justify-center cursor-pointer hover:bg-chrome-200"
            onClick={() => setPropsCollapsed(false)}
            title="Show Properties"
          >
            <span className="text-xs text-chrome-500 select-none" style={{ writingMode: 'vertical-rl' }}>Properties</span>
          </div>
        ) : (
          <div className="relative">
            <PropertiesPanel />
            <button
              className="absolute top-0 left-0 w-4 h-4 text-xs text-chrome-400 hover:text-chrome-700"
              onClick={() => setPropsCollapsed(true)}
              title="Collapse"
            >
              &raquo;
            </button>
          </div>
        )}
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
