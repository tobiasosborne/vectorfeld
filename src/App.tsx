import { useCallback, useRef, useState } from 'react'
import { MenuBar } from './components/MenuBar'
import { ToolStrip } from './components/ToolStrip'
import { LayersPanel } from './components/LayersPanel'
import { Canvas } from './components/Canvas'
import type { CanvasState, DocumentDimensions } from './components/Canvas'
import { PropertiesPanel } from './components/PropertiesPanel'
import { StatusBar } from './components/StatusBar'
import { ControlBar } from './components/ControlBar'
import { ArtboardDialog } from './components/ArtboardDialog'
import { EditorProvider, useEditor } from './model/EditorContext'
import { useToolShortcuts } from './tools/useToolShortcuts'
import { registerAllTools } from './tools/registerAllTools'
import { exportSvg, exportPdf, exportPng, exportTikz, importSvg, placeImage } from './model/fileio'
import { toggleGridVisible } from './model/grid'
import { toggleWireframe } from './model/wireframe'
import { addGuide, clearAllGuides } from './model/guides'
import { computeReflectH, computeReflectV } from './model/reflect'
import { getSelection, refreshOverlay, clearSelection } from './model/selection'
import { ModifyAttributeCommand, CompoundCommand, AddElementCommand, RemoveElementCommand } from './model/commands'
import { makeClippingMask, releaseClippingMask, hasClipPath } from './model/clipping'
import { elementToPathD, extractStyleAttrs } from './model/shapeToPath'
import { joinPaths } from './model/pathOps'
import { ContextMenu } from './components/ContextMenu'
import type { ContextMenuItem } from './components/ContextMenu'

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

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null)

  const handleCanvasState = useCallback((state: CanvasState) => {
    setCanvasState(state)
  }, [])

  const applyReflect = useCallback((computeFn: (el: Element) => Array<[string, string]>) => {
    const sel = getSelection()
    if (sel.length === 0) return
    const cmds: ModifyAttributeCommand[] = []
    for (const el of sel) {
      const changes = computeFn(el)
      for (const [attr, val] of changes) {
        cmds.push(new ModifyAttributeCommand(el, attr, val))
      }
    }
    if (cmds.length > 0) {
      editor.history.execute(new CompoundCommand(cmds, 'Reflect'))
      refreshOverlay()
    }
  }, [editor.history])

  const handleContextMenu = useCallback((e: MouseEvent) => {
    const sel = getSelection()
    const hasSelection = sel.length > 0
    const items: ContextMenuItem[] = [
      { label: 'Delete', action: () => {
        const s = getSelection()
        if (s.length > 0 && editor.doc) {
          const cmds = s.map(el => new RemoveElementCommand(editor.doc!, el))
          editor.history.execute(new CompoundCommand(cmds, 'Delete'))
          clearSelection()
        }
      }, disabled: !hasSelection },
      { label: '', action: () => {}, separator: true },
      { label: 'Bring to Front', action: () => {
        const s = getSelection()
        if (s.length === 1) {
          const el = s[0]
          const parent = el.parentElement
          if (parent) parent.appendChild(el)
          refreshOverlay()
        }
      }, disabled: sel.length !== 1 },
      { label: 'Send to Back', action: () => {
        const s = getSelection()
        if (s.length === 1) {
          const el = s[0]
          const parent = el.parentElement
          if (parent && parent.firstChild) parent.insertBefore(el, parent.firstChild)
          refreshOverlay()
        }
      }, disabled: sel.length !== 1 },
      { label: '', action: () => {}, separator: true },
      { label: 'Flip Horizontal', action: () => applyReflect(computeReflectH), disabled: !hasSelection },
      { label: 'Flip Vertical', action: () => applyReflect(computeReflectV), disabled: !hasSelection },
    ]
    setContextMenu({ x: e.clientX, y: e.clientY, items })
  }, [editor, applyReflect])

  const menus = [
    {
      label: 'File',
      items: [
        { label: 'Open SVG...', shortcut: '', action: () => editor.doc && importSvg(editor.doc) },
        { label: 'Place Image...', shortcut: '', action: () => editor.doc && placeImage(editor.doc, editor.history) },
        { separator: true, label: '' },
        { label: 'Export SVG', shortcut: '', action: () => editor.doc && exportSvg(editor.doc) },
        { label: 'Export PDF', shortcut: '', action: () => editor.doc && exportPdf(editor.doc) },
        { label: 'Export PNG', shortcut: '', action: () => editor.doc && exportPng(editor.doc) },
        { label: 'Export TikZ', shortcut: '', action: () => editor.doc && exportTikz(editor.doc) },
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
        { label: 'Outline Mode', shortcut: '', action: () => toggleWireframe() },
        { separator: true, label: '' },
        { label: 'Add Horizontal Guide...', shortcut: '', action: () => {
          const pos = prompt('Guide position (mm):')
          if (pos !== null && !isNaN(Number(pos))) addGuide('h', Number(pos))
        }},
        { label: 'Add Vertical Guide...', shortcut: '', action: () => {
          const pos = prompt('Guide position (mm):')
          if (pos !== null && !isNaN(Number(pos))) addGuide('v', Number(pos))
        }},
        { label: 'Clear All Guides', shortcut: '', action: () => clearAllGuides() },
        { separator: true, label: '' },
        { label: 'Toggle Layers Panel', shortcut: '', action: () => setLayersCollapsed((c) => !c) },
        { label: 'Toggle Properties Panel', shortcut: '', action: () => setPropsCollapsed((c) => !c) },
      ],
    },
    {
      label: 'Object',
      items: [
        { label: 'Flip Horizontal', shortcut: '', action: () => applyReflect(computeReflectH) },
        { label: 'Flip Vertical', shortcut: '', action: () => applyReflect(computeReflectV) },
        { separator: true, label: '' },
        { label: 'Make Clipping Mask', shortcut: '', action: () => {
          const sel = getSelection()
          if (sel.length === 2 && editor.doc) {
            makeClippingMask(editor.doc, editor.history, sel)
            clearSelection()
          }
        }},
        { label: 'Release Clipping Mask', shortcut: '', action: () => {
          const sel = getSelection()
          if (sel.length === 1 && hasClipPath(sel[0]) && editor.doc) {
            releaseClippingMask(editor.doc, editor.history, sel[0])
            clearSelection()
          }
        }},
        { separator: true, label: '' },
        { label: 'Convert to Path', shortcut: '', action: () => {
          const sel = getSelection()
          if (sel.length === 0 || !editor.doc) return
          const cmds: Array<{ execute(): void; undo(): void; description: string }> = []
          for (const el of sel) {
            if (el.tagName === 'path') continue
            const d = elementToPathD(el)
            if (!d) continue
            const parent = el.parentElement
            if (!parent) continue
            const styleAttrs = extractStyleAttrs(el)
            cmds.push(new RemoveElementCommand(editor.doc, el))
            cmds.push(new AddElementCommand(editor.doc, parent, 'path', { ...styleAttrs, d }))
          }
          if (cmds.length > 0) {
            editor.history.execute(new CompoundCommand(cmds, 'Convert to Path'))
            clearSelection()
          }
        }},
        { label: 'Join Paths', shortcut: '', action: () => {
          const sel = getSelection()
          if (sel.length !== 2 || !editor.doc) return
          if (sel[0].tagName !== 'path' || sel[1].tagName !== 'path') return
          const d1 = sel[0].getAttribute('d') || ''
          const d2 = sel[1].getAttribute('d') || ''
          const joinedD = joinPaths(d1, d2)
          const parent = sel[0].parentElement
          if (!parent) return
          const styleAttrs = extractStyleAttrs(sel[0])
          const cmds = [
            new RemoveElementCommand(editor.doc, sel[0]),
            new RemoveElementCommand(editor.doc, sel[1]),
            new AddElementCommand(editor.doc, parent, 'path', { ...styleAttrs, d: joinedD }),
          ]
          editor.history.execute(new CompoundCommand(cmds, 'Join Paths'))
          clearSelection()
        }},
      ],
    },
  ]

  return (
    <div id="app" className="h-screen w-screen flex flex-col">
      <MenuBar menus={menus} />
      <ControlBar />
      <div className="flex flex-1 min-h-0">
        <ToolStrip />
        <Canvas
          dimensions={dimensions}
          onStateChange={handleCanvasState}
          onSvgReady={handleSvgReady}
          onContextMenu={handleContextMenu}
        />
        <div className="flex flex-col border-l border-chrome-300">
          {propsCollapsed ? (
            <div
              className="h-6 bg-chrome-100 border-b border-chrome-300 flex items-center justify-center cursor-pointer hover:bg-chrome-200"
              onClick={() => setPropsCollapsed(false)}
              title="Show Properties"
            >
              <span className="text-xs text-chrome-500 select-none">Properties &raquo;</span>
            </div>
          ) : (
            <div className="relative flex-1 min-h-0">
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
          {layersCollapsed ? (
            <div
              className="h-6 bg-chrome-100 border-t border-chrome-300 flex items-center justify-center cursor-pointer hover:bg-chrome-200"
              onClick={() => setLayersCollapsed(false)}
              title="Show Layers"
            >
              <span className="text-xs text-chrome-500 select-none">Layers &raquo;</span>
            </div>
          ) : (
            <div className="relative border-t border-chrome-300">
              <LayersPanel />
              <button
                className="absolute top-0 left-0 w-4 h-4 text-xs text-chrome-400 hover:text-chrome-700"
                onClick={() => setLayersCollapsed(true)}
                title="Collapse"
              >
                &raquo;
              </button>
            </div>
          )}
        </div>
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
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
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
