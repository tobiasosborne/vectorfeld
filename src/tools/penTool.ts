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

export interface AnchorPoint {
  pos: Point
  handleOut: Point | null // outgoing control handle (absolute coords)
  handleIn: Point | null  // incoming control handle (absolute coords)
}

interface PenToolState {
  drawing: boolean
  anchors: AnchorPoint[]
  previewPath: SVGPathElement | null
  previewLine: SVGLineElement | null
  anchorElements: SVGRectElement[]
  handleElements: SVGElement[] // circles + lines for control handles
  lastClickTime: number
  lastClickPos: Point | null
  draggingHandle: boolean // true while dragging to create handle
  dragAnchorIdx: number   // index of anchor being handle-dragged
}

const DOUBLE_CLICK_MS = 400
const DOUBLE_CLICK_DIST = 5

/** Build SVG path d attribute from anchors with optional Bezier handles */
export function buildPathD(anchors: AnchorPoint[]): string {
  if (anchors.length === 0) return ''
  let d = `M ${anchors[0].pos.x} ${anchors[0].pos.y}`
  for (let i = 1; i < anchors.length; i++) {
    const prev = anchors[i - 1]
    const curr = anchors[i]
    if (prev.handleOut || curr.handleIn) {
      const cp1 = prev.handleOut || prev.pos
      const cp2 = curr.handleIn || curr.pos
      d += ` C ${cp1.x} ${cp1.y} ${cp2.x} ${cp2.y} ${curr.pos.x} ${curr.pos.y}`
    } else {
      d += ` L ${curr.pos.x} ${curr.pos.y}`
    }
  }
  return d
}

export function createPenTool(
  getSvg: () => SVGSVGElement | null,
  getDoc: () => DocumentModel | null,
  getHistory: () => CommandHistory
): ToolConfig {
  const state: PenToolState = {
    drawing: false,
    anchors: [],
    previewPath: null,
    previewLine: null,
    anchorElements: [],
    handleElements: [],
    lastClickTime: 0,
    lastClickPos: null,
    draggingHandle: false,
    dragAnchorIdx: -1,
  }

  function addAnchorVisual(svg: SVGSVGElement, pt: Point) {
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
    state.anchorElements.push(rect)
  }

  function clearHandleVisuals(svg: SVGSVGElement) {
    for (const el of state.handleElements) el.remove()
    state.handleElements = []
  }

  function drawHandleVisuals(svg: SVGSVGElement, anchor: AnchorPoint) {
    const size = anchorDocSize(svg)
    const r = size * 0.4
    const sw = Math.max(size / 8, 0.1)

    function drawHandle(handle: Point) {
      // Line from anchor to handle
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
      line.setAttribute('x1', String(anchor.pos.x))
      line.setAttribute('y1', String(anchor.pos.y))
      line.setAttribute('x2', String(handle.x))
      line.setAttribute('y2', String(handle.y))
      line.setAttribute('stroke', '#999999')
      line.setAttribute('stroke-width', String(sw))
      line.setAttribute('data-role', 'preview')
      line.setAttribute('pointer-events', 'none')
      svg.appendChild(line)
      state.handleElements.push(line)

      // Circle at handle tip
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
      circle.setAttribute('cx', String(handle.x))
      circle.setAttribute('cy', String(handle.y))
      circle.setAttribute('r', String(r))
      circle.setAttribute('fill', '#ffffff')
      circle.setAttribute('stroke', '#2563eb')
      circle.setAttribute('stroke-width', String(sw))
      circle.setAttribute('data-role', 'preview')
      circle.setAttribute('pointer-events', 'none')
      svg.appendChild(circle)
      state.handleElements.push(circle)
    }

    if (anchor.handleOut) drawHandle(anchor.handleOut)
    if (anchor.handleIn) drawHandle(anchor.handleIn)
  }

  function cleanup() {
    state.previewPath?.remove()
    state.previewLine?.remove()
    for (const a of state.anchorElements) a.remove()
    for (const h of state.handleElements) h.remove()
    state.previewPath = null
    state.previewLine = null
    state.anchorElements = []
    state.handleElements = []
    state.anchors = []
    state.drawing = false
    state.draggingHandle = false
    state.dragAnchorIdx = -1
  }

  function finish(closePath = false) {
    const svg = getSvg()
    if (!svg) { cleanup(); return }
    if (state.anchors.length < 2) { cleanup(); return }

    let d = buildPathD(state.anchors)
    if (closePath) d += ' Z'
    cleanup()

    const doc = getDoc()
    if (!doc) return
    const layer = doc.getActiveLayer()
    if (!layer) return

    const history = getHistory()
    const cmd = new AddElementCommand(doc, layer, 'path', {
      d,
      fill: 'none',
      stroke: '#000000',
      'stroke-width': '1',
    })
    history.execute(cmd)
  }

  function updatePreviewPath() {
    if (state.previewPath) {
      state.previewPath.setAttribute('d', buildPathD(state.anchors))
    }
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

        // Check for double-click to finish
        if (state.drawing && state.anchors.length >= 2 && state.lastClickPos) {
          const dt = now - state.lastClickTime
          const dd = dist(pt, state.lastClickPos)
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
          const anchor: AnchorPoint = { pos: pt, handleOut: null, handleIn: null }
          state.anchors = [anchor]
          state.draggingHandle = true
          state.dragAnchorIdx = 0

          // Create preview path
          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
          path.setAttribute('d', `M ${pt.x} ${pt.y}`)
          path.setAttribute('fill', 'none')
          path.setAttribute('stroke', '#000000')
          path.setAttribute('stroke-width', '1')
          path.setAttribute('data-role', 'preview')
          path.setAttribute('pointer-events', 'none')
          svg.appendChild(path)
          state.previewPath = path

          // Rubber-band line
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

          addAnchorVisual(svg, pt)
        } else {
          // Check close-path
          const snap = snapRadius(svg)
          if (state.anchors.length >= 2 && dist(pt, state.anchors[0].pos) < snap) {
            finish(true)
            return
          }

          // Add new anchor with dragging handle
          const anchor: AnchorPoint = { pos: pt, handleOut: null, handleIn: null }
          state.anchors.push(anchor)
          state.draggingHandle = true
          state.dragAnchorIdx = state.anchors.length - 1

          updatePreviewPath()

          if (state.previewLine) {
            state.previewLine.setAttribute('x1', String(pt.x))
            state.previewLine.setAttribute('y1', String(pt.y))
          }

          addAnchorVisual(svg, pt)
        }
      },

      onMouseMove(e: MouseEvent) {
        if (!state.drawing) return
        const svg = getSvg()
        if (!svg) return
        const pt = screenToDoc(svg, e.clientX, e.clientY)

        if (state.draggingHandle && state.dragAnchorIdx >= 0) {
          const anchor = state.anchors[state.dragAnchorIdx]
          const dragDist = dist(pt, anchor.pos)
          const threshold = anchorDocSize(svg) * 0.5

          if (dragDist > threshold) {
            // Set outgoing handle at drag position, mirror for incoming
            anchor.handleOut = { x: pt.x, y: pt.y }
            anchor.handleIn = {
              x: 2 * anchor.pos.x - pt.x,
              y: 2 * anchor.pos.y - pt.y,
            }

            clearHandleVisuals(svg)
            drawHandleVisuals(svg, anchor)
            updatePreviewPath()
          }
        }

        // Update rubber-band line
        if (state.previewLine && !state.draggingHandle) {
          state.previewLine.setAttribute('x2', String(pt.x))
          state.previewLine.setAttribute('y2', String(pt.y))
        }

        // Highlight first anchor for close hint
        if (state.anchorElements.length >= 2 && state.anchors.length >= 2 && !state.draggingHandle) {
          const snap = snapRadius(svg)
          const firstAnchor = state.anchorElements[0]
          if (dist(pt, state.anchors[0].pos) < snap) {
            firstAnchor.setAttribute('fill', '#ff4444')
          } else {
            firstAnchor.setAttribute('fill', '#2563eb')
          }
        }
      },

      onMouseUp(e: MouseEvent) {
        if (!state.draggingHandle) return
        state.draggingHandle = false

        const svg = getSvg()
        if (!svg) return
        const pt = screenToDoc(svg, e.clientX, e.clientY)
        const anchor = state.anchors[state.dragAnchorIdx]

        // If drag distance was too small, clear handles (plain click)
        const threshold = anchorDocSize(svg) * 0.5
        if (dist(pt, anchor.pos) < threshold) {
          anchor.handleOut = null
          anchor.handleIn = null
          clearHandleVisuals(svg)
        }

        // Update rubber-band from this anchor
        if (state.previewLine) {
          state.previewLine.setAttribute('x1', String(anchor.pos.x))
          state.previewLine.setAttribute('y1', String(anchor.pos.y))
          state.previewLine.setAttribute('x2', String(pt.x))
          state.previewLine.setAttribute('y2', String(pt.y))
        }

        state.dragAnchorIdx = -1
      },

      onKeyDown(e: KeyboardEvent) {
        if (!state.drawing) return
        if (e.key === 'Enter' || e.key === 'Escape') {
          e.preventDefault()
          finish()
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
