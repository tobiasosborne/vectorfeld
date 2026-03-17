import { registerTool } from './registry'
import type { ToolConfig } from './registry'
import { screenToDoc } from '../model/coordinates'
import { setSelection, clearSelection, toggleSelection, getSelection, refreshOverlay, refreshOverlaySync } from '../model/selection'
import type { HandlePosition } from '../model/selection'
import type { DocumentModel } from '../model/document'
import type { CommandHistory } from '../model/commands'
import { CompoundCommand, ModifyAttributeCommand } from '../model/commands'
import { snapToGrid } from '../model/grid'
import { computeSmartGuides, renderGuides, clearGuides, cacheSmartGuideCandidates, clearCachedCandidates } from '../model/smartGuides'
import { transformedAABB, hitTestElement, hitTestAll } from '../model/geometry'
import { scalePathD, translatePathD } from '../model/pathOps'
import { parseTransform, multiplyMatrix, translateMatrix, rotateMatrix, invertMatrix, matrixToString, applyMatrixToPoint, scaleAroundMatrix } from '../model/matrix'

// Named constants
const MIN_BBOX_DIM = 0.001       // Minimum bbox dimension to avoid division by zero
const MIN_SCALE_SIZE = 0.1       // Minimum width/height during scale
const ROTATION_SNAP_DEG = 15     // Shift-constrained rotation increment
const MARQUEE_THRESHOLD = 0.5    // Doc-space threshold for click-vs-drag (marquee)
const MOVE_DEAD_ZONE = 0.01      // Doc-space dead zone for move commit

type DragMode = 'none' | 'move' | 'scale' | 'rotate' | 'marquee'

interface ScaleState {
  handle: HandlePosition
  anchorX: number
  anchorY: number
  origBBox: { x: number; y: number; width: number; height: number }
}

interface RotateState {
  centerX: number
  centerY: number
  startAngle: number
  origTransform: string | null
}

interface DragState {
  mode: DragMode
  startX: number
  startY: number
  startPositions: Map<Element, { attr: string; vals: Record<string, number> }>
  origTransforms: Map<Element, string | null>
  origPathDs: Map<Element, string>
  scale: ScaleState | null
  rotate: RotateState | null
  marqueeRect: SVGRectElement | null
}

/** Get all geometry attributes for an element (position + size) */
function getAllGeomAttrs(el: Element): Record<string, number> {
  const tag = el.tagName
  if (tag === 'line') {
    return {
      x1: parseFloat(el.getAttribute('x1') || '0'),
      y1: parseFloat(el.getAttribute('y1') || '0'),
      x2: parseFloat(el.getAttribute('x2') || '0'),
      y2: parseFloat(el.getAttribute('y2') || '0'),
    }
  } else if (tag === 'rect' || tag === 'image') {
    return {
      x: parseFloat(el.getAttribute('x') || '0'),
      y: parseFloat(el.getAttribute('y') || '0'),
      width: parseFloat(el.getAttribute('width') || '0'),
      height: parseFloat(el.getAttribute('height') || '0'),
    }
  } else if (tag === 'ellipse') {
    return {
      cx: parseFloat(el.getAttribute('cx') || '0'),
      cy: parseFloat(el.getAttribute('cy') || '0'),
      rx: parseFloat(el.getAttribute('rx') || '0'),
      ry: parseFloat(el.getAttribute('ry') || '0'),
    }
  } else if (tag === 'circle') {
    return {
      cx: parseFloat(el.getAttribute('cx') || '0'),
      cy: parseFloat(el.getAttribute('cy') || '0'),
      r: parseFloat(el.getAttribute('r') || '0'),
    }
  } else if (tag === 'text') {
    return {
      x: parseFloat(el.getAttribute('x') || '0'),
      y: parseFloat(el.getAttribute('y') || '0'),
      'font-size': parseFloat(el.getAttribute('font-size') || '16'),
    }
  }
  return {}
}

/** Compute the anchor point (opposite corner/edge) for a given handle */
function computeAnchor(
  handle: HandlePosition,
  bbox: { x: number; y: number; width: number; height: number }
): { x: number; y: number } {
  const cx = bbox.x + bbox.width / 2
  const cy = bbox.y + bbox.height / 2
  switch (handle) {
    case 'nw': return { x: bbox.x + bbox.width, y: bbox.y + bbox.height }
    case 'n':  return { x: cx, y: bbox.y + bbox.height }
    case 'ne': return { x: bbox.x, y: bbox.y + bbox.height }
    case 'e':  return { x: bbox.x, y: cy }
    case 'se': return { x: bbox.x, y: bbox.y }
    case 's':  return { x: cx, y: bbox.y }
    case 'sw': return { x: bbox.x + bbox.width, y: bbox.y }
    case 'w':  return { x: bbox.x + bbox.width, y: cy }
    default:   return { x: cx, y: cy } // fallback: center
  }
}

/** Which axes does this handle scale? */
function handleAxes(handle: HandlePosition): { scaleX: boolean; scaleY: boolean } {
  switch (handle) {
    case 'n': case 's':  return { scaleX: false, scaleY: true }
    case 'e': case 'w':  return { scaleX: true, scaleY: false }
    default:             return { scaleX: true, scaleY: true } // corners
  }
}

/** Compute union bounding box of elements (transform-aware) */
function unionBBox(elements: Element[]): { x: number; y: number; width: number; height: number } | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  let hasBox = false
  for (const el of elements) {
    try {
      const bbox = (el as SVGGraphicsElement).getBBox()
      const transform = el.getAttribute('transform')
      const aabb = transformedAABB(bbox, transform)
      minX = Math.min(minX, aabb.x)
      minY = Math.min(minY, aabb.y)
      maxX = Math.max(maxX, aabb.x + aabb.width)
      maxY = Math.max(maxY, aabb.y + aabb.height)
      hasBox = true
    } catch { /* skip */ }
  }
  if (!hasBox) return null
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

export function createSelectTool(
  getSvg: () => SVGSVGElement | null,
  _getDoc: () => DocumentModel | null,
  getHistory: () => CommandHistory
): ToolConfig {
  const dragState: DragState = {
    mode: 'none',
    startX: 0,
    startY: 0,
    startPositions: new Map(),
    origTransforms: new Map(),
    origPathDs: new Map(),
    scale: null,
    rotate: null,
    marqueeRect: null,
  }

  function getPositionAttrs(el: Element): { attr: string; vals: Record<string, number> } {
    const tag = el.tagName
    if (tag === 'line') {
      return { attr: 'line', vals: { x1: parseFloat(el.getAttribute('x1') || '0'), y1: parseFloat(el.getAttribute('y1') || '0'), x2: parseFloat(el.getAttribute('x2') || '0'), y2: parseFloat(el.getAttribute('y2') || '0') } }
    } else if (tag === 'rect' || tag === 'image') {
      return { attr: 'rect', vals: { x: parseFloat(el.getAttribute('x') || '0'), y: parseFloat(el.getAttribute('y') || '0') } }
    } else if (tag === 'ellipse') {
      return { attr: 'ellipse', vals: { cx: parseFloat(el.getAttribute('cx') || '0'), cy: parseFloat(el.getAttribute('cy') || '0') } }
    } else if (tag === 'circle') {
      return { attr: 'circle', vals: { cx: parseFloat(el.getAttribute('cx') || '0'), cy: parseFloat(el.getAttribute('cy') || '0') } }
    } else if (tag === 'text') {
      return { attr: 'text', vals: { x: parseFloat(el.getAttribute('x') || '0'), y: parseFloat(el.getAttribute('y') || '0') } }
    }
    // For path, g, and other elements: track via transform
    return { attr: 'transform', vals: {} }
  }

  function moveElement(el: Element, dx: number, dy: number) {
    const tag = el.tagName
    const start = dragState.startPositions.get(el)
    if (!start) return

    if (tag === 'line') {
      el.setAttribute('x1', String(start.vals.x1 + dx))
      el.setAttribute('y1', String(start.vals.y1 + dy))
      el.setAttribute('x2', String(start.vals.x2 + dx))
      el.setAttribute('y2', String(start.vals.y2 + dy))
    } else if (tag === 'rect' || tag === 'text' || tag === 'image') {
      el.setAttribute('x', String(start.vals.x + dx))
      el.setAttribute('y', String(start.vals.y + dy))
    } else if (tag === 'ellipse' || tag === 'circle') {
      el.setAttribute('cx', String(start.vals.cx + dx))
      el.setAttribute('cy', String(start.vals.cy + dy))
    } else if (tag === 'path') {
      // Bake translation into d coordinates directly
      const origD = dragState.origPathDs.get(el) || el.getAttribute('d') || ''
      el.setAttribute('d', translatePathD(origD, dx, dy))
    }

    // Update transform
    const origTransform = dragState.origTransforms.get(el)
    if (origTransform !== undefined) {
      const orig = origTransform || ''
      if (start.attr === 'transform' && tag !== 'path') {
        // Groups: compose translate with full original transform via matrix
        const origM = parseTransform(orig)
        const newM = multiplyMatrix(translateMatrix(dx, dy), origM)
        el.setAttribute('transform', matrixToString(newM))
      } else if (orig) {
        // Elements with position attrs: shift rotation center, preserve skew
        const rotMatch = orig.match(/rotate\(([-\d.]+)(?:,\s*([-\d.]+),\s*([-\d.]+))?\)/)
        if (rotMatch) {
          const angle = rotMatch[1]
          const cx = parseFloat(rotMatch[2] || '0') + dx
          const cy = parseFloat(rotMatch[3] || '0') + dy
          let newTransform = `rotate(${angle}, ${cx}, ${cy})`
          const skewXMatch = orig.match(/skewX\([^)]+\)/)
          const skewYMatch = orig.match(/skewY\([^)]+\)/)
          if (skewXMatch) newTransform += ` ${skewXMatch[0]}`
          if (skewYMatch) newTransform += ` ${skewYMatch[0]}`
          el.setAttribute('transform', newTransform)
        } else {
          // Fallback for non-standard transforms (e.g., imported matrix()):
          // pre-multiply T(dx,dy) * orig to translate in doc space
          const origM = parseTransform(orig)
          const newM = multiplyMatrix(translateMatrix(dx, dy), origM)
          el.setAttribute('transform', matrixToString(newM))
        }
      }
    }
  }

  /** Apply scale factors to an element relative to an anchor point */
  function scaleElement(el: Element, sx: number, sy: number, anchorX: number, anchorY: number) {
    const start = dragState.startPositions.get(el)
    if (!start) return
    const tag = el.tagName

    if (tag === 'rect' || tag === 'image') {
      const origX = start.vals.x, origY = start.vals.y
      const origW = start.vals.width, origH = start.vals.height
      el.setAttribute('x', String(anchorX + (origX - anchorX) * sx))
      el.setAttribute('y', String(anchorY + (origY - anchorY) * sy))
      el.setAttribute('width', String(Math.abs(origW * sx)))
      el.setAttribute('height', String(Math.abs(origH * sy)))
    } else if (tag === 'ellipse') {
      const origCx = start.vals.cx, origCy = start.vals.cy
      const origRx = start.vals.rx, origRy = start.vals.ry
      el.setAttribute('cx', String(anchorX + (origCx - anchorX) * sx))
      el.setAttribute('cy', String(anchorY + (origCy - anchorY) * sy))
      el.setAttribute('rx', String(Math.abs(origRx * sx)))
      el.setAttribute('ry', String(Math.abs(origRy * sy)))
    } else if (tag === 'circle') {
      const origCx = start.vals.cx, origCy = start.vals.cy
      const origR = start.vals.r
      // Use average of active axes so edge handles can shrink the radius
      const activeSx = sx !== 1 ? Math.abs(sx) : Math.abs(sy)
      const activeSy = sy !== 1 ? Math.abs(sy) : Math.abs(sx)
      const s = (activeSx + activeSy) / 2
      el.setAttribute('cx', String(anchorX + (origCx - anchorX) * sx))
      el.setAttribute('cy', String(anchorY + (origCy - anchorY) * sy))
      el.setAttribute('r', String(origR * s))
    } else if (tag === 'line') {
      el.setAttribute('x1', String(anchorX + (start.vals.x1 - anchorX) * sx))
      el.setAttribute('y1', String(anchorY + (start.vals.y1 - anchorY) * sy))
      el.setAttribute('x2', String(anchorX + (start.vals.x2 - anchorX) * sx))
      el.setAttribute('y2', String(anchorY + (start.vals.y2 - anchorY) * sy))
    } else if (tag === 'text') {
      const origX = start.vals.x, origY = start.vals.y
      const origFs = start.vals['font-size']
      const s = Math.max(Math.abs(sx), Math.abs(sy))
      el.setAttribute('x', String(anchorX + (origX - anchorX) * sx))
      el.setAttribute('y', String(anchorY + (origY - anchorY) * sy))
      el.setAttribute('font-size', String(origFs * s))
    } else if (tag === 'path') {
      const origD = dragState.origPathDs.get(el) || el.getAttribute('d') || ''
      el.setAttribute('d', scalePathD(origD, sx, sy, anchorX, anchorY))
    } else if (tag === 'g' || tag === 'polygon' || tag === 'polyline') {
      // Scale via transform composition: origTransform * scale_around(anchor)
      const origT = dragState.origTransforms.get(el) || ''
      const origM = parseTransform(origT)
      const newM = multiplyMatrix(origM, scaleAroundMatrix(sx, sy, anchorX, anchorY))
      el.setAttribute('transform', matrixToString(newM))
    }
  }

  /** Commit changed attributes via CompoundCommand (reset-then-execute pattern) */
  function commitChanges(description: string) {
    const commands: ModifyAttributeCommand[] = []
    for (const el of getSelection()) {
      const start = dragState.startPositions.get(el)
      if (!start) continue
      for (const [attr, origVal] of Object.entries(start.vals)) {
        const newVal = el.getAttribute(attr)
        if (newVal !== null && newVal !== String(origVal)) {
          commands.push(new ModifyAttributeCommand(el, attr, newVal))
          el.setAttribute(attr, String(origVal))
        }
      }
      // Commit path d attribute changes
      const origD = dragState.origPathDs.get(el)
      if (origD !== undefined) {
        const newD = el.getAttribute('d')
        if (newD !== null && newD !== origD) {
          commands.push(new ModifyAttributeCommand(el, 'd', newD))
          el.setAttribute('d', origD)
        }
      }
      // Also commit transform changes (rotation center moves with element)
      const origTransform = dragState.origTransforms.get(el)
      if (origTransform !== undefined) {
        const newTransform = el.getAttribute('transform')
        if (newTransform !== origTransform) {
          commands.push(new ModifyAttributeCommand(el, 'transform', newTransform || ''))
          if (origTransform) {
            el.setAttribute('transform', origTransform)
          } else {
            el.removeAttribute('transform')
          }
        }
      }
    }
    if (commands.length > 0) {
      getHistory().execute(new CompoundCommand(commands, description))
    }
    dragState.startPositions.clear()
    dragState.origTransforms.clear()
    dragState.origPathDs.clear()
  }

  return {
    name: 'select',
    icon: 'V',
    shortcut: 'v',
    cursor: 'default',
    onDeactivate() {
      if (dragState.marqueeRect) {
        dragState.marqueeRect.remove()
        dragState.marqueeRect = null
      }
      dragState.mode = 'none'
      dragState.startPositions.clear()
      dragState.origTransforms.clear()
      dragState.origPathDs.clear()
      dragState.rotate = null
      dragState.scale = null
      clearGuides()
    },
    handlers: {
      onMouseDown(e: MouseEvent) {
        const svg = getSvg()
        if (!svg || e.button !== 0) return

        // Check if clicking on the rotation handle
        const target = e.target instanceof Element ? e.target : null
        if (target?.getAttribute('data-role') === 'rotation-handle') {
          const sel = getSelection()
          if (sel.length === 1) {
            const pt = screenToDoc(svg, e.clientX, e.clientY)
            // Transform local bbox center to doc space for correct angle computation
            const localBBox = (sel[0] as SVGGraphicsElement).getBBox()
            const localCx = localBBox.x + localBBox.width / 2
            const localCy = localBBox.y + localBBox.height / 2
            const elTransform = sel[0].getAttribute('transform')
            const elM = parseTransform(elTransform || '')
            const docCenter = applyMatrixToPoint(elM, localCx, localCy)
            const cx = docCenter.x
            const cy = docCenter.y
            const startAngle = Math.atan2(pt.y - cy, pt.x - cx)
            dragState.mode = 'rotate'
            dragState.startX = pt.x
            dragState.startY = pt.y
            dragState.startPositions.clear()
            const el = sel[0]
            dragState.startPositions.set(el, { attr: el.tagName, vals: { transform: 0 } })
            dragState.rotate = {
              centerX: cx,
              centerY: cy,
              startAngle,
              origTransform: el.getAttribute('transform'),
            }
            return
          }
        }

        // Check if clicking on a scale handle
        if (target?.getAttribute('data-role') === 'scale-handle') {
          const handle = target.getAttribute('data-handle-pos') as HandlePosition
          if (handle) {
            const sel = getSelection()

            // For single rotated element, use local bbox so anchor is in local space
            // (scaleElement modifies local-space attributes like x/y/width/height)
            let bbox: { x: number; y: number; width: number; height: number } | null
            if (sel.length === 1 && sel[0].getAttribute('transform')) {
              const lb = (sel[0] as SVGGraphicsElement).getBBox()
              bbox = { x: lb.x, y: lb.y, width: lb.width, height: lb.height }
            } else {
              bbox = unionBBox(sel)
            }
            if (!bbox) return

            const pt = screenToDoc(svg, e.clientX, e.clientY)
            dragState.mode = 'scale'
            dragState.startX = pt.x
            dragState.startY = pt.y
            dragState.startPositions.clear()
            dragState.origTransforms.clear()
            dragState.origPathDs.clear()
            for (const el of sel) {
              dragState.startPositions.set(el, { attr: el.tagName, vals: getAllGeomAttrs(el) })
              dragState.origTransforms.set(el, el.getAttribute('transform'))
              if (el.tagName === 'path') {
                dragState.origPathDs.set(el, el.getAttribute('d') || '')
              }
            }
            const anchor = computeAnchor(handle, bbox)
            dragState.scale = {
              handle,
              anchorX: anchor.x,
              anchorY: anchor.y,
              origBBox: bbox,
            }
            return
          }
        }

        const hit = hitTestElement(svg, e.clientX, e.clientY)
        const pt = screenToDoc(svg, e.clientX, e.clientY)

        // Alt+click: cycle through stacked elements
        if (e.altKey && hit && !e.shiftKey) {
          const allHits = hitTestAll(svg, e.clientX, e.clientY)
          if (allHits.length > 1) {
            const sel = getSelection()
            const currentEl = sel.length === 1 ? sel[0] : null
            const currentIdx = currentEl ? allHits.indexOf(currentEl) : -1
            const nextIdx = (currentIdx + 1) % allHits.length
            setSelection([allHits[nextIdx]])
            refreshOverlay()
          }
          return
        }

        if (e.shiftKey && hit) {
          toggleSelection(hit)
          return
        }

        if (hit) {
          const sel = getSelection()
          if (!sel.includes(hit)) {
            setSelection([hit])
          }
          dragState.mode = 'move'
          const startSnapped = snapToGrid(pt.x, pt.y)
          dragState.startX = startSnapped.x
          dragState.startY = startSnapped.y
          dragState.startPositions.clear()
          dragState.origTransforms.clear()
          dragState.origPathDs.clear()
          for (const el of getSelection()) {
            dragState.startPositions.set(el, getPositionAttrs(el))
            dragState.origTransforms.set(el, el.getAttribute('transform'))
            if (el.tagName === 'path') {
              dragState.origPathDs.set(el, el.getAttribute('d') || '')
            }
          }
          // Cache smart guide candidates at drag-start for performance
          cacheSmartGuideCandidates(svg, new Set(getSelection()))
        } else {
          // Start marquee selection
          clearSelection()
          dragState.mode = 'marquee'
          dragState.startX = pt.x
          dragState.startY = pt.y
          const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
          rect.setAttribute('x', String(pt.x))
          rect.setAttribute('y', String(pt.y))
          rect.setAttribute('width', '0')
          rect.setAttribute('height', '0')
          rect.setAttribute('fill', 'rgba(37, 99, 235, 0.1)')
          rect.setAttribute('stroke', '#2563eb')
          rect.setAttribute('stroke-width', '0.5')
          rect.setAttribute('stroke-dasharray', '3 2')
          rect.setAttribute('data-role', 'overlay')
          rect.setAttribute('pointer-events', 'none')
          svg.appendChild(rect)
          dragState.marqueeRect = rect
        }
      },

      onMouseMove(e: MouseEvent) {
        if (dragState.mode === 'none') return
        const svg = getSvg()
        if (!svg) return
        const pt = screenToDoc(svg, e.clientX, e.clientY)

        if (dragState.mode === 'marquee' && dragState.marqueeRect) {
          const x = Math.min(dragState.startX, pt.x)
          const y = Math.min(dragState.startY, pt.y)
          const w = Math.abs(pt.x - dragState.startX)
          const h = Math.abs(pt.y - dragState.startY)
          dragState.marqueeRect.setAttribute('x', String(x))
          dragState.marqueeRect.setAttribute('y', String(y))
          dragState.marqueeRect.setAttribute('width', String(w))
          dragState.marqueeRect.setAttribute('height', String(h))
          return
        }

        if (dragState.mode === 'move') {
          const snapped = snapToGrid(pt.x, pt.y)
          let dx = snapped.x - dragState.startX
          let dy = snapped.y - dragState.startY
          // Move elements once with preliminary delta, then compute smart guide correction
          for (const el of getSelection()) {
            moveElement(el, dx, dy)
          }
          // Smart guides: compute snap correction and re-apply only if needed
          const vb = svg.viewBox.baseVal
          const tolerance = vb.width > 0 && svg.clientWidth > 0
            ? 2 * (vb.width / svg.clientWidth)
            : 2
          const sgResult = computeSmartGuides(svg, getSelection(), tolerance)
          if (sgResult.dx !== 0 || sgResult.dy !== 0) {
            dx += sgResult.dx
            dy += sgResult.dy
            for (const el of getSelection()) {
              moveElement(el, dx, dy)
            }
          }
          renderGuides(svg, sgResult.guides)
        } else if (dragState.mode === 'scale' && dragState.scale) {
          const { handle, anchorX, anchorY, origBBox } = dragState.scale
          const axes = handleAxes(handle)

          // Inverse-transform mouse point into local space (handles any transform type)
          let localPt = { x: pt.x, y: pt.y }
          const sel = getSelection()
          if (sel.length === 1) {
            const transform = sel[0].getAttribute('transform')
            if (transform) {
              const m = parseTransform(transform)
              const inv = invertMatrix(m)
              localPt = applyMatrixToPoint(inv, pt.x, pt.y)
            }
          }

          // Compute new bbox extent based on mouse position (in local space)
          let newWidth = origBBox.width
          let newHeight = origBBox.height

          if (axes.scaleX) {
            newWidth = Math.abs(localPt.x - anchorX)
            if (newWidth < MIN_SCALE_SIZE) newWidth = MIN_SCALE_SIZE
          }
          if (axes.scaleY) {
            newHeight = Math.abs(localPt.y - anchorY)
            if (newHeight < MIN_SCALE_SIZE) newHeight = MIN_SCALE_SIZE
          }

          let sx = axes.scaleX && origBBox.width > MIN_BBOX_DIM ? newWidth / origBBox.width : 1
          let sy = axes.scaleY && origBBox.height > MIN_BBOX_DIM ? newHeight / origBBox.height : 1

          // Shift constrains proportions for corner handles
          if (e.shiftKey && axes.scaleX && axes.scaleY) {
            const s = Math.max(sx, sy)
            sx = s
            sy = s
          }

          for (const el of getSelection()) {
            scaleElement(el, sx, sy, anchorX, anchorY)
          }
        } else if (dragState.mode === 'rotate' && dragState.rotate) {
          const { centerX, centerY, startAngle } = dragState.rotate
          const currentAngle = Math.atan2(pt.y - centerY, pt.x - centerX)
          let angleDeg = ((currentAngle - startAngle) * 180) / Math.PI

          // Shift constrains to 15° increments
          if (e.shiftKey) {
            angleDeg = Math.round(angleDeg / ROTATION_SNAP_DEG) * ROTATION_SNAP_DEG
          }

          const sel = getSelection()
          if (sel.length === 1) {
            const origT = dragState.rotate!.origTransform || ''
            if (sel[0].tagName === 'g') {
              // Groups: compose rotation with full original transform via matrix
              const rotM = rotateMatrix(angleDeg, centerX, centerY)
              const origM = parseTransform(origT)
              const newM = multiplyMatrix(rotM, origM)
              sel[0].setAttribute('transform', matrixToString(newM))
            } else {
              // Elements with position attrs
              const rotMatch = origT.match(/rotate\(([-\d.]+)/)
              if (rotMatch || !origT) {
                // Standard case: rotate() string + skew preservation
                const baseAngle = rotMatch ? parseFloat(rotMatch[1]) : 0
                const totalAngle = baseAngle + angleDeg
                let newTransform = `rotate(${totalAngle}, ${centerX}, ${centerY})`
                const skewXM = origT.match(/skewX\([^)]+\)/)
                const skewYM = origT.match(/skewY\([^)]+\)/)
                if (skewXM) newTransform += ` ${skewXM[0]}`
                if (skewYM) newTransform += ` ${skewYM[0]}`
                sel[0].setAttribute('transform', newTransform)
              } else {
                // Fallback for non-standard transforms: matrix composition
                const rotM = rotateMatrix(angleDeg, centerX, centerY)
                const origM = parseTransform(origT)
                sel[0].setAttribute('transform', matrixToString(multiplyMatrix(rotM, origM)))
              }
            }
          }
        }

        refreshOverlay()
      },

      onMouseUp(e: MouseEvent) {
        if (dragState.mode === 'none') return
        const mode = dragState.mode
        dragState.mode = 'none'
        clearGuides()
        clearCachedCandidates()

        const svg = getSvg()
        if (!svg) return
        const pt = screenToDoc(svg, e.clientX, e.clientY)

        // Handle marquee selection completion
        if (mode === 'marquee') {
          if (dragState.marqueeRect) {
            dragState.marqueeRect.remove()
            dragState.marqueeRect = null
          }
          const mx = Math.min(dragState.startX, pt.x)
          const my = Math.min(dragState.startY, pt.y)
          const mw = Math.abs(pt.x - dragState.startX)
          const mh = Math.abs(pt.y - dragState.startY)
          if (mw < MARQUEE_THRESHOLD && mh < MARQUEE_THRESHOLD) return // too small, treat as click-to-deselect
          // Find all elements intersecting the marquee rect
          const hits: Element[] = []
          const layers = svg.querySelectorAll('g[data-layer-name]')
          for (const layer of layers) {
            if (layer.getAttribute('data-locked') === 'true') continue
            if ((layer as SVGElement).style.display === 'none') continue
            for (const child of layer.children) {
              try {
                const bbox = (child as SVGGraphicsElement).getBBox()
                const transform = child.getAttribute('transform')
                const aabb = transformedAABB(bbox, transform)
                // Check intersection (any overlap)
                if (
                  aabb.x + aabb.width > mx && aabb.x < mx + mw &&
                  aabb.y + aabb.height > my && aabb.y < my + mh
                ) {
                  hits.push(child)
                }
              } catch { /* skip */ }
            }
          }
          if (hits.length > 0) setSelection(hits)
          return
        }

        const dx = pt.x - dragState.startX
        const dy = pt.y - dragState.startY

        if (Math.abs(dx) < MOVE_DEAD_ZONE && Math.abs(dy) < MOVE_DEAD_ZONE) {
          // Restore mutated DOM attributes for scale/rotate to avoid dirty DOM
          if (mode === 'scale' || mode === 'rotate') {
            for (const el of getSelection()) {
              // Restore geometry attributes
              const start = dragState.startPositions.get(el)
              if (start) {
                for (const [attr, origVal] of Object.entries(start.vals)) {
                  el.setAttribute(attr, String(origVal))
                }
              }
              // Restore path d attribute
              const origD = dragState.origPathDs.get(el)
              if (origD !== undefined) {
                el.setAttribute('d', origD)
              }
              // Restore transform attribute
              const origTransform = dragState.origTransforms.get(el)
              if (origTransform !== undefined) {
                if (origTransform) {
                  el.setAttribute('transform', origTransform)
                } else {
                  el.removeAttribute('transform')
                }
              }
            }
          }
          dragState.startPositions.clear()
          dragState.origTransforms.clear()
          dragState.origPathDs.clear()
          dragState.scale = null
          dragState.rotate = null
          return
        }

        if (mode === 'rotate' && dragState.rotate) {
          // Commit rotation via ModifyAttributeCommand on transform
          const sel = getSelection()
          if (sel.length === 1) {
            const el = sel[0]
            const newTransform = el.getAttribute('transform') || ''
            const origTransform = dragState.rotate.origTransform
            // Reset to original for proper undo capture
            if (origTransform) {
              el.setAttribute('transform', origTransform)
            } else {
              el.removeAttribute('transform')
            }
            const cmd = new ModifyAttributeCommand(el, 'transform', newTransform)
            getHistory().execute(cmd)
          }
        } else {
          commitChanges(mode === 'scale' ? 'Scale' : 'Move')
        }
        // Unconditional cleanup
        dragState.rotate = null
        dragState.scale = null
        dragState.startPositions.clear()
        dragState.origTransforms.clear()
        dragState.origPathDs.clear()
      },
    },
  }
}

export function registerSelectTool(
  getSvg: () => SVGSVGElement | null,
  getDoc: () => DocumentModel | null,
  getHistory: () => CommandHistory
): void {
  registerTool(createSelectTool(getSvg, getDoc, getHistory))
}
