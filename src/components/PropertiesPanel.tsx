import { useState, useEffect } from 'react'
import { getSelection, subscribeSelection } from '../model/selection'
import { useEditor } from '../model/EditorContext'
import { ModifyAttributeCommand } from '../model/commands'
import { ColorPicker } from './ColorPicker'
import { refreshOverlay } from '../model/selection'

const FONT_FAMILIES = [
  'sans-serif',
  'serif',
  'monospace',
  'Arial',
  'Georgia',
  'Times New Roman',
  'Courier New',
  'Verdana',
  'Trebuchet MS',
  'Impact',
  'Comic Sans MS',
]

function getAttr(el: Element, attr: string): string {
  return el.getAttribute(attr) || ''
}

function PropertyInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-1">
      <span className="text-xs text-chrome-500 w-8">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 border border-chrome-300 px-1 py-0.5 text-xs font-mono w-16"
      />
    </label>
  )
}

export function PropertiesPanel() {
  const { history } = useEditor()
  const [selection, setSelectionState] = useState<Element[]>([])

  useEffect(() => {
    const update = () => setSelectionState(getSelection())
    update()
    return subscribeSelection(update)
  }, [])

  const applyAttr = (el: Element, attr: string, value: string) => {
    const cmd = new ModifyAttributeCommand(el, attr, value)
    history.execute(cmd)
  }

  const el = selection.length === 1 ? selection[0] : null
  const tag = el?.tagName

  return (
    <div className="w-56 bg-chrome-50 border-l border-chrome-300 flex flex-col">
      <div className="h-8 bg-chrome-100 border-b border-chrome-200 flex items-center px-2">
        <span className="text-xs font-medium text-chrome-600 select-none">Properties</span>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-3">
        {selection.length === 0 && (
          <p className="text-xs text-chrome-400">No selection</p>
        )}
        {selection.length > 1 && (
          <p className="text-xs text-chrome-400">{selection.length} objects selected</p>
        )}
        {el && (
          <>
            <div>
              <div className="text-xs font-medium text-chrome-600 mb-1">Position</div>
              {(tag === 'rect' || tag === 'text') && (
                <div className="space-y-1">
                  <PropertyInput label="X" value={getAttr(el, 'x')} onChange={(v) => applyAttr(el, 'x', v)} />
                  <PropertyInput label="Y" value={getAttr(el, 'y')} onChange={(v) => applyAttr(el, 'y', v)} />
                </div>
              )}
              {(tag === 'ellipse' || tag === 'circle') && (
                <div className="space-y-1">
                  <PropertyInput label="CX" value={getAttr(el, 'cx')} onChange={(v) => applyAttr(el, 'cx', v)} />
                  <PropertyInput label="CY" value={getAttr(el, 'cy')} onChange={(v) => applyAttr(el, 'cy', v)} />
                </div>
              )}
              {tag === 'line' && (
                <div className="space-y-1">
                  <PropertyInput label="X1" value={getAttr(el, 'x1')} onChange={(v) => applyAttr(el, 'x1', v)} />
                  <PropertyInput label="Y1" value={getAttr(el, 'y1')} onChange={(v) => applyAttr(el, 'y1', v)} />
                  <PropertyInput label="X2" value={getAttr(el, 'x2')} onChange={(v) => applyAttr(el, 'x2', v)} />
                  <PropertyInput label="Y2" value={getAttr(el, 'y2')} onChange={(v) => applyAttr(el, 'y2', v)} />
                </div>
              )}
            </div>

            {(tag === 'rect' || tag === 'ellipse') && (
              <div>
                <div className="text-xs font-medium text-chrome-600 mb-1">Size</div>
                <div className="space-y-1">
                  {tag === 'rect' && (
                    <>
                      <PropertyInput label="W" value={getAttr(el, 'width')} onChange={(v) => applyAttr(el, 'width', v)} />
                      <PropertyInput label="H" value={getAttr(el, 'height')} onChange={(v) => applyAttr(el, 'height', v)} />
                    </>
                  )}
                  {tag === 'ellipse' && (
                    <>
                      <PropertyInput label="RX" value={getAttr(el, 'rx')} onChange={(v) => applyAttr(el, 'rx', v)} />
                      <PropertyInput label="RY" value={getAttr(el, 'ry')} onChange={(v) => applyAttr(el, 'ry', v)} />
                    </>
                  )}
                </div>
              </div>
            )}

            {tag === 'text' && (
              <div>
                <div className="text-xs font-medium text-chrome-600 mb-1">Font</div>
                <div className="space-y-1">
                  <label className="flex items-center gap-1">
                    <span className="text-xs text-chrome-500 w-8">Fam</span>
                    <select
                      value={getAttr(el, 'font-family') || 'sans-serif'}
                      onChange={(e) => {
                        applyAttr(el, 'font-family', e.target.value)
                        refreshOverlay()
                      }}
                      className="flex-1 border border-chrome-300 px-1 py-0.5 text-xs w-16"
                    >
                      {FONT_FAMILIES.map((font) => (
                        <option key={font} value={font} style={{ fontFamily: font }}>
                          {font}
                        </option>
                      ))}
                    </select>
                  </label>
                  <PropertyInput
                    label="Size"
                    value={getAttr(el, 'font-size') || '16'}
                    onChange={(v) => {
                      applyAttr(el, 'font-size', v)
                      refreshOverlay()
                    }}
                  />
                </div>
              </div>
            )}

            <div>
              <div className="text-xs font-medium text-chrome-600 mb-1">Style</div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-chrome-500 w-8">Str</span>
                  <ColorPicker value={getAttr(el, 'stroke') || '#000000'} onChange={(v) => applyAttr(el, 'stroke', v)} allowNone={false} />
                </div>
                <PropertyInput label="SW" value={getAttr(el, 'stroke-width')} onChange={(v) => applyAttr(el, 'stroke-width', v)} />
                <div className="flex items-center gap-2">
                  <span className="text-xs text-chrome-500 w-8">Fill</span>
                  <ColorPicker value={getAttr(el, 'fill') || 'none'} onChange={(v) => applyAttr(el, 'fill', v)} />
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
