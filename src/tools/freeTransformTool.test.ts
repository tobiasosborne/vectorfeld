import { describe, it, expect, beforeEach } from 'vitest'
import { createFreeTransformTool } from './freeTransformTool'
import { setSelection, clearSelection, setOverlayGroup } from '../model/selection'
import { CommandHistory } from '../model/commands'
import { parseTransform, decomposeMatrix, applyMatrixToPoint, matrixToString, type Matrix } from '../model/matrix'

// ── Harness ──────────────────────────────────────────────────────────────
//
// jsdom does not implement SVG geometry (getScreenCTM / createSVGPoint /
// getBBox). We mock an *identity* CTM so document coords == client coords,
// which keeps the rotate-handle math easy to reason about, and mock getBBox
// per element. This mirrors selectTool.test.ts's makeSvg/mockScreenToDoc.

function makeSvg(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  // viewBox == client size → identity scale → doc coords == client coords.
  svg.setAttribute('viewBox', '0 0 800 600')
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

function mockIdentityCTM(svg: SVGSVGElement) {
  svg.getScreenCTM = () =>
    ({
      a: 1, b: 0, c: 0, d: 1, e: 0, f: 0,
      inverse() {
        return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }
      },
    }) as unknown as DOMMatrix
  svg.createSVGPoint = () =>
    ({
      x: 0,
      y: 0,
      matrixTransform(this: { x: number; y: number }, m: DOMMatrix) {
        const mm = m as unknown as { a: number; b: number; c: number; d: number; e: number; f: number }
        return {
          x: mm.a * this.x + mm.c * this.y + mm.e,
          y: mm.b * this.x + mm.d * this.y + mm.f,
        }
      },
    }) as unknown as SVGPoint
}

/** Append an element with the given tag, transform, and mocked local getBBox. */
function addEl(
  svg: SVGSVGElement,
  tag: string,
  transform: string,
  bbox: { x: number; y: number; width: number; height: number }
): Element {
  const layer = svg.querySelector('g[data-layer-name]')!
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag)
  if (transform) el.setAttribute('transform', transform)
  ;(el as any).getBBox = () => bbox
  layer.appendChild(el)
  return el
}

function md(clientX: number, clientY: number, opts: Partial<MouseEventInit> = {}): MouseEvent {
  return new MouseEvent('mousedown', { clientX, clientY, button: 0, ...opts })
}
function mm(clientX: number, clientY: number, opts: Partial<MouseEventInit> = {}): MouseEvent {
  return new MouseEvent('mousemove', { clientX, clientY, ...opts })
}
function mu(clientX: number, clientY: number, opts: Partial<MouseEventInit> = {}): MouseEvent {
  return new MouseEvent('mouseup', { clientX, clientY, ...opts })
}

/**
 * Drive a rotate gesture and return the committed transform string.
 * The bbox center (in doc space) is the rotation pivot. We mousedown well
 * outside the bbox (→ rotate mode), then move to a point that subtends the
 * requested rotation angle about the center, then mouseup to commit.
 */
function driveRotate(
  tool: ReturnType<typeof createFreeTransformTool>,
  el: Element,
  center: { x: number; y: number },
  startVec: { x: number; y: number },
  rotateDeg: number,
  opts: Partial<MouseEventInit> = {}
): string | null {
  // Start point: center + startVec (a generous radius keeps us outside bbox).
  const sx = center.x + startVec.x
  const sy = center.y + startVec.y
  // End point: rotate startVec by rotateDeg about the origin.
  const rad = (rotateDeg * Math.PI) / 180
  const ex = center.x + (startVec.x * Math.cos(rad) - startVec.y * Math.sin(rad))
  const ey = center.y + (startVec.x * Math.sin(rad) + startVec.y * Math.cos(rad))

  tool.handlers.onMouseDown!(md(sx, sy, opts))
  tool.handlers.onMouseMove!(mm(ex, ey, opts))
  tool.handlers.onMouseUp!(mu(ex, ey, opts))
  return el.getAttribute('transform')
}

describe('freeTransformTool', () => {
  // ── Original config tests (preserved) ───────────────────────────────────
  it('creates tool with correct config', () => {
    const tool = createFreeTransformTool(
      () => null,
      () => null,
      () => ({ execute: () => {}, undo: () => {}, redo: () => {}, canUndo: false, canRedo: false, subscribe: () => () => {} }) as any
    )
    expect(tool.name).toBe('free-transform')
    expect(tool.shortcut).toBe('q')
    expect(tool.cursor).toBe('default')
  })

  it('has all required handlers', () => {
    const tool = createFreeTransformTool(() => null, () => null, () => ({} as any))
    expect(typeof tool.handlers.onMouseDown).toBe('function')
    expect(typeof tool.handlers.onMouseMove).toBe('function')
    expect(typeof tool.handlers.onMouseUp).toBe('function')
  })

  it('onMouseDown does nothing without svg', () => {
    const tool = createFreeTransformTool(() => null, () => null, () => ({} as any))
    const event = new MouseEvent('mousedown', { button: 0 })
    tool.handlers.onMouseDown!(event)
  })

  it('onMouseMove does nothing when idle', () => {
    const tool = createFreeTransformTool(() => null, () => null, () => ({} as any))
    const event = new MouseEvent('mousemove')
    tool.handlers.onMouseMove!(event)
  })

  it('onMouseUp does nothing when idle', () => {
    const tool = createFreeTransformTool(() => null, () => null, () => ({} as any))
    const event = new MouseEvent('mouseup')
    tool.handlers.onMouseUp!(event)
  })

  it('ignores non-left mouse button', () => {
    const tool = createFreeTransformTool(() => null, () => null, () => ({} as any))
    const event = new MouseEvent('mousedown', { button: 2 })
    tool.handlers.onMouseDown!(event)
  })

  it('ignores mousedown when no selection', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as unknown as SVGSVGElement
    svg.setAttribute('viewBox', '0 0 210 297')
    Object.defineProperty(svg, 'clientWidth', { value: 800 })
    Object.defineProperty(svg, 'clientHeight', { value: 600 })

    const tool = createFreeTransformTool(() => svg, () => null, () => ({} as any))
    const event = new MouseEvent('mousedown', { button: 0, clientX: 100, clientY: 100 })
    tool.handlers.onMouseDown!(event)
  })

  it('icon is Q', () => {
    const tool = createFreeTransformTool(() => null, () => null, () => ({} as any))
    expect(tool.icon).toBe('Q')
  })

  // ── Regression: matrix() rotation preserves translate + scale ────────────
  //
  // vectorfeld-3yu.8 — every MuPDF-imported element carries a matrix(a,b,c,d,e,f).
  // The old rotate path rebuilt a rotate() string from decomposeMatrix.rotate +
  // parseSkew (which is blind to matrix()), discarding (e,f) translate AND
  // scaleX/scaleY. Composing rotateMatrix onto the original matrix preserves them.
  describe('rotate preserves matrix() translate + scale (vectorfeld-3yu.8)', () => {
    let svg: SVGSVGElement
    let history: CommandHistory

    beforeEach(() => {
      document.body.innerHTML = ''
      clearSelection()
      svg = makeSvg()
      mockIdentityCTM(svg)
      history = new CommandHistory()
      setOverlayGroup(svg.querySelector('g[data-role="overlay"]') as SVGGElement)
    })

    function makeTool() {
      return createFreeTransformTool(() => svg, () => null, () => history)
    }

    it('non-<g> matrix() element: scale=2 AND translate SURVIVE a rotate', () => {
      // matrix(2,0,0,2,100,50): 2x scale, translated to (100,50).
      const orig: Matrix = [2, 0, 0, 2, 100, 50]
      const el = addEl(svg, 'rect', matrixToString(orig), { x: 0, y: 0, width: 10, height: 10 })
      setSelection([el])
      const tool = makeTool()

      // Rotation pivot = bbox center transformed to doc space.
      const center = applyMatrixToPoint(orig, 5, 5) // (110, 60)
      const committed = driveRotate(tool, el, center, { x: 80, y: 0 }, 30)
      expect(committed).toBeTruthy()

      const m = parseTransform(committed!)
      const d = decomposeMatrix(m)

      // Scale must still be 2 (NOT collapsed to 1) on both axes.
      expect(Math.abs(d.scaleX)).toBeCloseTo(2, 4)
      expect(d.scaleY).toBeCloseTo(2, 4)

      // Rotation must be ~30°.
      expect(d.rotate).toBeCloseTo(30, 3)

      // Translate must NOT reset to ~0. The new translate is the original
      // translate (100,50) rotated about the pivot — compute the expected
      // value via the same matrix composition and compare.
      const rotM = parseTransform(`rotate(30, ${center.x}, ${center.y})`)
      const expected = applyMatrixToPoint(rotM, 100, 50)
      expect(m[4]).toBeCloseTo(expected.x, 2)
      expect(m[5]).toBeCloseTo(expected.y, 2)
      // Sanity: it really did move away from the origin (no teleport-to-0).
      expect(Math.hypot(m[4], m[5])).toBeGreaterThan(50)
    })

    it('0° rotation round-trips to the original matrix', () => {
      const orig: Matrix = [2, 0, 0, 2, 100, 50]
      const el = addEl(svg, 'rect', matrixToString(orig), { x: 0, y: 0, width: 10, height: 10 })
      setSelection([el])
      const tool = makeTool()

      const center = applyMatrixToPoint(orig, 5, 5)
      // 0° drag (start == end angle) → identity rotation composed onto orig.
      const committed = driveRotate(tool, el, center, { x: 80, y: 0 }, 0)

      // With zero net rotation the attribute may be unchanged from orig OR a
      // re-serialized identical matrix. Either way it must equal orig numerically.
      const m = committed ? parseTransform(committed) : orig
      for (let i = 0; i < 6; i++) {
        expect(m[i]).toBeCloseTo(orig[i], 4)
      }
    })

    it('<g> branch still composes correctly (regression)', () => {
      const orig: Matrix = [1.5, 0, 0, 1.5, 40, 20]
      const el = addEl(svg, 'g', matrixToString(orig), { x: 0, y: 0, width: 20, height: 20 })
      setSelection([el])
      const tool = makeTool()

      const center = applyMatrixToPoint(orig, 10, 10)
      const committed = driveRotate(tool, el, center, { x: 90, y: 0 }, 45)
      expect(committed).toBeTruthy()

      const m = parseTransform(committed!)
      const d = decomposeMatrix(m)
      expect(Math.abs(d.scaleX)).toBeCloseTo(1.5, 4)
      expect(d.scaleY).toBeCloseTo(1.5, 4)
      expect(d.rotate).toBeCloseTo(45, 3)

      // Compare against the explicit reference composition used by the tool.
      const ref = matrixToString(
        parseTransform(`rotate(45, ${center.x}, ${center.y})`)
      )
      const refM = parseTransform(ref)
      // The group transform == rotate(45,center) * orig.
      const expected = [
        refM[0] * orig[0] + refM[2] * orig[1],
        refM[1] * orig[0] + refM[3] * orig[1],
        refM[0] * orig[2] + refM[2] * orig[3],
        refM[1] * orig[2] + refM[3] * orig[3],
        refM[0] * orig[4] + refM[2] * orig[5] + refM[4],
        refM[1] * orig[4] + refM[3] * orig[5] + refM[5],
      ]
      for (let i = 0; i < 6; i++) expect(m[i]).toBeCloseTo(expected[i], 2)
    })

    it('matrix() and <g> rotate paths agree for identical inputs (collapsed branch)', () => {
      // Same orig matrix on a rect and a g → identical committed transform,
      // proving the two branches were correctly unified.
      const orig: Matrix = [2, 0, 0, 2, 100, 50]
      const center = applyMatrixToPoint(orig, 5, 5)

      const rect = addEl(svg, 'rect', matrixToString(orig), { x: 0, y: 0, width: 10, height: 10 })
      setSelection([rect])
      const rectT = driveRotate(makeTool(), rect, center, { x: 80, y: 0 }, 30)
      clearSelection()

      const g = addEl(svg, 'g', matrixToString(orig), { x: 0, y: 0, width: 10, height: 10 })
      setSelection([g])
      const gT = driveRotate(makeTool(), g, center, { x: 80, y: 0 }, 30)

      const rm = parseTransform(rectT!)
      const gm = parseTransform(gT!)
      for (let i = 0; i < 6; i++) expect(rm[i]).toBeCloseTo(gm[i], 4)
    })
  })
})
