import { registerTool } from './registry'
import type { ToolConfig } from './registry'
import { screenToDoc } from '../model/coordinates'
import { AddElementCommand } from '../model/commands'
import type { DocumentModel } from '../model/document'
import type { CommandHistory } from '../model/commands'

interface EllipseToolState {
  drawing: boolean
  centerX: number
  centerY: number
  preview: SVGEllipseElement | null
}

export function createEllipseTool(
  getSvg: () => SVGSVGElement | null,
  getDoc: () => DocumentModel | null,
  getHistory: () => CommandHistory
): ToolConfig {
  const state: EllipseToolState = {
    drawing: false,
    centerX: 0,
    centerY: 0,
    preview: null,
  }

  function removePreview() {
    if (state.preview) {
      state.preview.remove()
      state.preview = null
    }
  }

  return {
    name: 'ellipse',
    icon: 'E',
    shortcut: 'e',
    cursor: 'crosshair',
    handlers: {
      onMouseDown(e: MouseEvent) {
        const svg = getSvg()
        if (!svg || e.button !== 0) return
        const pt = screenToDoc(svg, e.clientX, e.clientY)

        state.drawing = true
        state.centerX = pt.x
        state.centerY = pt.y

        const ellipse = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse')
        ellipse.setAttribute('cx', String(pt.x))
        ellipse.setAttribute('cy', String(pt.y))
        ellipse.setAttribute('rx', '0')
        ellipse.setAttribute('ry', '0')
        ellipse.setAttribute('stroke', '#000000')
        ellipse.setAttribute('stroke-width', '1')
        ellipse.setAttribute('fill', 'none')
        ellipse.setAttribute('data-role', 'preview')
        svg.appendChild(ellipse)
        state.preview = ellipse
      },

      onMouseMove(e: MouseEvent) {
        if (!state.drawing || !state.preview) return
        const svg = getSvg()
        if (!svg) return
        const pt = screenToDoc(svg, e.clientX, e.clientY)
        let rx = Math.abs(pt.x - state.centerX)
        let ry = Math.abs(pt.y - state.centerY)
        if (e.shiftKey) {
          const r = Math.max(rx, ry)
          rx = r
          ry = r
        }
        state.preview.setAttribute('rx', String(rx))
        state.preview.setAttribute('ry', String(ry))
      },

      onMouseUp(e: MouseEvent) {
        if (!state.drawing) return
        const svg = getSvg()
        if (!svg) return
        const pt = screenToDoc(svg, e.clientX, e.clientY)
        let rx = Math.abs(pt.x - state.centerX)
        let ry = Math.abs(pt.y - state.centerY)
        if (e.shiftKey) {
          const r = Math.max(rx, ry)
          rx = r
          ry = r
        }

        state.drawing = false
        removePreview()

        if (rx < 0.1 && ry < 0.1) return // too small

        const doc = getDoc()
        if (!doc) return
        const layer = doc.getActiveLayer()
        if (!layer) return

        const history = getHistory()
        const cmd = new AddElementCommand(doc, layer, 'ellipse', {
          cx: String(state.centerX),
          cy: String(state.centerY),
          rx: String(rx),
          ry: String(ry),
          stroke: '#000000',
          'stroke-width': '1',
          fill: 'none',
        })
        history.execute(cmd)
      },
    },
  }
}

export function registerEllipseTool(
  getSvg: () => SVGSVGElement | null,
  getDoc: () => DocumentModel | null,
  getHistory: () => CommandHistory
): void {
  registerTool(createEllipseTool(getSvg, getDoc, getHistory))
}
