import { registerTool } from './registry'
import type { ToolConfig } from './registry'
import { screenToDoc } from '../model/coordinates'
import type { DocumentModel } from '../model/document'
import type { CommandHistory } from '../model/commands'
import { ModifyAttributeCommand } from '../model/commands'
import type { Point } from '../model/coordinates'

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
  return 6 * (vb.width / svg.clientWidth)
}

function dist(a: Point, b: Point): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)
}

function hitTestPath(svg: SVGSVGElement, screenX: number, screenY: number): SVGPathElement | null {
  const pt = screenToDoc(svg, screenX, screenY)
  const layers = svg.querySelectorAll('g[data-layer-name]')
  for (let li = layers.length - 1; li >= 0; li--) {
    const layer = layers[li]
    if (layer.getAttribute('data-locked') === 'true') continue
    if ((layer as SVGElement).style.display === 'none') continue
    const children = layer.children
    for (let ci = children.length - 1; ci >= 0; ci--) {
      const child = children[ci]
      if (child.tagName !== 'path') continue
      try {
        const bbox = (child as SVGGraphicsElement).getBBox()
        if (pt.x >= bbox.x && pt.x <= bbox.x + bbox.width &&
            pt.y >= bbox.y && pt.y <= bbox.y + bbox.height) {
          return child as SVGPathElement
        }
      } catch { /* skip */ }
    }
  }
  return null
}

interface DirectSelectState {
  selectedPath: SVGPathElement | null
  anchors: Point[]
  anchorVisuals: SVGRectElement[]
  selectedAnchorIdx: number
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
    anchorVisuals: [],
    selectedAnchorIdx: -1,
    dragging: false,
    startX: 0,
    startY: 0,
    origD: '',
  }

  function clearVisuals() {
    for (const v of state.anchorVisuals) v.remove()
    state.anchorVisuals = []
  }

  function showAnchors(svg: SVGSVGElement, path: SVGPathElement) {
    clearVisuals()
    const d = path.getAttribute('d') || ''
    state.anchors = parsePathAnchors(d)
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

        // Check if clicking on an anchor visual
        const target = e.target as Element
        if (target?.getAttribute?.('data-role') === 'direct-select-anchor') {
          const idx = parseInt(target.getAttribute('data-anchor-idx') || '-1', 10)
          if (idx >= 0 && state.selectedPath) {
            state.selectedAnchorIdx = idx
            state.dragging = true
            state.startX = pt.x
            state.startY = pt.y
            state.origD = state.selectedPath.getAttribute('d') || ''
            // Highlight selected anchor
            showAnchors(svg, state.selectedPath)
            return
          }
        }

        // Check if clicking on a path
        const hitPath = hitTestPath(svg, e.clientX, e.clientY)
        if (hitPath) {
          state.selectedPath = hitPath
          state.selectedAnchorIdx = -1
          showAnchors(svg, hitPath)
        } else {
          deselect()
        }
      },

      onMouseMove(e: MouseEvent) {
        if (!state.dragging || state.selectedAnchorIdx < 0 || !state.selectedPath) return
        const svg = getSvg()
        if (!svg) return
        const pt = screenToDoc(svg, e.clientX, e.clientY)

        const dx = pt.x - state.startX
        const dy = pt.y - state.startY
        const orig = state.anchors[state.selectedAnchorIdx]
        const newPos = { x: orig.x + dx, y: orig.y + dy }

        // Update path d attribute
        const newD = updatePathAnchor(state.origD, state.selectedAnchorIdx, newPos)
        state.selectedPath.setAttribute('d', newD)

        // Update anchor visual position
        const size = anchorDocSize(svg)
        const half = size / 2
        const visual = state.anchorVisuals[state.selectedAnchorIdx]
        if (visual) {
          visual.setAttribute('x', String(newPos.x - half))
          visual.setAttribute('y', String(newPos.y - half))
        }
      },

      onMouseUp(e: MouseEvent) {
        if (!state.dragging || !state.selectedPath) {
          state.dragging = false
          return
        }
        state.dragging = false

        const svg = getSvg()
        if (!svg) return
        const pt = screenToDoc(svg, e.clientX, e.clientY)
        const dx = pt.x - state.startX
        const dy = pt.y - state.startY

        if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return

        // Commit via ModifyAttributeCommand
        const newD = state.selectedPath.getAttribute('d') || ''
        // Reset to original for proper undo capture
        state.selectedPath.setAttribute('d', state.origD)
        const cmd = new ModifyAttributeCommand(state.selectedPath, 'd', newD)
        getHistory().execute(cmd)

        // Refresh anchors from the new d
        state.anchors = parsePathAnchors(newD)
        showAnchors(svg, state.selectedPath)
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
