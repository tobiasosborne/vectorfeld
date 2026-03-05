import { useState, useEffect, useRef } from 'react'
import { getSelection, subscribeSelection } from '../model/selection'
import { useEditor } from '../model/EditorContext'
import { ModifyAttributeCommand } from '../model/commands'
import { ColorPicker } from './ColorPicker'
import { refreshOverlay } from '../model/selection'
import { setDefaultStyle } from '../model/defaultStyle'
import { MARKER_TYPES, getMarkerLabel, getMarkerUrl, parseMarkerType, ensureMarkerDef } from '../model/markers'
import type { MarkerType } from '../model/markers'
import { detectFillType, createLinearGradient, createRadialGradient, parseGradientColors, updateGradientColors } from '../model/gradients'
import type { FillType } from '../model/gradients'
import { computeAlign, computeDistribute, applyDelta } from '../model/align'
import { parseSkew, setSkew } from '../model/matrix'
import type { AlignOp, DistributeOp } from '../model/align'
import { CompoundCommand } from '../model/commands'

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

/** Format a numeric string to 2 decimal places for display */
function formatNumeric(val: string): string {
  const num = parseFloat(val)
  if (isNaN(num)) return val
  return num.toFixed(2)
}

function PropertyInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [localValue, setLocalValue] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  // Sync external value when not editing
  useEffect(() => {
    if (!editing) setLocalValue(value)
  }, [value, editing])

  const displayValue = editing ? localValue : formatNumeric(value)

  const commit = () => {
    if (localValue !== value) {
      onChange(localValue)
    }
    setEditing(false)
  }

  return (
    <label className="flex items-center gap-1">
      <span className="text-xs text-chrome-500 w-8">{label}</span>
      <input
        ref={inputRef}
        type="text"
        value={displayValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onFocus={() => {
          setEditing(true)
          setLocalValue(value)
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit()
            inputRef.current?.blur()
          } else if (e.key === 'Escape') {
            setLocalValue(value)
            setEditing(false)
            inputRef.current?.blur()
          }
        }}
        className="flex-1 border border-chrome-300 px-1 py-0.5 text-xs font-mono w-16"
      />
    </label>
  )
}

export function PropertiesPanel() {
  const { history, doc } = useEditor()
  const [selection, setSelectionState] = useState<Element[]>([])
  const [lockAspect, setLockAspect] = useState(false)

  useEffect(() => {
    const update = () => setSelectionState(getSelection())
    update()
    return subscribeSelection(update)
  }, [])

  const applyAttr = (el: Element, attr: string, value: string) => {
    const cmd = new ModifyAttributeCommand(el, attr, value)
    history.execute(cmd)
    // Update default style when style properties change
    if (attr === 'stroke') setDefaultStyle({ stroke: value })
    else if (attr === 'fill') setDefaultStyle({ fill: value })
    else if (attr === 'stroke-width') setDefaultStyle({ strokeWidth: value })
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
          <>
            <p className="text-xs text-chrome-400">{selection.length} objects selected</p>
            <div>
              <div className="text-xs font-medium text-chrome-600 mb-1">Align</div>
              <div className="flex gap-1 flex-wrap">
                {([
                  ['left', 'L', 'Align Left'],
                  ['center-h', 'CH', 'Center Horizontal'],
                  ['right', 'R', 'Align Right'],
                  ['top', 'T', 'Align Top'],
                  ['center-v', 'CV', 'Center Vertical'],
                  ['bottom', 'B', 'Align Bottom'],
                ] as [AlignOp, string, string][]).map(([op, label, title]) => (
                  <button
                    key={op}
                    title={title}
                    className="px-1.5 py-0.5 text-xs border border-chrome-300 hover:bg-chrome-200 rounded"
                    onClick={() => {
                      const deltas = computeAlign(selection, op)
                      const cmds: ModifyAttributeCommand[] = []
                      for (const [el, { dx, dy }] of deltas) {
                        for (const [attr, val] of applyDelta(el, dx, dy)) {
                          cmds.push(new ModifyAttributeCommand(el, attr, val))
                        }
                      }
                      if (cmds.length > 0) {
                        history.execute(new CompoundCommand(cmds, `Align ${op}`))
                        refreshOverlay()
                      }
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {selection.length >= 3 && (
              <div>
                <div className="text-xs font-medium text-chrome-600 mb-1">Distribute</div>
                <div className="flex gap-1">
                  {([
                    ['horizontal', 'H', 'Distribute Horizontally'],
                    ['vertical', 'V', 'Distribute Vertically'],
                  ] as [DistributeOp, string, string][]).map(([op, label, title]) => (
                    <button
                      key={op}
                      title={title}
                      className="px-1.5 py-0.5 text-xs border border-chrome-300 hover:bg-chrome-200 rounded"
                      onClick={() => {
                        const deltas = computeDistribute(selection, op)
                        const cmds: ModifyAttributeCommand[] = []
                        for (const [el, { dx, dy }] of deltas) {
                          for (const [attr, val] of applyDelta(el, dx, dy)) {
                            cmds.push(new ModifyAttributeCommand(el, attr, val))
                          }
                        }
                        if (cmds.length > 0) {
                          history.execute(new CompoundCommand(cmds, `Distribute ${op}`))
                          refreshOverlay()
                        }
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
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
                <div className="text-xs font-medium text-chrome-600 mb-1 flex items-center justify-between">
                  Size
                  <button
                    onClick={() => setLockAspect(!lockAspect)}
                    className={`px-0.5 ${lockAspect ? 'text-accent' : 'text-chrome-400'} hover:text-chrome-600`}
                    title={lockAspect ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
                      {lockAspect ? (
                        <>
                          <path d="M4 3.5V3a2 2 0 0 1 4 0v.5" />
                          <rect x="3" y="5" width="6" height="4.5" rx="0.5" />
                        </>
                      ) : (
                        <>
                          <path d="M4 3.5V3a2 2 0 0 1 4 0v.5" opacity="0.4" />
                          <rect x="3" y="5" width="6" height="4.5" rx="0.5" opacity="0.4" />
                        </>
                      )}
                    </svg>
                  </button>
                </div>
                <div className="space-y-1">
                  {tag === 'rect' && (
                    <>
                      <PropertyInput label="W" value={getAttr(el, 'width')} onChange={(v) => {
                        const newW = parseFloat(v)
                        if (lockAspect && !isNaN(newW)) {
                          const oldW = parseFloat(getAttr(el, 'width')) || 1
                          const oldH = parseFloat(getAttr(el, 'height')) || 1
                          const ratio = oldH / oldW
                          const cmds = [
                            new ModifyAttributeCommand(el, 'width', v),
                            new ModifyAttributeCommand(el, 'height', String(newW * ratio)),
                          ]
                          history.execute(new CompoundCommand(cmds, 'Resize'))
                        } else {
                          applyAttr(el, 'width', v)
                        }
                        refreshOverlay()
                      }} />
                      <PropertyInput label="H" value={getAttr(el, 'height')} onChange={(v) => {
                        const newH = parseFloat(v)
                        if (lockAspect && !isNaN(newH)) {
                          const oldW = parseFloat(getAttr(el, 'width')) || 1
                          const oldH = parseFloat(getAttr(el, 'height')) || 1
                          const ratio = oldW / oldH
                          const cmds = [
                            new ModifyAttributeCommand(el, 'height', v),
                            new ModifyAttributeCommand(el, 'width', String(newH * ratio)),
                          ]
                          history.execute(new CompoundCommand(cmds, 'Resize'))
                        } else {
                          applyAttr(el, 'height', v)
                        }
                        refreshOverlay()
                      }} />
                    </>
                  )}
                  {tag === 'ellipse' && (
                    <>
                      <PropertyInput label="RX" value={getAttr(el, 'rx')} onChange={(v) => {
                        const newRx = parseFloat(v)
                        if (lockAspect && !isNaN(newRx)) {
                          const oldRx = parseFloat(getAttr(el, 'rx')) || 1
                          const oldRy = parseFloat(getAttr(el, 'ry')) || 1
                          const ratio = oldRy / oldRx
                          const cmds = [
                            new ModifyAttributeCommand(el, 'rx', v),
                            new ModifyAttributeCommand(el, 'ry', String(newRx * ratio)),
                          ]
                          history.execute(new CompoundCommand(cmds, 'Resize'))
                        } else {
                          applyAttr(el, 'rx', v)
                        }
                        refreshOverlay()
                      }} />
                      <PropertyInput label="RY" value={getAttr(el, 'ry')} onChange={(v) => {
                        const newRy = parseFloat(v)
                        if (lockAspect && !isNaN(newRy)) {
                          const oldRx = parseFloat(getAttr(el, 'rx')) || 1
                          const oldRy = parseFloat(getAttr(el, 'ry')) || 1
                          const ratio = oldRx / oldRy
                          const cmds = [
                            new ModifyAttributeCommand(el, 'ry', v),
                            new ModifyAttributeCommand(el, 'rx', String(newRy * ratio)),
                          ]
                          history.execute(new CompoundCommand(cmds, 'Resize'))
                        } else {
                          applyAttr(el, 'ry', v)
                        }
                        refreshOverlay()
                      }} />
                    </>
                  )}
                </div>
              </div>
            )}

            <div>
              <div className="text-xs font-medium text-chrome-600 mb-1">Transform</div>
              <div className="space-y-1">
                <PropertyInput
                  label="Rot"
                  value={(() => {
                    const transform = getAttr(el, 'transform')
                    if (!transform) return '0'
                    const match = transform.match(/rotate\(([-\d.]+)/)
                    return match ? String(Math.round(parseFloat(match[1]) * 100) / 100) : '0'
                  })()}
                  onChange={(v) => {
                    const angle = parseFloat(v) || 0
                    try {
                      const bbox = (el as SVGGraphicsElement).getBBox()
                      const cx = bbox.x + bbox.width / 2
                      const cy = bbox.y + bbox.height / 2
                      const existing = getAttr(el, 'transform')
                      const skew = parseSkew(existing)
                      let t = `rotate(${angle}, ${cx}, ${cy})`
                      t = setSkew(t, skew.skewX, skew.skewY)
                      applyAttr(el, 'transform', t)
                    } catch {
                      applyAttr(el, 'transform', `rotate(${angle})`)
                    }
                    refreshOverlay()
                  }}
                />
                <PropertyInput
                  label="SkX"
                  value={String(parseSkew(getAttr(el, 'transform')).skewX)}
                  onChange={(v) => {
                    const angle = parseFloat(v) || 0
                    const existing = getAttr(el, 'transform')
                    const skew = parseSkew(existing)
                    applyAttr(el, 'transform', setSkew(existing, angle, skew.skewY))
                    refreshOverlay()
                  }}
                />
                <PropertyInput
                  label="SkY"
                  value={String(parseSkew(getAttr(el, 'transform')).skewY)}
                  onChange={(v) => {
                    const angle = parseFloat(v) || 0
                    const existing = getAttr(el, 'transform')
                    const skew = parseSkew(existing)
                    applyAttr(el, 'transform', setSkew(existing, skew.skewX, angle))
                    refreshOverlay()
                  }}
                />
              </div>
            </div>

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
                  <PropertyInput
                    label="Lsp"
                    value={getAttr(el, 'letter-spacing') || '0'}
                    onChange={(v) => {
                      applyAttr(el, 'letter-spacing', v)
                      refreshOverlay()
                    }}
                  />
                </div>
              </div>
            )}

            {tag === 'text' && el.querySelector('textPath') && (
              <div>
                <div className="text-xs font-medium text-chrome-600 mb-1">Text Path</div>
                <div className="space-y-1">
                  <PropertyInput
                    label="Ofs"
                    value={el.querySelector('textPath')?.getAttribute('startOffset') || '0%'}
                    onChange={(v) => {
                      const tp = el.querySelector('textPath')
                      if (tp) applyAttr(tp, 'startOffset', v)
                    }}
                  />
                </div>
              </div>
            )}

            {(() => {
              const fillType = detectFillType(el)
              return (<div>
              <div className="text-xs font-medium text-chrome-600 mb-1">Style</div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-chrome-500 w-8">Str</span>
                  <ColorPicker value={getAttr(el, 'stroke') || '#000000'} onChange={(v) => applyAttr(el, 'stroke', v)} allowNone={false} />
                </div>
                <PropertyInput label="SW" value={getAttr(el, 'stroke-width')} onChange={(v) => applyAttr(el, 'stroke-width', v)} />
                <div className="space-y-1">
                  <label className="flex items-center gap-1">
                    <span className="text-xs text-chrome-500 w-8">Fill</span>
                    <select
                      value={fillType}
                      onChange={(e) => {
                        const ft = e.target.value as FillType
                        if (ft === 'none') {
                          applyAttr(el, 'fill', 'none')
                        } else if (ft === 'solid') {
                          const colors = parseGradientColors(el)
                          applyAttr(el, 'fill', colors?.color1 || '#000000')
                        } else if (ft === 'linear' && doc) {
                          const colors = parseGradientColors(el)
                          const url = createLinearGradient(doc.getDefs(), colors?.color1 || '#000000', colors?.color2 || '#ffffff', 0)
                          applyAttr(el, 'fill', url)
                        } else if (ft === 'radial' && doc) {
                          const colors = parseGradientColors(el)
                          const url = createRadialGradient(doc.getDefs(), colors?.color1 || '#000000', colors?.color2 || '#ffffff')
                          applyAttr(el, 'fill', url)
                        }
                      }}
                      className="flex-1 border border-chrome-300 px-1 py-0.5 text-xs"
                    >
                      <option value="none">None</option>
                      <option value="solid">Solid</option>
                      {tag !== 'line' && <option value="linear">Linear Gradient</option>}
                      {tag !== 'line' && <option value="radial">Radial Gradient</option>}
                    </select>
                  </label>
                  {fillType === 'solid' && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-chrome-500 w-8"></span>
                      <ColorPicker value={getAttr(el, 'fill') || '#000000'} onChange={(v) => applyAttr(el, 'fill', v)} />
                    </div>
                  )}
                  {(fillType === 'linear' || fillType === 'radial') && (() => {
                    const colors = parseGradientColors(el)
                    return (
                      <>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-chrome-500 w-8">C1</span>
                          <ColorPicker
                            value={colors?.color1 || '#000000'}
                            onChange={(v) => {
                              const c2 = colors?.color2 || '#ffffff'
                              updateGradientColors(el, v, c2)
                            }}
                            allowNone={false}
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-chrome-500 w-8">C2</span>
                          <ColorPicker
                            value={colors?.color2 || '#ffffff'}
                            onChange={(v) => {
                              const c1 = colors?.color1 || '#000000'
                              updateGradientColors(el, c1, v)
                            }}
                            allowNone={false}
                          />
                        </div>
                      </>
                    )
                  })()}
                </div>
                <label className="flex items-center gap-1">
                  <span className="text-xs text-chrome-500 w-8">Dash</span>
                  <select
                    value={
                      ['', '4 2', '2 2', '4 2 2 2', '8 4', '1 2', '8 4 2 4', '8 4 2 4 2 4'].includes(getAttr(el, 'stroke-dasharray'))
                        ? getAttr(el, 'stroke-dasharray')
                        : '__custom__'
                    }
                    onChange={(e) => {
                      if (e.target.value === '__custom__') return
                      if (e.target.value) {
                        applyAttr(el, 'stroke-dasharray', e.target.value)
                      } else {
                        const cmd = new ModifyAttributeCommand(el, 'stroke-dasharray', '')
                        history.execute(cmd)
                      }
                    }}
                    className="flex-1 border border-chrome-300 px-1 py-0.5 text-xs"
                  >
                    <option value="">Solid</option>
                    <option value="4 2">Dashed</option>
                    <option value="2 2">Dotted</option>
                    <option value="4 2 2 2">Dash-Dot</option>
                    <option value="8 4">Long Dash</option>
                    <option value="1 2">Dense Dots</option>
                    <option value="8 4 2 4">Long Dash-Dot</option>
                    <option value="8 4 2 4 2 4">Long Dash-Dot-Dot</option>
                    <option value="__custom__">Custom...</option>
                  </select>
                </label>
                {!['', '4 2', '2 2', '4 2 2 2', '8 4', '1 2', '8 4 2 4', '8 4 2 4 2 4'].includes(getAttr(el, 'stroke-dasharray')) && getAttr(el, 'stroke-dasharray') && (
                  <PropertyInput
                    label="Pat"
                    value={getAttr(el, 'stroke-dasharray')}
                    onChange={(v) => applyAttr(el, 'stroke-dasharray', v)}
                  />
                )}
                {getAttr(el, 'stroke-dasharray') && (
                  <svg width="100%" height="8" className="mt-0.5 mb-0.5">
                    <line x1="4" y1="4" x2="200" y2="4" stroke="#333" strokeWidth="2" strokeDasharray={getAttr(el, 'stroke-dasharray')} />
                  </svg>
                )}
                <label className="flex items-center gap-1">
                  <span className="text-xs text-chrome-500 w-8">Cap</span>
                  <select
                    value={getAttr(el, 'stroke-linecap') || 'butt'}
                    onChange={(e) => applyAttr(el, 'stroke-linecap', e.target.value)}
                    className="flex-1 border border-chrome-300 px-1 py-0.5 text-xs"
                  >
                    <option value="butt">Butt</option>
                    <option value="round">Round</option>
                    <option value="square">Square</option>
                  </select>
                </label>
                <label className="flex items-center gap-1">
                  <span className="text-xs text-chrome-500 w-8">Join</span>
                  <select
                    value={getAttr(el, 'stroke-linejoin') || 'miter'}
                    onChange={(e) => applyAttr(el, 'stroke-linejoin', e.target.value)}
                    className="flex-1 border border-chrome-300 px-1 py-0.5 text-xs"
                  >
                    <option value="miter">Miter</option>
                    <option value="round">Round</option>
                    <option value="bevel">Bevel</option>
                  </select>
                </label>
                <PropertyInput
                  label="Opa"
                  value={getAttr(el, 'opacity') || '1'}
                  onChange={(v) => applyAttr(el, 'opacity', v)}
                />
              </div>
            </div>)
            })()}

            {(tag === 'line' || tag === 'path') && doc && (
              <div>
                <div className="text-xs font-medium text-chrome-600 mb-1">Markers</div>
                <div className="space-y-1">
                  <label className="flex items-center gap-1">
                    <span className="text-xs text-chrome-500 w-8">Start</span>
                    <select
                      value={parseMarkerType(getAttr(el, 'marker-start'))}
                      onChange={(e) => {
                        const mt = e.target.value as MarkerType
                        ensureMarkerDef(doc.getDefs(), mt)
                        applyAttr(el, 'marker-start', getMarkerUrl(mt))
                      }}
                      className="flex-1 border border-chrome-300 px-1 py-0.5 text-xs"
                    >
                      {MARKER_TYPES.map((mt) => (
                        <option key={mt} value={mt}>{getMarkerLabel(mt)}</option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-1">
                    <span className="text-xs text-chrome-500 w-8">End</span>
                    <select
                      value={parseMarkerType(getAttr(el, 'marker-end'))}
                      onChange={(e) => {
                        const mt = e.target.value as MarkerType
                        ensureMarkerDef(doc.getDefs(), mt)
                        applyAttr(el, 'marker-end', getMarkerUrl(mt))
                      }}
                      className="flex-1 border border-chrome-300 px-1 py-0.5 text-xs"
                    >
                      {MARKER_TYPES.map((mt) => (
                        <option key={mt} value={mt}>{getMarkerLabel(mt)}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
