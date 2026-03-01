import { registerTool } from './registry'
import type { ToolConfig } from './registry'
import { screenToDoc } from '../model/coordinates'
import { AddElementCommand } from '../model/commands'
import type { DocumentModel } from '../model/document'
import type { CommandHistory } from '../model/commands'
import { getDefaultStyle } from '../model/defaultStyle'
import { snapToGrid } from '../model/grid'

interface RectToolState {
  drawing: boolean
  startX: number
  startY: number
  preview: SVGRectElement | null
}

export function createRectTool(
  getSvg: () => SVGSVGElement | null,
  getDoc: () => DocumentModel | null,
  getHistory: () => CommandHistory
): ToolConfig {
  const state: RectToolState = {
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

  function computeRect(sx: number, sy: number, ex: number, ey: number, shift: boolean) {
    let x = Math.min(sx, ex)
    let y = Math.min(sy, ey)
    let w = Math.abs(ex - sx)
    let h = Math.abs(ey - sy)
    if (shift) {
      const side = Math.min(w, h)
      w = side
      h = side
      x = ex < sx ? sx - side : sx
      y = ey < sy ? sy - side : sy
    }
    return { x, y, w, h }
  }

  return {
    name: 'rectangle',
    icon: 'R',
    shortcut: 'r',
    cursor: 'crosshair',
    handlers: {
      onMouseDown(e: MouseEvent) {
        const svg = getSvg()
        if (!svg || e.button !== 0) return
        const raw = screenToDoc(svg, e.clientX, e.clientY)
        const pt = snapToGrid(raw.x, raw.y)

        state.drawing = true
        state.startX = pt.x
        state.startY = pt.y

        const defaults = getDefaultStyle()
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
        rect.setAttribute('x', String(pt.x))
        rect.setAttribute('y', String(pt.y))
        rect.setAttribute('width', '0')
        rect.setAttribute('height', '0')
        rect.setAttribute('stroke', defaults.stroke)
        rect.setAttribute('stroke-width', defaults.strokeWidth)
        rect.setAttribute('fill', defaults.fill)
        rect.setAttribute('data-role', 'preview')
        svg.appendChild(rect)
        state.preview = rect
      },

      onMouseMove(e: MouseEvent) {
        if (!state.drawing || !state.preview) return
        const svg = getSvg()
        if (!svg) return
        const raw = screenToDoc(svg, e.clientX, e.clientY)
        const pt = snapToGrid(raw.x, raw.y)
        const { x, y, w, h } = computeRect(state.startX, state.startY, pt.x, pt.y, e.shiftKey)
        state.preview.setAttribute('x', String(x))
        state.preview.setAttribute('y', String(y))
        state.preview.setAttribute('width', String(w))
        state.preview.setAttribute('height', String(h))
      },

      onMouseUp(e: MouseEvent) {
        if (!state.drawing) return
        const svg = getSvg()
        if (!svg) return
        const raw = screenToDoc(svg, e.clientX, e.clientY)
        const pt = snapToGrid(raw.x, raw.y)
        const { x, y, w, h } = computeRect(state.startX, state.startY, pt.x, pt.y, e.shiftKey)

        state.drawing = false
        removePreview()

        if (w < 0.1 && h < 0.1) return // too small, discard

        const doc = getDoc()
        if (!doc) return
        const layer = doc.getActiveLayer()
        if (!layer) return

        const history = getHistory()
        const defaults = getDefaultStyle()
        const cmd = new AddElementCommand(doc, layer, 'rect', {
          x: String(x),
          y: String(y),
          width: String(w),
          height: String(h),
          stroke: defaults.stroke,
          'stroke-width': defaults.strokeWidth,
          fill: defaults.fill,
        })
        history.execute(cmd)
      },
    },
  }
}

export function registerRectTool(
  getSvg: () => SVGSVGElement | null,
  getDoc: () => DocumentModel | null,
  getHistory: () => CommandHistory
): void {
  registerTool(createRectTool(getSvg, getDoc, getHistory))
}
