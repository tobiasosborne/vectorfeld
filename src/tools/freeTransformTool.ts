/**
 * Free transform tool (Q) — unified scale + rotate + skew in one tool.
 *
 * Interactions:
 *   Corner handles → scale (shift = uniform)
 *   Outside corners → rotate (15° snap with shift)
 *   Edge midpoints + Ctrl → skew along that axis
 *
 * The bounding box follows the full transform matrix, drawing a
 * parallelogram for skewed elements.
 */
import { registerTool } from './registry'
import type { ToolConfig } from './registry'
import { screenToDoc } from '../model/coordinates'
import { getSelection, refreshOverlay } from '../model/selection'
import { CompoundCommand, ModifyAttributeCommand } from '../model/commands'
import type { DocumentModel } from '../model/document'
import type { CommandHistory } from '../model/commands'
import { parseTransform, applyMatrixToPoint, setSkew, parseSkew, type Matrix } from '../model/matrix'

type Pt = { x: number; y: number }
type Mode = 'idle' | 'scale' | 'rotate' | 'skew'

interface TransformState {
  mode: Mode
  el: Element
  origTransform: string
  origAttrs: Map<string, string>
  startMouse: Pt
  // Scale
  anchor: Pt
  origBBox: { x: number; y: number; width: number; height: number }
  // Rotate
  center: Pt
  startAngle: number
  // Skew
  skewAxis: 'x' | 'y'
}

function getBBoxCenter(el: Element): Pt {
  try {
    const b = (el as SVGGraphicsElement).getBBox()
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
  } catch {
    return { x: 0, y: 0 }
  }
}

function getBBox(el: Element) {
  try {
    const b = (el as SVGGraphicsElement).getBBox()
    return { x: b.x, y: b.y, width: b.width, height: b.height }
  } catch {
    return { x: 0, y: 0, width: 0, height: 0 }
  }
}

/** Distance from point to nearest corner of bbox, in screen-ish units */
function nearestCornerDist(pt: Pt, bbox: { x: number; y: number; width: number; height: number }, transform: Matrix): number {
  const corners = [
    { x: bbox.x, y: bbox.y },
    { x: bbox.x + bbox.width, y: bbox.y },
    { x: bbox.x + bbox.width, y: bbox.y + bbox.height },
    { x: bbox.x, y: bbox.y + bbox.height },
  ]
  let minDist = Infinity
  for (const c of corners) {
    const tc = applyMatrixToPoint(transform, c.x, c.y)
    const d = Math.hypot(pt.x - tc.x, pt.y - tc.y)
    if (d < minDist) minDist = d
  }
  return minDist
}

export function createFreeTransformTool(
  getSvg: () => SVGSVGElement | null,
  getDoc: () => DocumentModel | null,
  getHistory: () => CommandHistory
): ToolConfig {
  let state: TransformState | null = null

  function detectMode(svg: SVGSVGElement, el: Element, pt: Pt, ctrlKey: boolean): { mode: Mode; data?: Partial<TransformState> } {
    const bbox = getBBox(el)
    const transform = parseTransform(el.getAttribute('transform') || '')
    const tolerance = svg.viewBox.baseVal.width / svg.clientWidth * 10

    // Transform bbox corners to doc space
    const corners = [
      applyMatrixToPoint(transform, bbox.x, bbox.y),
      applyMatrixToPoint(transform, bbox.x + bbox.width, bbox.y),
      applyMatrixToPoint(transform, bbox.x + bbox.width, bbox.y + bbox.height),
      applyMatrixToPoint(transform, bbox.x, bbox.y + bbox.height),
    ]

    // Check if near a corner → scale
    for (let i = 0; i < 4; i++) {
      if (Math.hypot(pt.x - corners[i].x, pt.y - corners[i].y) < tolerance) {
        const anchor = corners[(i + 2) % 4] // opposite corner
        return { mode: 'scale', data: { anchor, origBBox: bbox } }
      }
    }

    // Check if near an edge midpoint + Ctrl → skew
    if (ctrlKey) {
      const edges = [
        { mid: midpoint(corners[0], corners[1]), axis: 'y' as const },
        { mid: midpoint(corners[1], corners[2]), axis: 'x' as const },
        { mid: midpoint(corners[2], corners[3]), axis: 'y' as const },
        { mid: midpoint(corners[3], corners[0]), axis: 'x' as const },
      ]
      for (const { mid, axis } of edges) {
        if (Math.hypot(pt.x - mid.x, pt.y - mid.y) < tolerance) {
          return { mode: 'skew', data: { skewAxis: axis } }
        }
      }
    }

    // Outside the bbox → rotate
    const cornerDist = nearestCornerDist(pt, bbox, transform)
    if (cornerDist > tolerance * 0.5) {
      const center = getBBoxCenter(el)
      const startAngle = Math.atan2(pt.y - center.y, pt.x - center.x)
      return { mode: 'rotate', data: { center, startAngle } }
    }

    return { mode: 'idle' }
  }

  return {
    name: 'free-transform',
    icon: 'Q',
    shortcut: 'q',
    cursor: 'default',
    handlers: {
      onMouseDown(e: MouseEvent) {
        const svg = getSvg()
        if (!svg || e.button !== 0) return
        const sel = getSelection()
        if (sel.length !== 1) return
        const el = sel[0]
        const pt = screenToDoc(svg, e.clientX, e.clientY)

        const { mode, data } = detectMode(svg, el, pt, e.ctrlKey)
        if (mode === 'idle') return

        const origAttrs = new Map<string, string>()
        for (const attr of el.attributes) {
          origAttrs.set(attr.name, attr.value)
        }

        state = {
          mode,
          el,
          origTransform: el.getAttribute('transform') || '',
          origAttrs,
          startMouse: pt,
          anchor: data?.anchor || { x: 0, y: 0 },
          origBBox: data?.origBBox || getBBox(el),
          center: data?.center || getBBoxCenter(el),
          startAngle: data?.startAngle || 0,
          skewAxis: data?.skewAxis || 'x',
        }
      },

      onMouseMove(e: MouseEvent) {
        if (!state) return
        const svg = getSvg()
        if (!svg) return
        const pt = screenToDoc(svg, e.clientX, e.clientY)
        const el = state.el

        if (state.mode === 'scale') {
          const { anchor, origBBox } = state
          const sx = origBBox.width > 0 ? (pt.x - anchor.x) / (state.startMouse.x - anchor.x) : 1
          const sy = origBBox.height > 0 ? (pt.y - anchor.y) / (state.startMouse.y - anchor.y) : 1
          const finalSx = e.shiftKey ? Math.sign(sx) * Math.max(Math.abs(sx), Math.abs(sy)) : sx
          const finalSy = e.shiftKey ? finalSx : sy

          // Apply scale to geometry attributes
          applyScale(el, state.origAttrs, origBBox, anchor, finalSx, finalSy)
          refreshOverlay()
        } else if (state.mode === 'rotate') {
          const { center, startAngle } = state
          let angle = Math.atan2(pt.y - center.y, pt.x - center.x) - startAngle
          let degrees = angle * (180 / Math.PI)
          if (e.shiftKey) degrees = Math.round(degrees / 15) * 15

          // Preserve existing rotation center, replace angle
          const existingSkew = parseSkew(state.origTransform)
          let t = `rotate(${degrees.toFixed(2)}, ${center.x.toFixed(2)}, ${center.y.toFixed(2)})`
          t = setSkew(t, existingSkew.skewX, existingSkew.skewY)
          el.setAttribute('transform', t)
          refreshOverlay()
        } else if (state.mode === 'skew') {
          const { center } = state
          const dx = pt.x - state.startMouse.x
          const dy = pt.y - state.startMouse.y
          const skewAngle = state.skewAxis === 'x'
            ? Math.atan2(dx, 50) * (180 / Math.PI)
            : Math.atan2(dy, 50) * (180 / Math.PI)

          const existing = state.origTransform
          const skew = parseSkew(existing)
          const newSkewX = state.skewAxis === 'x' ? skewAngle : skew.skewX
          const newSkewY = state.skewAxis === 'y' ? skewAngle : skew.skewY
          el.setAttribute('transform', setSkew(existing, newSkewX, newSkewY))
          refreshOverlay()
        }
      },

      onMouseUp() {
        if (!state) return
        const el = state.el
        const history = getHistory()

        // Commit changes as undoable commands
        const cmds: ModifyAttributeCommand[] = []
        for (const [attr, origVal] of state.origAttrs) {
          const newVal = el.getAttribute(attr)
          if (newVal !== origVal) {
            // Temporarily restore original so command captures the diff correctly
            el.setAttribute(attr, origVal)
            cmds.push(new ModifyAttributeCommand(el, attr, newVal || ''))
          }
        }
        // Handle newly added attributes (like transform)
        const currentTransform = el.getAttribute('transform')
        if (currentTransform && !state.origAttrs.has('transform')) {
          cmds.push(new ModifyAttributeCommand(el, 'transform', currentTransform))
        }

        if (cmds.length > 0) {
          history.execute(new CompoundCommand(cmds, `Free Transform (${state.mode})`))
        }
        state = null
        refreshOverlay()
      },
    },
  }
}

// ── Helpers ────────────────────────────────────────────────────────────

function midpoint(a: Pt, b: Pt): Pt {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

function applyScale(
  el: Element,
  origAttrs: Map<string, string>,
  bbox: { x: number; y: number; width: number; height: number },
  anchor: Pt,
  sx: number, sy: number
) {
  const tag = el.tagName
  const getOrig = (attr: string) => parseFloat(origAttrs.get(attr) || '0')

  if (tag === 'rect' || tag === 'image') {
    el.setAttribute('x', String(anchor.x + (getOrig('x') - anchor.x) * sx))
    el.setAttribute('y', String(anchor.y + (getOrig('y') - anchor.y) * sy))
    el.setAttribute('width', String(Math.abs(getOrig('width') * sx)))
    el.setAttribute('height', String(Math.abs(getOrig('height') * sy)))
  } else if (tag === 'ellipse') {
    el.setAttribute('cx', String(anchor.x + (getOrig('cx') - anchor.x) * sx))
    el.setAttribute('cy', String(anchor.y + (getOrig('cy') - anchor.y) * sy))
    el.setAttribute('rx', String(Math.abs(getOrig('rx') * sx)))
    el.setAttribute('ry', String(Math.abs(getOrig('ry') * sy)))
  } else if (tag === 'circle') {
    const scale = Math.max(Math.abs(sx), Math.abs(sy))
    el.setAttribute('cx', String(anchor.x + (getOrig('cx') - anchor.x) * sx))
    el.setAttribute('cy', String(anchor.y + (getOrig('cy') - anchor.y) * sy))
    el.setAttribute('r', String(Math.abs(getOrig('r') * scale)))
  } else if (tag === 'line') {
    el.setAttribute('x1', String(anchor.x + (getOrig('x1') - anchor.x) * sx))
    el.setAttribute('y1', String(anchor.y + (getOrig('y1') - anchor.y) * sy))
    el.setAttribute('x2', String(anchor.x + (getOrig('x2') - anchor.x) * sx))
    el.setAttribute('y2', String(anchor.y + (getOrig('y2') - anchor.y) * sy))
  }
  // paths and groups use transform-based scaling (handled elsewhere)
}

export function registerFreeTransformTool(
  getSvg: () => SVGSVGElement | null,
  getDoc: () => DocumentModel | null,
  getHistory: () => CommandHistory
): void {
  registerTool(createFreeTransformTool(getSvg, getDoc, getHistory))
}
