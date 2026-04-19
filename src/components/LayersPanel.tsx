import { useState, useEffect, useCallback } from 'react'
import { useEditor } from '../model/EditorContext'
import { AddElementCommand, RemoveElementCommand, ReorderElementCommand } from '../model/commands'
import { setActiveLayerElement } from '../model/activeLayer'
import { subscribeSelection } from '../model/selection'

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
    const unsubHistory = editor.history.subscribe(refreshLayers)
    const unsubSelection = subscribeSelection(refreshLayers)
    return () => { unsubHistory(); unsubSelection() }
  }, [refreshLayers, editor.history])

  // Sync active layer element to the model whenever activeLayerIdx or layers change
  useEffect(() => {
    if (layers[activeLayerIdx]) {
      setActiveLayerElement(layers[activeLayerIdx].element)
    }
  }, [activeLayerIdx, layers])

  const addLayer = () => {
    if (!editor.doc) return
    const svg = editor.doc.svg
    const overlay = svg.querySelector('[data-role="overlay"]')
    const cmd = new AddElementCommand(editor.doc, svg, 'g', {
      'data-layer-name': `Layer ${layers.length + 1}`,
    })
    editor.history.execute(cmd)
    // Move the new layer before overlay elements
    const newLayer = cmd.getElement()
    if (newLayer && overlay) {
      svg.insertBefore(newLayer, overlay)
    }
    refreshLayers()
    setActiveLayerIdx(layers.length)
  }

  const deleteLayer = (idx: number) => {
    if (layers.length <= 1 || !editor.doc) return
    const cmd = new RemoveElementCommand(editor.doc, layers[idx].element)
    editor.history.execute(cmd)
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

  const moveLayerUp = (idx: number) => {
    if (idx <= 0 || !editor.doc) return
    const current = layers[idx].element
    const above = layers[idx - 1].element
    editor.history.execute(new ReorderElementCommand(current, above, 'Move Layer Up'))
    refreshLayers()
    setActiveLayerIdx(idx - 1)
  }

  const moveLayerDown = (idx: number) => {
    if (idx >= layers.length - 1 || !editor.doc) return
    const below = layers[idx + 1].element
    const current = layers[idx].element
    editor.history.execute(new ReorderElementCommand(below, current, 'Move Layer Down'))
    refreshLayers()
    setActiveLayerIdx(idx + 1)
  }

  return (
    <div className="w-56 bg-chrome-50 flex flex-col max-h-48 overflow-hidden">
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
            <button
              onClick={(e) => { e.stopPropagation(); moveLayerUp(idx) }}
              className={`w-4 text-center ${idx === 0 ? 'text-chrome-200' : 'text-chrome-400 hover:text-chrome-700'}`}
              title="Move Up"
              disabled={idx === 0}
            >
              &#x25B2;
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); moveLayerDown(idx) }}
              className={`w-4 text-center ${idx === layers.length - 1 ? 'text-chrome-200' : 'text-chrome-400 hover:text-chrome-700'}`}
              title="Move Down"
              disabled={idx === layers.length - 1}
            >
              &#x25BC;
            </button>
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
