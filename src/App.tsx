import { useCallback, useRef, useState, useEffect } from 'react'
import { TopBar } from './components/TopBar'
import { LeftRail } from './components/LeftRail'
import { Canvas } from './components/Canvas'
import type { CanvasState, DocumentDimensions } from './components/Canvas'
import { InspectorPanel } from './components/InspectorPanel'
import { StatusBar } from './components/StatusBar'
import { ArtboardDialog } from './components/ArtboardDialog'
import { Panel } from './components/Panel'
import { EditorProvider, useEditor } from './model/EditorContext'
import { useToolShortcuts } from './tools/useToolShortcuts'
import { registerAllTools } from './tools/registerAllTools'
import { exportSvg, exportPdf, exportPng, importSvg, placeImage } from './model/fileio'
import { toggleGridVisible } from './model/grid'
import { toggleWireframe } from './model/wireframe'
import { addGuide, clearAllGuides } from './model/guides'
import { computeReflectH, computeReflectV } from './model/reflect'
import { getSelection, subscribeSelection, refreshOverlay, clearSelection } from './model/selection'
import { ModifyAttributeCommand, CompoundCommand, AddElementCommand, RemoveElementCommand, ReorderElementCommand } from './model/commands'
import { elementToPathD, extractStyleAttrs } from './model/shapeToPath'
import { joinPaths } from './model/pathOps'
import { importPdf, importPdfAsBackgroundLayer } from './model/pdfImport'
import { bringForward, sendBackward, bringToFront, sendToBack } from './model/zOrder'
import { HRuler, VRuler } from './components/Ruler'
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
  const [canvasState, setCanvasState] = useState<CanvasState>({
    cursorX: 0,
    cursorY: 0,
    zoomPercent: 100,
    viewBox: { x: 0, y: 0, width: 210, height: 297 },
  })
  const canvasContainerRef = useRef<HTMLDivElement>(null)
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 })

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null)
  const [selCount, setSelCount] = useState(0)
  useEffect(() => {
    const update = () => setSelCount(getSelection().length)
    update()
    return subscribeSelection(update)
  }, [])

  // TopBar: single-doc tab stub. Active name stays "Untitled" until
  // PDF/SVG imports surface a filename (vectorfeld-4w7 lights that up).
  // Dirty = history has an undoable command.
  const activeDocName = 'Untitled'
  const [dirty, setDirty] = useState(editor.history.canUndo)
  useEffect(() => {
    const update = () => setDirty(editor.history.canUndo)
    update()
    return editor.history.subscribe(update)
  }, [editor.history])

  // Track canvas container size for rulers
  useEffect(() => {
    const el = canvasContainerRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setCanvasSize({ width: entry.contentRect.width, height: entry.contentRect.height })
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

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
          editor.history.execute(new ReorderElementCommand(el, null, 'Bring to Front'))
          refreshOverlay()
        }
      }, disabled: sel.length !== 1 },
      { label: 'Send to Back', action: () => {
        const s = getSelection()
        if (s.length === 1) {
          const el = s[0]
          const parent = el.parentElement
          if (parent && parent.firstElementChild !== el) {
            editor.history.execute(new ReorderElementCommand(el, parent.firstElementChild, 'Send to Back'))
            refreshOverlay()
          }
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
        { label: 'Open PDF...', shortcut: '', action: () => editor.doc && importPdf(editor.doc) },
        { label: 'Open PDF as Background Layer...', shortcut: '', action: () => editor.doc && importPdfAsBackgroundLayer(editor.doc) },
        { label: 'Place Image...', shortcut: '', action: () => editor.doc && placeImage(editor.doc, editor.history) },
        { separator: true, label: '' },
        { label: 'Export SVG', shortcut: '', action: () => editor.doc && exportSvg(editor.doc) },
        { label: 'Export PDF', shortcut: '', action: () => editor.doc && exportPdf(editor.doc) },
        { label: 'Export PNG', shortcut: '', action: () => editor.doc && exportPng(editor.doc) },
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
      ],
    },
    {
      label: 'Object',
      items: [
        { label: 'Flip Horizontal', shortcut: '', disabled: selCount === 0, action: () => applyReflect(computeReflectH) },
        { label: 'Flip Vertical', shortcut: '', disabled: selCount === 0, action: () => applyReflect(computeReflectV) },
        { separator: true, label: '' },
        { label: 'Bring to Front', shortcut: 'Ctrl+Shift+]', disabled: selCount === 0, action: () => editor.history && bringToFront(editor.history) },
        { label: 'Bring Forward', shortcut: 'Ctrl+]', disabled: selCount === 0, action: () => editor.history && bringForward(editor.history) },
        { label: 'Send Backward', shortcut: 'Ctrl+[', disabled: selCount === 0, action: () => editor.history && sendBackward(editor.history) },
        { label: 'Send to Back', shortcut: 'Ctrl+Shift+[', disabled: selCount === 0, action: () => editor.history && sendToBack(editor.history) },
        { separator: true, label: '' },
        { label: 'Convert to Path', shortcut: '', disabled: selCount === 0, action: () => {
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
        { label: 'Join Paths', shortcut: '', disabled: selCount !== 2, action: () => {
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
    <div
      id="app"
      style={{
        position: 'relative',
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        background: 'var(--color-bg)',
        color: 'var(--color-text)',
      }}
    >
      {/* Canvas root — radial gradient background, fills the viewport, rulers + SVG mount inside */}
      <div
        data-role="canvas-root"
        style={{
          position: 'absolute',
          inset: 0,
          overflow: 'hidden',
          background: 'radial-gradient(circle at 70% 30%, var(--color-panel-solid), var(--color-canvas-tint))',
        }}
      >
        {/* Ruler + canvas inner grid — sits inside the canvas region, below the TopBar zone */}
        <div
          style={{
            position: 'absolute',
            top: 66,
            left: 78,
            right: 306,
            bottom: 60,
            display: 'grid',
            gridTemplate: '"corner hruler" 14px "vruler canvas" 1fr / 14px 1fr',
          }}
        >
          <div style={{ gridArea: 'corner' }} />
          <div style={{ gridArea: 'hruler', overflow: 'hidden', opacity: 0.6 }}>
            <HRuler viewBox={canvasState.viewBox} canvasSize={canvasSize.width} cursorPos={canvasState.cursorX} />
          </div>
          <div style={{ gridArea: 'vruler', overflow: 'hidden', opacity: 0.6 }}>
            <VRuler viewBox={canvasState.viewBox} canvasSize={canvasSize.height} cursorPos={canvasState.cursorY} />
          </div>
          <div ref={canvasContainerRef} style={{ gridArea: 'canvas', overflow: 'hidden' }}>
            <Canvas
              dimensions={dimensions}
              onStateChange={handleCanvasState}
              onSvgReady={handleSvgReady}
              onContextMenu={handleContextMenu}
            />
          </div>
        </div>
      </div>

      {/* TopBar — floating card with brand, menus, single-doc tab stub, Export PDF.
          overflow:visible is load-bearing so menu dropdowns can extend below the bar. */}
      <Panel
        data-testid="topbar"
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          right: 12,
          height: 44,
          zIndex: 4,
          display: 'flex',
          alignItems: 'center',
          padding: '0 8px',
          overflow: 'visible',
        }}
      >
        <TopBar
          menus={menus}
          activeDocName={activeDocName}
          dirty={dirty}
          onExportPdf={() => editor.doc && exportPdf(editor.doc)}
        />
      </Panel>
      {/* LeftRail — tool palette */}
      <Panel
        data-testid="leftrail"
        style={{
          position: 'absolute',
          left: 12,
          top: 72,
          width: 58,
          zIndex: 3,
          padding: 6,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        <LeftRail />
      </Panel>

      {/* Inspector — selection header + Frame + Style + merged Layers tab */}
      <Panel
        data-testid="inspector"
        style={{
          position: 'absolute',
          right: 12,
          top: 72,
          bottom: 60,
          width: 286,
          zIndex: 3,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <InspectorPanel />
      </Panel>

      {/* StatusBar — floating pill at bottom */}
      <Panel
        data-testid="statusbar"
        style={{
          position: 'absolute',
          bottom: 12,
          left: 12,
          right: 12,
          height: 40,
          zIndex: 4,
          display: 'flex',
          alignItems: 'center',
          padding: '0 14px',
        }}
      >
        <StatusBar
          cursorX={canvasState.cursorX}
          cursorY={canvasState.cursorY}
          zoomPercent={canvasState.zoomPercent}
        />
      </Panel>

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
