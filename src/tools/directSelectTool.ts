import { registerTool } from './registry'
import type { ToolConfig } from './registry'
import { screenToDoc } from '../model/coordinates'
import type { DocumentModel } from '../model/document'
import type { CommandHistory } from '../model/commands'
import { ModifyAttributeCommand, AddElementCommand, RemoveElementCommand, CompoundCommand } from '../model/commands'
import type { Point } from '../model/coordinates'
import { elementToPathD, extractStyleAttrs } from '../model/shapeToPath'

export interface ControlPoints {
  /** cp1 (outgoing from prev anchor) and cp2 (incoming to this anchor) per C segment */
  handleIn: Point | null   // incoming control handle for this anchor
  handleOut: Point | null   // outgoing control handle from this anchor
}

/** Parse path anchors with their control handles */
export function parsePathWithHandles(d: string): { pos: Point; handles: ControlPoints }[] {
  const result: { pos: Point; handles: ControlPoints }[] = []
  const re = /([MLCZmlcz])\s*([-\d.e+]+(?:\s*,?\s*[-\d.e+]+)*)?/g
  let match
  while ((match = re.exec(d)) !== null) {
    const cmd = match[1]
    const nums = (match[2] || '').trim()
    if (!nums && cmd !== 'Z' && cmd !== 'z') continue
    const values = nums ? nums.split(/[\s,]+/).map(Number) : []

    if (cmd === 'M' || cmd === 'L') {
      for (let i = 0; i < values.length - 1; i += 2) {
        result.push({
          pos: { x: values[i], y: values[i + 1] },
          handles: { handleIn: null, handleOut: null },
        })
      }
    } else if (cmd === 'C') {
      for (let i = 0; i < values.length - 5; i += 6) {
        // cp1 is outgoing from PREVIOUS anchor
        const cp1 = { x: values[i], y: values[i + 1] }
        const cp2 = { x: values[i + 2], y: values[i + 3] }
        const endPt = { x: values[i + 4], y: values[i + 5] }

        // Set outgoing handle on previous anchor
        if (result.length > 0) {
          result[result.length - 1].handles.handleOut = cp1
        }

        // Add endpoint with incoming handle
        result.push({
          pos: endPt,
          handles: { handleIn: cp2, handleOut: null },
        })
      }
    }
  }
  return result
}

/** Update a control handle position in a path d string */
export function updatePathControlPoint(
  d: string,
  anchorIdx: number,
  handleType: 'in' | 'out',
  newPos: Point
): string {
  const segments: { cmd: string; coords: number[] }[] = []
  const re = /([MLCZmlcz])\s*([-\d.e+]+(?:\s*,?\s*[-\d.e+]+)*)?/g
  let match
  while ((match = re.exec(d)) !== null) {
    const cmd = match[1]
    const nums = (match[2] || '').trim()
    const values = nums ? nums.split(/[\s,]+/).map(Number) : []
    segments.push({ cmd, coords: values })
  }

  // Walk through to find the right C segment
  let currentIdx = 0
  for (const seg of segments) {
    if (seg.cmd === 'M' || seg.cmd === 'L') {
      for (let i = 0; i < seg.coords.length - 1; i += 2) {
        currentIdx++
      }
    } else if (seg.cmd === 'C') {
      for (let i = 0; i < seg.coords.length - 5; i += 6) {
        // This C segment: cp1 is handleOut of anchor (currentIdx-1), cp2 is handleIn of anchor (currentIdx)
        const prevIdx = currentIdx - 1
        if (handleType === 'out' && prevIdx === anchorIdx) {
          seg.coords[i] = newPos.x
          seg.coords[i + 1] = newPos.y
        }
        if (handleType === 'in' && currentIdx === anchorIdx) {
          seg.coords[i + 2] = newPos.x
          seg.coords[i + 3] = newPos.y
        }
        currentIdx++
      }
    }
  }

  return segments.map(s => {
    if (s.coords.length === 0) return s.cmd
    return `${s.cmd} ${s.coords.join(' ')}`
  }).join(' ')
}

/** Parse SVG path d attribute into anchor points (M, L, C commands) */
export function parsePathAnchors(d: string): Point[] {
  const points: Point[] = []
  // Match M/L/C commands and their coordinate pairs
  const re = /([MLCZmlcz])\s*([-\d.e+]+(?:\s*,?\s*[-\d.e+]+)*)?/g
  let match
  while ((match = re.exec(d)) !== null) {
    const cmd = match[1]
    const nums = (match[2] || '').trim()
    if (!nums && cmd !== 'Z' && cmd !== 'z') continue
    const values = nums.split(/[\s,]+/).map(Number)

    if (cmd === 'M' || cmd === 'L') {
      for (let i = 0; i < values.length - 1; i += 2) {
        points.push({ x: values[i], y: values[i + 1] })
      }
    } else if (cmd === 'C') {
      // C cp1x cp1y cp2x cp2y x y — we only take the endpoint
      for (let i = 0; i < values.length - 5; i += 6) {
        points.push({ x: values[i + 4], y: values[i + 5] })
      }
    }
    // Z doesn't add a point
  }
  return points
}

/** Update a specific anchor point's position in a path d string */
export function updatePathAnchor(d: string, anchorIdx: number, newPos: Point): string {
  const segments: { cmd: string; coords: number[] }[] = []
  const re = /([MLCZmlcz])\s*([-\d.e+]+(?:\s*,?\s*[-\d.e+]+)*)?/g
  let match
  while ((match = re.exec(d)) !== null) {
    const cmd = match[1]
    const nums = (match[2] || '').trim()
    const values = nums ? nums.split(/[\s,]+/).map(Number) : []
    segments.push({ cmd, coords: values })
  }

  // Map anchor index to the right segment/position
  let currentIdx = 0
  for (const seg of segments) {
    if (seg.cmd === 'M' || seg.cmd === 'L') {
      for (let i = 0; i < seg.coords.length - 1; i += 2) {
        if (currentIdx === anchorIdx) {
          seg.coords[i] = newPos.x
          seg.coords[i + 1] = newPos.y
        }
        currentIdx++
      }
    } else if (seg.cmd === 'C') {
      for (let i = 0; i < seg.coords.length - 5; i += 6) {
        if (currentIdx === anchorIdx) {
          seg.coords[i + 4] = newPos.x
          seg.coords[i + 5] = newPos.y
        }
        currentIdx++
      }
    }
  }

  // Rebuild d string
  return segments.map(s => {
    if (s.coords.length === 0) return s.cmd
    return `${s.cmd} ${s.coords.join(' ')}`
  }).join(' ')
}

function anchorDocSize(svg: SVGSVGElement): number {
  const vb = svg.viewBox.baseVal
  if (vb.width === 0 || svg.clientWidth === 0) return 2
  return 8 * (vb.width / svg.clientWidth)
}

function dist(a: Point, b: Point): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)
}

const DIRECT_SELECT_TAGS = new Set(['path', 'rect', 'ellipse', 'circle', 'line'])

function hitTestElement(svg: SVGSVGElement, screenX: number, screenY: number): Element | null {
  const pt = screenToDoc(svg, screenX, screenY)
  const layers = svg.querySelectorAll('g[data-layer-name]')
  for (let li = layers.length - 1; li >= 0; li--) {
    const layer = layers[li]
    if (layer.getAttribute('data-locked') === 'true') continue
    if ((layer as SVGElement).style.display === 'none') continue
    const children = layer.children
    for (let ci = children.length - 1; ci >= 0; ci--) {
      const child = children[ci]
      if (!DIRECT_SELECT_TAGS.has(child.tagName)) continue
      try {
        const bbox = (child as SVGGraphicsElement).getBBox()
        if (pt.x >= bbox.x && pt.x <= bbox.x + bbox.width &&
            pt.y >= bbox.y && pt.y <= bbox.y + bbox.height) {
          return child
        }
      } catch { /* skip */ }
    }
  }
  return null
}

type DragTarget = { type: 'anchor'; idx: number } | { type: 'handle'; anchorIdx: number; handleType: 'in' | 'out' }

interface DirectSelectState {
  selectedPath: SVGPathElement | null
  anchors: Point[]
  anchorHandles: { pos: Point; handles: ControlPoints }[]
  anchorVisuals: SVGRectElement[]
  handleVisuals: SVGElement[] // circles + lines for control handles
  selectedAnchorIdx: number
  dragTarget: DragTarget | null
  dragging: boolean
  startX: number
  startY: number
  origD: string
}

export function createDirectSelectTool(
  getSvg: () => SVGSVGElement | null,
  _getDoc: () => DocumentModel | null,
  getHistory: () => CommandHistory
): ToolConfig {
  const state: DirectSelectState = {
    selectedPath: null,
    anchors: [],
    anchorHandles: [],
    anchorVisuals: [],
    handleVisuals: [],
    selectedAnchorIdx: -1,
    dragTarget: null,
    dragging: false,
    startX: 0,
    startY: 0,
    origD: '',
  }

  function clearVisuals() {
    for (const v of state.anchorVisuals) v.remove()
    for (const v of state.handleVisuals) v.remove()
    state.anchorVisuals = []
    state.handleVisuals = []
  }

  function addHandleVisual(svg: SVGSVGElement, anchor: Point, handle: Point, anchorIdx: number, handleType: 'in' | 'out') {
    const size = anchorDocSize(svg)
    const r = size * 0.4
    const sw = Math.max(size / 8, 0.1)

    // Line from anchor to handle
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
    line.setAttribute('x1', String(anchor.x))
    line.setAttribute('y1', String(anchor.y))
    line.setAttribute('x2', String(handle.x))
    line.setAttribute('y2', String(handle.y))
    line.setAttribute('stroke', '#999999')
    line.setAttribute('stroke-width', String(sw))
    line.setAttribute('pointer-events', 'none')
    svg.appendChild(line)
    state.handleVisuals.push(line)

    // Circle at handle
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
    circle.setAttribute('cx', String(handle.x))
    circle.setAttribute('cy', String(handle.y))
    circle.setAttribute('r', String(r))
    circle.setAttribute('fill', '#ffffff')
    circle.setAttribute('stroke', '#2563eb')
    circle.setAttribute('stroke-width', String(sw))
    circle.setAttribute('data-role', 'direct-select-handle')
    circle.setAttribute('data-anchor-idx', String(anchorIdx))
    circle.setAttribute('data-handle-type', handleType)
    circle.setAttribute('pointer-events', 'auto')
    circle.style.cursor = 'move'
    svg.appendChild(circle)
    state.handleVisuals.push(circle)
  }

  function showAnchors(svg: SVGSVGElement, path: SVGPathElement) {
    clearVisuals()
    const d = path.getAttribute('d') || ''
    state.anchors = parsePathAnchors(d)
    state.anchorHandles = parsePathWithHandles(d)
    const size = anchorDocSize(svg)
    const half = size / 2

    for (let i = 0; i < state.anchors.length; i++) {
      const pt = state.anchors[i]
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
      rect.setAttribute('x', String(pt.x - half))
      rect.setAttribute('y', String(pt.y - half))
      rect.setAttribute('width', String(size))
      rect.setAttribute('height', String(size))
      rect.setAttribute('fill', i === state.selectedAnchorIdx ? '#2563eb' : '#ffffff')
      rect.setAttribute('stroke', '#2563eb')
      rect.setAttribute('stroke-width', String(Math.max(size / 6, 0.1)))
      rect.setAttribute('data-role', 'direct-select-anchor')
      rect.setAttribute('data-anchor-idx', String(i))
      rect.setAttribute('pointer-events', 'auto')
      rect.style.cursor = 'move'
      svg.appendChild(rect)
      state.anchorVisuals.push(rect)
    }

    // Show control handles for selected anchor
    if (state.selectedAnchorIdx >= 0 && state.selectedAnchorIdx < state.anchorHandles.length) {
      const ah = state.anchorHandles[state.selectedAnchorIdx]
      if (ah.handles.handleIn) {
        addHandleVisual(svg, ah.pos, ah.handles.handleIn, state.selectedAnchorIdx, 'in')
      }
      if (ah.handles.handleOut) {
        addHandleVisual(svg, ah.pos, ah.handles.handleOut, state.selectedAnchorIdx, 'out')
      }
    }
  }

  function deselect() {
    clearVisuals()
    state.selectedPath = null
    state.anchors = []
    state.selectedAnchorIdx = -1
  }

  return {
    name: 'direct-select',
    icon: 'A',
    shortcut: 'a',
    cursor: 'default',
    handlers: {
      onMouseDown(e: MouseEvent) {
        const svg = getSvg()
        if (!svg || e.button !== 0) return
        const pt = screenToDoc(svg, e.clientX, e.clientY)

        const target = e.target as Element

        // Check if clicking on a control handle
        if (target?.getAttribute?.('data-role') === 'direct-select-handle') {
          const idx = parseInt(target.getAttribute('data-anchor-idx') || '-1', 10)
          const handleType = target.getAttribute('data-handle-type') as 'in' | 'out'
          if (idx >= 0 && handleType && state.selectedPath) {
            state.dragging = true
            state.dragTarget = { type: 'handle', anchorIdx: idx, handleType }
            state.startX = pt.x
            state.startY = pt.y
            state.origD = state.selectedPath.getAttribute('d') || ''
            return
          }
        }

        // Check if clicking on an anchor visual
        if (target?.getAttribute?.('data-role') === 'direct-select-anchor') {
          const idx = parseInt(target.getAttribute('data-anchor-idx') || '-1', 10)
          if (idx >= 0 && state.selectedPath) {
            state.selectedAnchorIdx = idx
            state.dragging = true
            state.dragTarget = { type: 'anchor', idx }
            state.startX = pt.x
            state.startY = pt.y
            state.origD = state.selectedPath.getAttribute('d') || ''
            showAnchors(svg, state.selectedPath)
            return
          }
        }

        // Check if clicking on an element
        const hitEl = hitTestElement(svg, e.clientX, e.clientY)
        if (hitEl) {
          if (hitEl.tagName === 'path') {
            state.selectedPath = hitEl as SVGPathElement
            state.selectedAnchorIdx = -1
            showAnchors(svg, hitEl as SVGPathElement)
          } else {
            // Non-path: auto-convert to path
            const d = elementToPathD(hitEl)
            const doc = getDoc()
            if (d && doc) {
              const parent = hitEl.parentElement
              if (parent) {
                const styleAttrs = extractStyleAttrs(hitEl)
                const removeCmd = new RemoveElementCommand(doc, hitEl)
                const addCmd = new AddElementCommand(doc, parent, 'path', { ...styleAttrs, d })
                const compound = new CompoundCommand([removeCmd, addCmd], 'Convert to Path')
                getHistory().execute(compound)
                const newPath = addCmd.getElement() as SVGPathElement
                if (newPath) {
                  state.selectedPath = newPath
                  state.selectedAnchorIdx = -1
                  showAnchors(svg, newPath)
                }
              }
            }
          }
        } else {
          deselect()
        }
      },

      onMouseMove(e: MouseEvent) {
        if (!state.dragging || !state.dragTarget || !state.selectedPath) return
        const svg = getSvg()
        if (!svg) return
        const pt = screenToDoc(svg, e.clientX, e.clientY)
        const dx = pt.x - state.startX
        const dy = pt.y - state.startY

        if (state.dragTarget.type === 'anchor') {
          const orig = state.anchors[state.dragTarget.idx]
          const newPos = { x: orig.x + dx, y: orig.y + dy }
          const newD = updatePathAnchor(state.origD, state.dragTarget.idx, newPos)
          state.selectedPath.setAttribute('d', newD)

          const size = anchorDocSize(svg)
          const half = size / 2
          const visual = state.anchorVisuals[state.dragTarget.idx]
          if (visual) {
            visual.setAttribute('x', String(newPos.x - half))
            visual.setAttribute('y', String(newPos.y - half))
          }
        } else if (state.dragTarget.type === 'handle') {
          const { anchorIdx, handleType } = state.dragTarget
          const ah = state.anchorHandles[anchorIdx]
          const origHandle = handleType === 'in' ? ah.handles.handleIn : ah.handles.handleOut
          if (!origHandle) return
          const newHandle = { x: origHandle.x + dx, y: origHandle.y + dy }
          const newD = updatePathControlPoint(state.origD, anchorIdx, handleType, newHandle)
          state.selectedPath.setAttribute('d', newD)
        }
      },

      onMouseUp(e: MouseEvent) {
        if (!state.dragging || !state.selectedPath) {
          state.dragging = false
          state.dragTarget = null
          return
        }
        state.dragging = false

        const svg = getSvg()
        if (!svg) return
        const pt = screenToDoc(svg, e.clientX, e.clientY)
        const dx = pt.x - state.startX
        const dy = pt.y - state.startY

        if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) {
          state.dragTarget = null
          return
        }

        // Commit via ModifyAttributeCommand
        const newD = state.selectedPath.getAttribute('d') || ''
        state.selectedPath.setAttribute('d', state.origD)
        const cmd = new ModifyAttributeCommand(state.selectedPath, 'd', newD)
        getHistory().execute(cmd)

        // Refresh
        state.anchors = parsePathAnchors(state.selectedPath.getAttribute('d') || '')
        showAnchors(svg, state.selectedPath)
        state.dragTarget = null
      },
    },
  }
}

export function registerDirectSelectTool(
  getSvg: () => SVGSVGElement | null,
  getDoc: () => DocumentModel | null,
  getHistory: () => CommandHistory
): void {
  registerTool(createDirectSelectTool(getSvg, getDoc, getHistory))
}
