import { useState, useEffect, useCallback } from 'react'
import { useEditor } from '../model/EditorContext'
import { generateId } from '../model/document'

interface LayerInfo {
  element: Element
  name: string
  visible: boolean
  locked: boolean
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
      }))
    )
  }, [editor.doc])

  useEffect(() => {
    refreshLayers()
    // Refresh on interval to pick up DOM changes
    const interval = setInterval(refreshLayers, 500)
    return () => clearInterval(interval)
  }, [refreshLayers])

  const addLayer = () => {
    if (!editor.doc) return
    const svg = editor.doc.svg
    const overlay = svg.querySelector('[data-role="overlay"]')
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    g.setAttribute('data-layer-name', `Layer ${layers.length + 1}`)
    g.setAttribute('id', generateId())
    // Insert before overlay
    if (overlay) {
      svg.insertBefore(g, overlay)
    } else {
      svg.appendChild(g)
    }
    refreshLayers()
    setActiveLayerIdx(layers.length)
  }

  const deleteLayer = (idx: number) => {
    if (layers.length <= 1) return // always keep at least one layer
    const layer = layers[idx]
    layer.element.remove()
    refreshLayers()
    if (activeLayerIdx >= layers.length - 1) {
      setActiveLayerIdx(Math.max(0, layers.length - 2))
    }
  }

  const toggleVisibility = (idx: number) => {
    const el = layers[idx].element as SVGElement
    if (el.style.display === 'none') {
      el.style.display = ''
    } else {
      el.style.display = 'none'
    }
    refreshLayers()
  }

  const toggleLock = (idx: number) => {
    const el = layers[idx].element
    if (el.getAttribute('data-locked') === 'true') {
      el.removeAttribute('data-locked')
    } else {
      el.setAttribute('data-locked', 'true')
    }
    refreshLayers()
  }

  return (
    <div className="w-48 bg-chrome-50 border-r border-chrome-300 flex flex-col">
      <div className="h-8 bg-chrome-100 border-b border-chrome-200 flex items-center px-2 justify-between">
        <span className="text-xs font-medium text-chrome-600 select-none">Layers</span>
        <button
          onClick={addLayer}
          className="text-xs text-chrome-500 hover:text-chrome-800 px-1"
          title="Add Layer"
        >
          +
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {layers.map((layer, idx) => (
          <div
            key={idx}
            className={`flex items-center gap-1 px-2 py-1 text-xs cursor-pointer border-b border-chrome-200 ${
              activeLayerIdx === idx
                ? 'bg-accent/10 text-accent'
                : 'text-chrome-600 hover:bg-chrome-100'
            }`}
            onClick={() => setActiveLayerIdx(idx)}
          >
            <button
              onClick={(e) => { e.stopPropagation(); toggleVisibility(idx) }}
              className="w-4 text-center"
              title={layer.visible ? 'Hide' : 'Show'}
            >
              {layer.visible ? '\u25C9' : '\u25CE'}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); toggleLock(idx) }}
              className="w-4 text-center"
              title={layer.locked ? 'Unlock' : 'Lock'}
            >
              {layer.locked ? '\u{1F512}' : '\u{1F513}'}
            </button>
            <span className="flex-1 truncate select-none">{layer.name}</span>
            {layers.length > 1 && (
              <button
                onClick={(e) => { e.stopPropagation(); deleteLayer(idx) }}
                className="text-chrome-400 hover:text-red-500"
                title="Delete Layer"
              >
                x
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
