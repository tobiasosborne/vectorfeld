import { registerTool } from './registry'
import type { ToolConfig } from './registry'
import { screenToDoc } from '../model/coordinates'
import { AddElementCommand } from '../model/commands'
import type { DocumentModel } from '../model/document'
import type { CommandHistory } from '../model/commands'

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
    handlers: {
      onMouseDown(e: MouseEvent) {
        const svg = getSvg()
        if (!svg || e.button !== 0) return
        const pt = screenToDoc(svg, e.clientX, e.clientY)

        if (!state.drawing) {
          state.drawing = true
          state.startX = pt.x
          state.startY = pt.y

          // Create preview line
          const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
          line.setAttribute('x1', String(pt.x))
          line.setAttribute('y1', String(pt.y))
          line.setAttribute('x2', String(pt.x))
          line.setAttribute('y2', String(pt.y))
          line.setAttribute('stroke', '#000000')
          line.setAttribute('stroke-width', '1')
          line.setAttribute('data-role', 'preview')
          svg.appendChild(line)
          state.preview = line
        } else {
          // Commit line
          state.drawing = false
          removePreview()

          const doc = getDoc()
          if (!doc) return
          const layer = doc.getActiveLayer()
          if (!layer) return

          const history = getHistory()
          const cmd = new AddElementCommand(doc, layer, 'line', {
            x1: String(state.startX),
            y1: String(state.startY),
            x2: String(pt.x),
            y2: String(pt.y),
            stroke: '#000000',
            'stroke-width': '1',
          })
          history.execute(cmd)
        }
      },

      onMouseMove(e: MouseEvent) {
        if (!state.drawing || !state.preview) return
        const svg = getSvg()
        if (!svg) return
        const pt = screenToDoc(svg, e.clientX, e.clientY)
        state.preview.setAttribute('x2', String(pt.x))
        state.preview.setAttribute('y2', String(pt.y))
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
