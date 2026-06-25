import { registerTool } from './registry'
import type { ToolConfig } from './registry'
import { screenToDoc } from '../model/coordinates'
import { hitTestElement as sharedHitTestElement } from '../model/geometry'
import type { DocumentModel } from '../model/document'
import type { CommandHistory } from '../model/commands'
import { ModifyAttributeCommand, AddElementCommand, RemoveElementCommand, CompoundCommand } from '../model/commands'
import type { Point } from '../model/coordinates'
import { elementToPathD, extractStyleAttrs } from '../model/shapeToPath'
import { parsePathD, commandsToD } from '../model/pathOps'

export interface ControlPoints {
  /** cp1 (outgoing from prev anchor) and cp2 (incoming to this anchor) per C segment */
  handleIn: Point | null   // incoming control handle for this anchor
  handleOut: Point | null   // outgoing control handle from this anchor
}

/**
 * All four node-editing functions below are built on the canonical
 * `parsePathD`/`commandsToD` pair from pathOps. That parser converts every
 * command (relative m/l/c, H/V, S/Q/T, A) to ABSOLUTE M/L/C/Z, so the first
 * edit normalizes the path losslessly and no segment is ever dropped. The old
 * standalone regex parser these replaced read relative commands verbatim as
 * absolute and silently discarded H/V/S/Q/T/A — see bead vectorfeld-3yu.7.
 *
 * Anchor indexing: every non-Z command (M/L/C) contributes exactly one anchor,
 * at `cmd.points[cmd.points.length - 1]`. For a C command that endpoint is
 * points[2]; points[0] is cp1 (the outgoing handle of the PREVIOUS anchor) and
 * points[1] is cp2 (the incoming handle of THIS anchor).
 */

/** Parse path anchors with their control handles */
export function parsePathWithHandles(d: string): { pos: Point; handles: ControlPoints }[] {
  const result: { pos: Point; handles: ControlPoints }[] = []
  for (const cmd of parsePathD(d)) {
    if (cmd.type === 'M' || cmd.type === 'L') {
      result.push({ pos: { ...cmd.points[0] }, handles: { handleIn: null, handleOut: null } })
    } else if (cmd.type === 'C') {
      // points[0]=cp1 (outgoing from previous anchor), [1]=cp2 (incoming), [2]=endpoint
      if (result.length > 0) {
        result[result.length - 1].handles.handleOut = { ...cmd.points[0] }
      }
      result.push({ pos: { ...cmd.points[2] }, handles: { handleIn: { ...cmd.points[1] }, handleOut: null } })
    }
    // Z contributes no anchor
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
  const commands = parsePathD(d)
  // Anchor index advances on every non-Z command.
  let currentIdx = -1
  for (const cmd of commands) {
    if (cmd.type === 'Z') continue
    currentIdx++
    if (cmd.type !== 'C') continue
    // C: cp1 (points[0]) is handleOut of anchor (currentIdx-1); cp2 (points[1]) is handleIn of anchor (currentIdx).
    if (handleType === 'out' && currentIdx - 1 === anchorIdx) {
      cmd.points[0] = { x: newPos.x, y: newPos.y }
    }
    if (handleType === 'in' && currentIdx === anchorIdx) {
      cmd.points[1] = { x: newPos.x, y: newPos.y }
    }
  }
  return commandsToD(commands)
}

/** Parse SVG path d attribute into anchor points (M, L, C commands) */
export function parsePathAnchors(d: string): Point[] {
  const points: Point[] = []
  for (const cmd of parsePathD(d)) {
    if (cmd.type === 'Z') continue
    const end = cmd.points[cmd.points.length - 1]
    points.push({ x: end.x, y: end.y })
  }
  return points
}

/** Update a specific anchor point's position in a path d string,
 *  also moving adjacent Bezier control handles by the same delta. */
export function updatePathAnchor(d: string, anchorIdx: number, newPos: Point): string {
  const commands = parsePathD(d)

  // First pass: find old endpoint of the target anchor so we can compute delta.
  let oldPos: Point | null = null
  let ci = -1
  for (const cmd of commands) {
    if (cmd.type === 'Z') continue
    ci++
    if (ci === anchorIdx) {
      const end = cmd.points[cmd.points.length - 1]
      oldPos = { x: end.x, y: end.y }
      break
    }
  }

  const dx = oldPos ? newPos.x - oldPos.x : 0
  const dy = oldPos ? newPos.y - oldPos.y : 0

  // Second pass: move the anchor's endpoint, plus adjacent control handles by
  // the same delta.
  //   - For the C command whose endpoint is anchorIdx: cp2 (incoming handle,
  //     points[1]) moves with the anchor; endpoint (points[2]) is set to newPos.
  //   - For the NEXT C command (whose cp1/points[0] is anchorIdx's outgoing
  //     handle): cp1 moves with the anchor.
  let currentIdx = -1
  let prevAnchorIdx = -1
  for (const cmd of commands) {
    if (cmd.type === 'Z') continue
    currentIdx++
    if (cmd.type === 'C') {
      // cp1 (outgoing from previous anchor) — move if previous anchor is the target.
      if (prevAnchorIdx === anchorIdx) {
        cmd.points[0] = { x: cmd.points[0].x + dx, y: cmd.points[0].y + dy }
      }
      // cp2 (incoming to this anchor) — move if this anchor is the target.
      if (currentIdx === anchorIdx) {
        cmd.points[1] = { x: cmd.points[1].x + dx, y: cmd.points[1].y + dy }
        cmd.points[2] = { x: newPos.x, y: newPos.y }
      }
    } else if (currentIdx === anchorIdx) {
      // M or L: move the endpoint.
      cmd.points[0] = { x: newPos.x, y: newPos.y }
    }
    prevAnchorIdx = currentIdx
  }

  return commandsToD(commands)
}

function anchorDocSize(svg: SVGSVGElement): number {
  const vb = svg.viewBox.baseVal
  if (vb.width === 0 || svg.clientWidth === 0) return 2
  return 8 * (vb.width / svg.clientWidth)
}

const DIRECT_SELECT_TAGS = new Set(['path', 'rect', 'ellipse', 'circle', 'line'])

function hitTestElement(svg: SVGSVGElement, screenX: number, screenY: number): Element | null {
  return sharedHitTestElement(svg, screenX, screenY, { tagFilter: DIRECT_SELECT_TAGS })
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
  getDoc: () => DocumentModel | null,
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
    onDeactivate() {
      clearVisuals()
      state.selectedPath = null
      state.anchors = []
      state.anchorHandles = []
      state.selectedAnchorIdx = -1
      state.dragTarget = null
      state.dragging = false
    },
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
