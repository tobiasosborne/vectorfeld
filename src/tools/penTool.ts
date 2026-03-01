import { registerTool } from './registry'
import type { ToolConfig } from './registry'
import { screenToDoc } from '../model/coordinates'
import { AddElementCommand } from '../model/commands'
import type { DocumentModel } from '../model/document'
import type { CommandHistory } from '../model/commands'
import type { Point } from '../model/coordinates'

/** Side-length of anchor point squares in document units */
function anchorDocSize(svg: SVGSVGElement): number {
  const vb = svg.viewBox.baseVal
  if (vb.width === 0 || svg.clientWidth === 0) return 2
  return 6 * (vb.width / svg.clientWidth)
}

/** Snap radius in document units (~5 screen pixels) */
function snapRadius(svg: SVGSVGElement): number {
  const vb = svg.viewBox.baseVal
  if (vb.width === 0 || svg.clientWidth === 0) return 3
  return 5 * (vb.width / svg.clientWidth)
}

function dist(a: Point, b: Point): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)
}

interface PenToolState {
  drawing: boolean
  points: Point[]
  previewPath: SVGPathElement | null
  previewLine: SVGLineElement | null
  anchors: SVGRectElement[]
  lastClickTime: number
  lastClickPos: Point | null
}

/** Double-click threshold in ms */
const DOUBLE_CLICK_MS = 400
const DOUBLE_CLICK_DIST = 5

export function createPenTool(
  getSvg: () => SVGSVGElement | null,
  getDoc: () => DocumentModel | null,
  getHistory: () => CommandHistory
): ToolConfig {
  const state: PenToolState = {
    drawing: false,
    points: [],
    previewPath: null,
    previewLine: null,
    anchors: [],
    lastClickTime: 0,
    lastClickPos: null,
  }

  function buildPathD(points: Point[]): string {
    if (points.length === 0) return ''
    let d = `M ${points[0].x} ${points[0].y}`
    for (let i = 1; i < points.length; i++) {
      d += ` L ${points[i].x} ${points[i].y}`
    }
    return d
  }

  function addAnchor(svg: SVGSVGElement, pt: Point) {
    const size = anchorDocSize(svg)
    const half = size / 2
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    rect.setAttribute('x', String(pt.x - half))
    rect.setAttribute('y', String(pt.y - half))
    rect.setAttribute('width', String(size))
    rect.setAttribute('height', String(size))
    rect.setAttribute('fill', '#2563eb')
    rect.setAttribute('stroke', '#ffffff')
    rect.setAttribute('stroke-width', String(size / 6))
    rect.setAttribute('data-role', 'preview')
    rect.setAttribute('pointer-events', 'none')
    svg.appendChild(rect)
    state.anchors.push(rect)
  }

  function cleanup() {
    state.previewPath?.remove()
    state.previewLine?.remove()
    for (const a of state.anchors) a.remove()
    state.previewPath = null
    state.previewLine = null
    state.anchors = []
    state.points = []
    state.drawing = false
  }

  function finish(closePath = false) {
    const svg = getSvg()
    if (!svg) { cleanup(); return }
    if (state.points.length < 2) { cleanup(); return }

    let d = buildPathD(state.points)
    if (closePath) d += ' Z'
    cleanup()

    const doc = getDoc()
    if (!doc) return
    const layer = doc.getActiveLayer()
    if (!layer) return

    const history = getHistory()
    const cmd = new AddElementCommand(doc, layer, 'path', {
      d,
      fill: closePath ? 'none' : 'none',
      stroke: '#000000',
      'stroke-width': '1',
    })
    history.execute(cmd)
  }

  return {
    name: 'pen',
    icon: 'P',
    shortcut: 'p',
    cursor: 'crosshair',
    handlers: {
      onMouseDown(e: MouseEvent) {
        const svg = getSvg()
        if (!svg || e.button !== 0) return
        const pt = screenToDoc(svg, e.clientX, e.clientY)
        const now = Date.now()

        // Check for double-click to finish open path (need at least 2 points)
        if (state.drawing && state.points.length >= 2 && state.lastClickPos) {
          const dt = now - state.lastClickTime
          const dd = dist(pt, state.lastClickPos)
          // Convert DOUBLE_CLICK_DIST from screen px to doc units
          const vb = svg.viewBox.baseVal
          const distThreshold = DOUBLE_CLICK_DIST * (vb.width / svg.clientWidth)
          if (dt < DOUBLE_CLICK_MS && dd < distThreshold) {
            finish(false)
            state.lastClickTime = 0
            state.lastClickPos = null
            return
          }
        }

        state.lastClickTime = now
        state.lastClickPos = pt

        if (!state.drawing) {
          // Start new path
          state.drawing = true
          state.points = [pt]

          // Create preview path
          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
          path.setAttribute('d', buildPathD([pt]))
          path.setAttribute('fill', 'none')
          path.setAttribute('stroke', '#000000')
          path.setAttribute('stroke-width', '1')
          path.setAttribute('data-role', 'preview')
          path.setAttribute('pointer-events', 'none')
          svg.appendChild(path)
          state.previewPath = path

          // Create preview rubber-band line
          const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
          line.setAttribute('x1', String(pt.x))
          line.setAttribute('y1', String(pt.y))
          line.setAttribute('x2', String(pt.x))
          line.setAttribute('y2', String(pt.y))
          line.setAttribute('stroke', '#999999')
          line.setAttribute('stroke-width', '0.5')
          line.setAttribute('stroke-dasharray', '2 1')
          line.setAttribute('data-role', 'preview')
          line.setAttribute('pointer-events', 'none')
          svg.appendChild(line)
          state.previewLine = line

          // First anchor
          addAnchor(svg, pt)
        } else {
          // Check if clicking near first anchor to close path
          const snap = snapRadius(svg)
          if (state.points.length >= 2 && dist(pt, state.points[0]) < snap) {
            finish(true) // close path with Z
            return
          }

          // Add new point
          state.points.push(pt)

          // Update the path preview
          if (state.previewPath) {
            state.previewPath.setAttribute('d', buildPathD(state.points))
          }

          // Update rubber-band origin
          if (state.previewLine) {
            state.previewLine.setAttribute('x1', String(pt.x))
            state.previewLine.setAttribute('y1', String(pt.y))
          }

          // Add anchor
          addAnchor(svg, pt)
        }
      },

      onMouseMove(e: MouseEvent) {
        if (!state.drawing || !state.previewLine) return
        const svg = getSvg()
        if (!svg) return
        const pt = screenToDoc(svg, e.clientX, e.clientY)
        state.previewLine.setAttribute('x2', String(pt.x))
        state.previewLine.setAttribute('y2', String(pt.y))

        // Highlight first anchor when cursor is near it (close-path hint)
        if (state.anchors.length >= 2 && state.points.length >= 2) {
          const snap = snapRadius(svg)
          const firstAnchor = state.anchors[0]
          if (dist(pt, state.points[0]) < snap) {
            firstAnchor.setAttribute('fill', '#ff4444')
            firstAnchor.setAttribute('stroke', '#ffffff')
          } else {
            firstAnchor.setAttribute('fill', '#2563eb')
            firstAnchor.setAttribute('stroke', '#ffffff')
          }
        }
      },

      onKeyDown(e: KeyboardEvent) {
        if (!state.drawing) return
        if (e.key === 'Enter') {
          e.preventDefault()
          finish()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          cleanup()
        }
      },
    },
  }
}

export function registerPenTool(
  getSvg: () => SVGSVGElement | null,
  getDoc: () => DocumentModel | null,
  getHistory: () => CommandHistory
): void {
  registerTool(createPenTool(getSvg, getDoc, getHistory))
}
