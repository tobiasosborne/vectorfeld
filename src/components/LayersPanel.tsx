import { useState, useEffect, useCallback, type CSSProperties, type ReactNode } from 'react'
import { useEditor } from '../model/EditorContext'
import { AddElementCommand, RemoveElementCommand, ReorderElementCommand } from '../model/commands'
import { setActiveLayerElement } from '../model/activeLayer'
import { subscribeSelection } from '../model/selection'

interface LayerInfo {
  element: Element
  name: string
  visible: boolean
  locked: boolean
  /** Set on PDF imports whose source had its text outlined to paths
   *  (vectorfeld-cd2). Renders a warning glyph + tooltip in the panel. */
  mostlyOutlined: boolean
  textChars: number
  pathCount: number
}

// Kind-based thumb treatment matching design/atrium.jsx AtLayerNode
function LayerThumb({ kind }: { kind: string }) {
  const base: CSSProperties = {
    width: 20,
    height: 20,
    borderRadius: 4,
    boxShadow: kind === 'folder' ? 'none' : '0 0 0 1px var(--color-border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 11,
    color: 'var(--color-muted)',
    flexShrink: 0,
  }
  if (kind === 'folder') {
    return (
      <div style={base}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.2}>
          <path d="M2 4.5h4l1 1h7V13H2z" />
        </svg>
      </div>
    )
  }
  return <div style={base} />
}

export function LayersPanel() {
  const editor = useEditor()
  const [layers, setLayers] = useState<LayerInfo[]>([])
  const [activeLayerIdx, setActiveLayerIdx] = useState(0)

  const refreshLayers = useCallback(() => {
    if (!editor.doc) return
    const layerEls = editor.doc.getLayerElements()
    setLayers(
      layerEls.map((el) => ({
        element: el,
        name: el.getAttribute('data-layer-name') || 'Unnamed',
        visible: (el as SVGElement).style.display !== 'none',
        locked: el.getAttribute('data-locked') === 'true',
        mostlyOutlined: el.getAttribute('data-mostly-outlined') === 'true',
        textChars: parseInt(el.getAttribute('data-text-chars') || '0', 10),
        pathCount: parseInt(el.getAttribute('data-path-count') || '0', 10),
      })),
    )
  }, [editor.doc])

  useEffect(() => {
    refreshLayers()
    const unsubHistory = editor.history.subscribe(refreshLayers)
    const unsubSelection = subscribeSelection(refreshLayers)
    return () => { unsubHistory(); unsubSelection() }
  }, [refreshLayers, editor.history])

  useEffect(() => {
    if (layers[activeLayerIdx]) setActiveLayerElement(layers[activeLayerIdx].element)
  }, [activeLayerIdx, layers])

  const addLayer = () => {
    if (!editor.doc) return
    const svg = editor.doc.svg
    const overlay = svg.querySelector('[data-role="overlay"]')
    const cmd = new AddElementCommand(editor.doc, svg, 'g', {
      'data-layer-name': `Layer ${layers.length + 1}`,
    })
    editor.history.execute(cmd)
    const newLayer = cmd.getElement()
    if (newLayer && overlay) svg.insertBefore(newLayer, overlay)
    refreshLayers()
    setActiveLayerIdx(layers.length)
  }

  const deleteLayer = (idx: number) => {
    if (layers.length <= 1 || !editor.doc) return
    const cmd = new RemoveElementCommand(editor.doc, layers[idx].element)
    editor.history.execute(cmd)
    refreshLayers()
    if (activeLayerIdx >= layers.length - 1) setActiveLayerIdx(Math.max(0, layers.length - 2))
  }

  const toggleVisibility = (idx: number) => {
    const el = layers[idx].element as SVGElement
    el.style.display = el.style.display === 'none' ? '' : 'none'
    refreshLayers()
  }

  const toggleLock = (idx: number) => {
    const el = layers[idx].element
    if (el.getAttribute('data-locked') === 'true') el.removeAttribute('data-locked')
    else el.setAttribute('data-locked', 'true')
    refreshLayers()
  }

  const moveLayerUp = (idx: number) => {
    if (idx <= 0 || !editor.doc) return
    editor.history.execute(new ReorderElementCommand(layers[idx].element, layers[idx - 1].element, 'Move Layer Up'))
    refreshLayers()
    setActiveLayerIdx(idx - 1)
  }

  const moveLayerDown = (idx: number) => {
    if (idx >= layers.length - 1 || !editor.doc) return
    editor.history.execute(new ReorderElementCommand(layers[idx + 1].element, layers[idx].element, 'Move Layer Down'))
    refreshLayers()
    setActiveLayerIdx(idx + 1)
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        fontSize: 12,
      }}
    >
      {/* Header: Layers / Pages tabs + add */}
      <div style={{ padding: '12px 14px 8px', display: 'flex', gap: 2, alignItems: 'center' }}>
        {(['Layers', 'Pages'] as const).map((s, i) => (
          <button
            key={s}
            data-role={i === 0 ? 'layers-tab' : 'pages-tab'}
            style={{
              padding: '4px 10px',
              borderRadius: 999,
              border: 0,
              fontSize: 11.5,
              background: i === 0 ? 'var(--color-panel-solid)' : 'transparent',
              boxShadow: i === 0 ? '0 0 0 1px var(--color-border)' : 'none',
              color: i === 0 ? 'var(--color-text)' : 'var(--color-muted)',
              fontWeight: i === 0 ? 500 : 400,
              cursor: 'default',
            }}
          >
            {s}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button
          onClick={addLayer}
          title="Add layer"
          style={{ color: 'var(--color-faint)', border: 0, background: 'transparent', fontSize: 14, cursor: 'default' }}
        >
          +
        </button>
      </div>

      {/* Rows */}
      <div style={{ flex: 1, overflow: 'auto', padding: '0 6px 10px' }}>
        {layers.map((layer, idx) => {
          const active = activeLayerIdx === idx
          const rowBg: ReactNode = active ? 'var(--color-accent-tint)' : 'transparent'
          return (
            <div
              key={idx}
              onClick={() => setActiveLayerIdx(idx)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                height: 30,
                paddingLeft: 10,
                paddingRight: 8,
                borderRadius: 8,
                background: rowBg as string,
                color: active ? 'var(--color-accent-text)' : 'var(--color-text)',
                cursor: 'default',
              }}
            >
              <button
                onClick={(e) => { e.stopPropagation(); toggleVisibility(idx) }}
                title={layer.visible ? 'Hide' : 'Show'}
                style={{ width: 14, border: 0, background: 'transparent', color: 'var(--color-faint)', fontSize: 11, cursor: 'default' }}
              >
                {layer.visible ? '◉' : '◎'}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); toggleLock(idx) }}
                title={layer.locked ? 'Unlock' : 'Lock'}
                style={{ width: 14, border: 0, background: 'transparent', color: 'var(--color-faint)', fontSize: 11, cursor: 'default' }}
              >
                {layer.locked ? '\u{1F512}' : '\u{1F513}'}
              </button>
              <LayerThumb kind="folder" />
              <span
                style={{
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  fontWeight: active ? 500 : 400,
                }}
              >
                {layer.name}
              </span>
              {layer.mostlyOutlined && (
                <span
                  data-role="mostly-outlined-badge"
                  title={`This PDF has ${layer.pathCount} paths and only ${layer.textChars} editable text characters. The text was outlined to paths at PDF generation time and cannot be edited as text.`}
                  style={{ color: '#b07a00', userSelect: 'none' }}
                >
                  &#9888;
                </span>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); moveLayerUp(idx) }}
                disabled={idx === 0}
                title="Move up"
                style={{ width: 14, border: 0, background: 'transparent', color: idx === 0 ? 'var(--color-border)' : 'var(--color-faint)', fontSize: 10, cursor: 'default' }}
              >
                &#x25B2;
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); moveLayerDown(idx) }}
                disabled={idx === layers.length - 1}
                title="Move down"
                style={{ width: 14, border: 0, background: 'transparent', color: idx === layers.length - 1 ? 'var(--color-border)' : 'var(--color-faint)', fontSize: 10, cursor: 'default' }}
              >
                &#x25BC;
              </button>
              {layers.length > 1 && (
                <button
                  onClick={(e) => { e.stopPropagation(); deleteLayer(idx) }}
                  title="Delete layer"
                  style={{ border: 0, background: 'transparent', color: 'var(--color-faint)', fontSize: 11, cursor: 'default' }}
                >
                  ×
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
