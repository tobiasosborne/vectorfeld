import { useState, useEffect, useRef } from 'react'
import { getSelection, subscribeSelection, refreshOverlay } from '../model/selection'
import { useEditor } from '../model/EditorContext'
import { ModifyAttributeCommand } from '../model/commands'

function formatNum(val: string): string {
  const n = parseFloat(val)
  return isNaN(n) ? val : n.toFixed(2)
}

function CompactInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [local, setLocal] = useState(value)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => { if (!editing) setLocal(value) }, [value, editing])

  const commit = () => {
    if (local !== value) onChange(local)
    setEditing(false)
  }

  return (
    <label className="flex items-center gap-0.5">
      <span className="text-[10px] text-chrome-500 font-medium">{label}</span>
      <input
        ref={ref}
        type="text"
        value={editing ? local : formatNum(value)}
        onChange={(e) => setLocal(e.target.value)}
        onFocus={() => { setEditing(true); setLocal(value) }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { commit(); ref.current?.blur() }
          else if (e.key === 'Escape') { setLocal(value); setEditing(false); ref.current?.blur() }
        }}
        className="w-14 border border-chrome-300 px-1 py-0 text-[10px] font-mono bg-white"
      />
    </label>
  )
}

function getAttr(el: Element, attr: string): string {
  return el.getAttribute(attr) || ''
}

function getRotation(el: Element): string {
  const t = el.getAttribute('transform') || ''
  const m = t.match(/rotate\(([-\d.]+)/)
  return m ? m[1] : '0'
}

function getBBox(el: Element): { x: string; y: string; w: string; h: string } {
  const tag = el.tagName
  if (tag === 'rect' || tag === 'image') {
    return { x: getAttr(el, 'x'), y: getAttr(el, 'y'), w: getAttr(el, 'width'), h: getAttr(el, 'height') }
  } else if (tag === 'ellipse') {
    const cx = parseFloat(getAttr(el, 'cx') || '0'), cy = parseFloat(getAttr(el, 'cy') || '0')
    const rx = parseFloat(getAttr(el, 'rx') || '0'), ry = parseFloat(getAttr(el, 'ry') || '0')
    return { x: String(cx - rx), y: String(cy - ry), w: String(rx * 2), h: String(ry * 2) }
  } else if (tag === 'circle') {
    const cx = parseFloat(getAttr(el, 'cx') || '0'), cy = parseFloat(getAttr(el, 'cy') || '0')
    const r = parseFloat(getAttr(el, 'r') || '0')
    return { x: String(cx - r), y: String(cy - r), w: String(r * 2), h: String(r * 2) }
  } else if (tag === 'line') {
    const x1 = parseFloat(getAttr(el, 'x1') || '0'), y1 = parseFloat(getAttr(el, 'y1') || '0')
    const x2 = parseFloat(getAttr(el, 'x2') || '0'), y2 = parseFloat(getAttr(el, 'y2') || '0')
    return { x: String(Math.min(x1, x2)), y: String(Math.min(y1, y2)), w: String(Math.abs(x2 - x1)), h: String(Math.abs(y2 - y1)) }
  } else if (tag === 'text') {
    return { x: getAttr(el, 'x'), y: getAttr(el, 'y'), w: '', h: '' }
  }
  // path or other — use getBBox if available
  try {
    const b = (el as SVGGraphicsElement).getBBox()
    return { x: String(b.x), y: String(b.y), w: String(b.width), h: String(b.height) }
  } catch {
    return { x: '0', y: '0', w: '0', h: '0' }
  }
}

export function ControlBar() {
  const { history } = useEditor()
  const [selection, setSelectionState] = useState<Element[]>([])
  const [, setTick] = useState(0)

  useEffect(() => {
    const update = () => { setSelectionState(getSelection()); setTick(t => t + 1) }
    update()
    return subscribeSelection(update)
  }, [])

  const applyAttr = (el: Element, attr: string, value: string) => {
    history.execute(new ModifyAttributeCommand(el, attr, value))
    refreshOverlay()
  }

  if (selection.length === 0) {
    return (
      <div className="h-7 bg-chrome-100 border-b border-chrome-200 flex items-center px-3">
        <span className="text-[10px] text-chrome-400">No selection</span>
      </div>
    )
  }

  if (selection.length > 1) {
    return (
      <div className="h-7 bg-chrome-100 border-b border-chrome-200 flex items-center px-3">
        <span className="text-[10px] text-chrome-500">{selection.length} objects selected</span>
      </div>
    )
  }

  const el = selection[0]
  const { x, y, w, h } = getBBox(el)
  const rot = getRotation(el)
  const tag = el.tagName

  // Position change handlers — map control bar inputs to element attributes
  const onX = (v: string) => {
    if (tag === 'rect' || tag === 'image') applyAttr(el, 'x', v)
    else if (tag === 'ellipse') applyAttr(el, 'cx', String(parseFloat(v) + parseFloat(getAttr(el, 'rx') || '0')))
    else if (tag === 'circle') applyAttr(el, 'cx', String(parseFloat(v) + parseFloat(getAttr(el, 'r') || '0')))
    else if (tag === 'text') applyAttr(el, 'x', v)
  }
  const onY = (v: string) => {
    if (tag === 'rect' || tag === 'image') applyAttr(el, 'y', v)
    else if (tag === 'ellipse') applyAttr(el, 'cy', String(parseFloat(v) + parseFloat(getAttr(el, 'ry') || '0')))
    else if (tag === 'circle') applyAttr(el, 'cy', String(parseFloat(v) + parseFloat(getAttr(el, 'r') || '0')))
    else if (tag === 'text') applyAttr(el, 'y', v)
  }
  const onW = (v: string) => {
    if (tag === 'rect' || tag === 'image') applyAttr(el, 'width', v)
    else if (tag === 'ellipse') applyAttr(el, 'rx', String(parseFloat(v) / 2))
    else if (tag === 'circle') applyAttr(el, 'r', String(parseFloat(v) / 2))
  }
  const onH = (v: string) => {
    if (tag === 'rect' || tag === 'image') applyAttr(el, 'height', v)
    else if (tag === 'ellipse') applyAttr(el, 'ry', String(parseFloat(v) / 2))
    else if (tag === 'circle') applyAttr(el, 'r', String(parseFloat(v) / 2))
  }
  const onRot = (v: string) => {
    const angle = parseFloat(v) || 0
    const lb = (el as SVGGraphicsElement).getBBox?.()
    if (lb) {
      const cx = lb.x + lb.width / 2
      const cy = lb.y + lb.height / 2
      applyAttr(el, 'transform', angle === 0 ? '' : `rotate(${angle}, ${cx}, ${cy})`)
    }
  }

  return (
    <div className="h-7 bg-chrome-100 border-b border-chrome-200 flex items-center px-3 gap-3">
      <CompactInput label="X:" value={x} onChange={onX} />
      <CompactInput label="Y:" value={y} onChange={onY} />
      {w && <CompactInput label="W:" value={w} onChange={onW} />}
      {h && <CompactInput label="H:" value={h} onChange={onH} />}
      <CompactInput label="R:" value={rot} onChange={onRot} />
      <span className="text-[10px] text-chrome-400 ml-auto">{tag}</span>
    </div>
  )
}
