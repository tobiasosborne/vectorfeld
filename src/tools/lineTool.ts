import { registerTool } from './registry'
import type { ToolConfig } from './registry'
import { screenToDoc } from '../model/coordinates'
import { AddElementCommand } from '../model/commands'
import type { DocumentModel } from '../model/document'
import type { CommandHistory } from '../model/commands'
import { getDefaultStyle } from '../model/defaultStyle'
import { snapToGrid } from '../model/grid'

/** When shift is held, constrain line angle to nearest 45-degree increment */
function snapLineAngle(
  sx: number, sy: number, end: { x: number; y: number }, shift: boolean
): { x: number; y: number } {
  if (!shift) return end
  const dx = end.x - sx
  const dy = end.y - sy
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len < 0.001) return end
  const angle = Math.atan2(dy, dx)
  const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4)
  return { x: sx + len * Math.cos(snapped), y: sy + len * Math.sin(snapped) }
}

interface LineToolState {
  drawing: boolean
  startX: number
  startY: number
  preview: SVGLineElement | null
}

export function createLineTool(
  getSvg: () => SVGSVGElement | null,
  getDoc: () => DocumentModel | null,
  getHistory: () => CommandHistory
): ToolConfig {
  const state: LineToolState = {
    drawing: false,
    startX: 0,
    startY: 0,
    preview: null,
  }

  function removePreview() {
    if (state.preview) {
      state.preview.remove()
      state.preview = null
    }
  }

  return {
    name: 'line',
    icon: 'L',
    shortcut: 'l',
    cursor: 'crosshair',
    onDeactivate() { state.drawing = false; removePreview() },
    handlers: {
      onMouseDown(e: MouseEvent) {
        const svg = getSvg()
        if (!svg || e.button !== 0) return
        const raw = screenToDoc(svg, e.clientX, e.clientY)
        const pt = snapToGrid(raw.x, raw.y)

        state.drawing = true
        state.startX = pt.x
        state.startY = pt.y

        // Create preview line
        const defaults = getDefaultStyle()
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
        line.setAttribute('x1', String(pt.x))
        line.setAttribute('y1', String(pt.y))
        line.setAttribute('x2', String(pt.x))
        line.setAttribute('y2', String(pt.y))
        line.setAttribute('stroke', defaults.stroke)
        line.setAttribute('stroke-width', defaults.strokeWidth)
        line.setAttribute('data-role', 'preview')
        svg.appendChild(line)
        state.preview = line
      },

      onMouseMove(e: MouseEvent) {
        if (!state.drawing || !state.preview) return
        const svg = getSvg()
        if (!svg) return
        const raw = screenToDoc(svg, e.clientX, e.clientY)
        const snapped = snapToGrid(raw.x, raw.y)
        const pt = snapLineAngle(state.startX, state.startY, snapped, e.shiftKey)
        state.preview.setAttribute('x2', String(pt.x))
        state.preview.setAttribute('y2', String(pt.y))
      },

      onMouseUp(e: MouseEvent) {
        if (!state.drawing) return
        const svg = getSvg()
        if (!svg) return
        const raw = screenToDoc(svg, e.clientX, e.clientY)
        const snapped = snapToGrid(raw.x, raw.y)
        const pt = snapLineAngle(state.startX, state.startY, snapped, e.shiftKey)

        state.drawing = false
        removePreview()

        // Only commit if the line has some length
        const dx = pt.x - state.startX
        const dy = pt.y - state.startY
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return

        const doc = getDoc()
        if (!doc) return
        const layer = doc.getActiveLayer()
        if (!layer) return

        const history = getHistory()
        const defaults = getDefaultStyle()
        const cmd = new AddElementCommand(doc, layer, 'line', {
          x1: String(state.startX),
          y1: String(state.startY),
          x2: String(pt.x),
          y2: String(pt.y),
          stroke: defaults.stroke,
          'stroke-width': defaults.strokeWidth,
        })
        history.execute(cmd)

      },
    },
  }
}

export function registerLineTool(
  getSvg: () => SVGSVGElement | null,
  getDoc: () => DocumentModel | null,
  getHistory: () => CommandHistory
): void {
  registerTool(createLineTool(getSvg, getDoc, getHistory))
}
