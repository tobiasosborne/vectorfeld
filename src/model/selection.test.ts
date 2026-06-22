import { describe, it, expect, beforeEach } from 'vitest'
import {
  setSelection,
  clearSelection,
  setOverlayGroup,
  refreshOverlaySync,
  pruneSelection,
  getSelection,
} from './selection'

function makeSvg(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 210 297')
  // jsdom needs clientWidth/clientHeight mocked for handle sizing
  Object.defineProperty(svg, 'clientWidth', { value: 800, writable: true })
  Object.defineProperty(svg, 'clientHeight', { value: 600, writable: true })
  const layer = document.createElementNS('http://www.w3.org/2000/svg', 'g')
  layer.setAttribute('data-layer-name', 'Layer 1')
  svg.appendChild(layer)
  const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'g')
  overlay.setAttribute('data-role', 'overlay')
  svg.appendChild(overlay)
  document.body.appendChild(svg)
  return svg
}

function makeRect(svg: SVGSVGElement, x: number, y: number, w: number, h: number): SVGRectElement {
  const layer = svg.querySelector('g[data-layer-name]')!
  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  rect.setAttribute('x', String(x))
  rect.setAttribute('y', String(y))
  rect.setAttribute('width', String(w))
  rect.setAttribute('height', String(h))
  // jsdom doesn't compute getBBox, so we mock it
  ;(rect as unknown as { getBBox: () => DOMRect }).getBBox = () =>
    new DOMRect(x, y, w, h)
  layer.appendChild(rect)
  return rect
}

describe('Selection overlay with scale handles', () => {
  let svg: SVGSVGElement
  let overlay: SVGGElement

  beforeEach(() => {
    document.body.innerHTML = ''
    svg = makeSvg()
    overlay = svg.querySelector('[data-role="overlay"]') as SVGGElement
    setOverlayGroup(overlay)
    clearSelection()
  })

  it('renders 8 scale handles when an element is selected', () => {
    const rect = makeRect(svg, 10, 20, 50, 30)
    setSelection([rect])

    const handles = overlay.querySelectorAll('[data-role="scale-handle"]')
    expect(handles.length).toBe(8)
  })

  it('renders no handles when nothing is selected', () => {
    clearSelection()
    const handles = overlay.querySelectorAll('[data-role="scale-handle"]')
    expect(handles.length).toBe(0)
  })

  it('renders handles at correct positions for single element', () => {
    const rect = makeRect(svg, 10, 20, 50, 30)
    setSelection([rect])

    const handles = overlay.querySelectorAll('[data-role="scale-handle"]')
    const posMap: Record<string, { cx: number; cy: number }> = {}
    handles.forEach((h) => {
      const pos = h.getAttribute('data-handle-pos')!
      const hx = parseFloat(h.getAttribute('x')!)
      const hy = parseFloat(h.getAttribute('y')!)
      const hw = parseFloat(h.getAttribute('width')!)
      const hh = parseFloat(h.getAttribute('height')!)
      posMap[pos] = { cx: hx + hw / 2, cy: hy + hh / 2 }
    })

    // bbox: x=10, y=20, w=50, h=30
    expect(posMap['nw'].cx).toBeCloseTo(10)
    expect(posMap['nw'].cy).toBeCloseTo(20)
    expect(posMap['n'].cx).toBeCloseTo(35) // 10 + 50/2
    expect(posMap['n'].cy).toBeCloseTo(20)
    expect(posMap['ne'].cx).toBeCloseTo(60) // 10 + 50
    expect(posMap['ne'].cy).toBeCloseTo(20)
    expect(posMap['e'].cx).toBeCloseTo(60)
    expect(posMap['e'].cy).toBeCloseTo(35) // 20 + 30/2
    expect(posMap['se'].cx).toBeCloseTo(60)
    expect(posMap['se'].cy).toBeCloseTo(50) // 20 + 30
    expect(posMap['s'].cx).toBeCloseTo(35)
    expect(posMap['s'].cy).toBeCloseTo(50)
    expect(posMap['sw'].cx).toBeCloseTo(10)
    expect(posMap['sw'].cy).toBeCloseTo(50)
    expect(posMap['w'].cx).toBeCloseTo(10)
    expect(posMap['w'].cy).toBeCloseTo(35)
  })

  it('renders handles around union bbox for multi-selection', () => {
    const r1 = makeRect(svg, 10, 20, 30, 20) // bbox: 10,20 -> 40,40
    const r2 = makeRect(svg, 50, 10, 40, 50) // bbox: 50,10 -> 90,60

    setSelection([r1, r2])

    // Union bbox: x=10, y=10, w=80, h=50 (10->90, 10->60)
    const handles = overlay.querySelectorAll('[data-role="scale-handle"]')
    expect(handles.length).toBe(8)

    const posMap: Record<string, { cx: number; cy: number }> = {}
    handles.forEach((h) => {
      const pos = h.getAttribute('data-handle-pos')!
      const hx = parseFloat(h.getAttribute('x')!)
      const hy = parseFloat(h.getAttribute('y')!)
      const hw = parseFloat(h.getAttribute('width')!)
      const hh = parseFloat(h.getAttribute('height')!)
      posMap[pos] = { cx: hx + hw / 2, cy: hy + hh / 2 }
    })

    expect(posMap['nw'].cx).toBeCloseTo(10)
    expect(posMap['nw'].cy).toBeCloseTo(10)
    expect(posMap['se'].cx).toBeCloseTo(90)
    expect(posMap['se'].cy).toBeCloseTo(60)
    expect(posMap['n'].cx).toBeCloseTo(50) // (10+90)/2
  })

  it('each handle has the correct cursor', () => {
    const rect = makeRect(svg, 0, 0, 100, 100)
    setSelection([rect])

    const expected: Record<string, string> = {
      nw: 'nwse-resize',
      n: 'ns-resize',
      ne: 'nesw-resize',
      e: 'ew-resize',
      se: 'nwse-resize',
      s: 'ns-resize',
      sw: 'nesw-resize',
      w: 'ew-resize',
    }

    for (const [pos, cursor] of Object.entries(expected)) {
      const handle = overlay.querySelector(`[data-handle-pos="${pos}"]`) as SVGElement
      expect(handle).not.toBeNull()
      expect(handle.style.cursor).toBe(cursor)
    }
  })

  it('handles have pointer-events auto', () => {
    const rect = makeRect(svg, 0, 0, 50, 50)
    setSelection([rect])

    const handles = overlay.querySelectorAll('[data-role="scale-handle"]')
    handles.forEach((h) => {
      expect(h.getAttribute('pointer-events')).toBe('auto')
    })
  })

  it('handles have consistent sizing', () => {
    const rect = makeRect(svg, 0, 0, 100, 100)
    setSelection([rect])

    const handles = overlay.querySelectorAll('[data-role="scale-handle"]')
    const firstW = parseFloat(handles[0].getAttribute('width')!)
    const firstH = parseFloat(handles[0].getAttribute('height')!)
    expect(firstW).toBeGreaterThan(0)
    expect(firstW).toBe(firstH) // square handles

    handles.forEach((h) => {
      expect(parseFloat(h.getAttribute('width')!)).toBe(firstW)
      expect(parseFloat(h.getAttribute('height')!)).toBe(firstH)
    })
  })

  it('renders both selection box and handles', () => {
    const rect = makeRect(svg, 10, 20, 50, 30)
    setSelection([rect])

    const boxes = overlay.querySelectorAll('[data-role="selection-box"]')
    const handles = overlay.querySelectorAll('[data-role="scale-handle"]')
    expect(boxes.length).toBe(1)
    expect(handles.length).toBe(8)
  })

  it('clears handles when selection is cleared', () => {
    const rect = makeRect(svg, 0, 0, 50, 50)
    setSelection([rect])
    expect(overlay.querySelectorAll('[data-role="scale-handle"]').length).toBe(8)

    clearSelection()
    expect(overlay.querySelectorAll('[data-role="scale-handle"]').length).toBe(0)
  })

  it('shows corner rotation zones for single selection', () => {
    const rect = makeRect(svg, 10, 20, 50, 30)
    setSelection([rect])

    const rotHandles = overlay.querySelectorAll('[data-role="rotation-handle"]')
    expect(rotHandles.length).toBe(4) // one per corner
    expect(rotHandles[0].tagName).toBe('rect')
  })

  it('does not show rotation handle for multi-selection', () => {
    const r1 = makeRect(svg, 10, 20, 30, 20)
    const r2 = makeRect(svg, 50, 10, 40, 50)
    setSelection([r1, r2])

    const rotHandle = overlay.querySelector('[data-role="rotation-handle"]')
    expect(rotHandle).toBeNull()
  })

  it('corner rotation zones are positioned outside bbox corners', () => {
    const rect = makeRect(svg, 10, 20, 50, 30)
    setSelection([rect])

    const rotHandles = overlay.querySelectorAll('[data-role="rotation-handle"]')
    expect(rotHandles.length).toBe(4)

    // NW zone should be outside the top-left corner
    const nwZone = rotHandles[0]
    const zx = parseFloat(nwZone.getAttribute('x')!)
    const zy = parseFloat(nwZone.getAttribute('y')!)
    expect(zx).toBeLessThan(10) // left of bbox
    expect(zy).toBeLessThan(20) // above bbox
  })

  it('refreshOverlay recalculates handle positions', () => {
    const rect = makeRect(svg, 10, 20, 50, 30)
    setSelection([rect])

    // Move the element (simulating drag)
    rect.setAttribute('x', '100')
    rect.setAttribute('y', '200')
    ;(rect as unknown as { getBBox: () => DOMRect }).getBBox = () =>
      new DOMRect(100, 200, 50, 30)

    refreshOverlaySync()

    const nw = overlay.querySelector('[data-handle-pos="nw"]')!
    const cx = parseFloat(nw.getAttribute('x')!) + parseFloat(nw.getAttribute('width')!) / 2
    const cy = parseFloat(nw.getAttribute('y')!) + parseFloat(nw.getAttribute('height')!) / 2
    expect(cx).toBeCloseTo(100)
    expect(cy).toBeCloseTo(200)
  })
})

describe('pruneSelection (undo reconciliation — vectorfeld-3yu.9)', () => {
  let svg: SVGSVGElement
  let overlay: SVGGElement

  beforeEach(() => {
    document.body.innerHTML = ''
    svg = makeSvg()
    overlay = svg.querySelector('[data-role="overlay"]') as SVGGElement
    setOverlayGroup(overlay)
    clearSelection()
  })

  it('drops detached elements from the selection and reports the change', () => {
    const a = makeRect(svg, 10, 20, 50, 30)
    const b = makeRect(svg, 80, 20, 50, 30)
    setSelection([a, b])
    expect(getSelection()).toHaveLength(2)

    // Simulate an undo removing `a` from the document.
    a.remove()
    const changed = pruneSelection()

    expect(changed).toBe(true)
    expect(getSelection()).toEqual([b])
  })

  it('is a no-op (returns false) when all selected elements are still attached', () => {
    const a = makeRect(svg, 10, 20, 50, 30)
    setSelection([a])
    expect(pruneSelection()).toBe(false)
    expect(getSelection()).toEqual([a])
  })

  it('renders no phantom selection boxes for detached elements', () => {
    const a = makeRect(svg, 10, 20, 50, 30)
    setSelection([a])
    expect(overlay.querySelectorAll('[data-role="selection-box"]').length).toBe(1)

    // Element removed by an undo, but still lingering in `selected`.
    a.remove()
    refreshOverlaySync()
    expect(overlay.querySelectorAll('[data-role="selection-box"]').length).toBe(0)
    expect(overlay.querySelectorAll('[data-role="scale-handle"]').length).toBe(0)
  })
})
