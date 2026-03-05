import { registerTool } from './registry'
import type { ToolConfig } from './registry'
import { screenToDoc } from '../model/coordinates'
import { AddElementCommand } from '../model/commands'
import type { DocumentModel } from '../model/document'
import type { CommandHistory } from '../model/commands'
import { getDefaultStyle } from '../model/defaultStyle'
import { simplifyPath, pointsToPathD } from '../model/pathSimplify'
import type { Point } from '../model/pathSimplify'
import { setSelection } from '../model/selection'
import { setActiveTool } from './registry'

interface PencilToolState {
  drawing: boolean
  points: Point[]
  preview: SVGPathElement | null
}

export function createPencilTool(
  getSvg: () => SVGSVGElement | null,
  getDoc: () => DocumentModel | null,
  getHistory: () => CommandHistory
): ToolConfig {
  const state: PencilToolState = {
    drawing: false,
    points: [],
    preview: null,
  }

  function removePreview() {
    if (state.preview) {
      state.preview.remove()
      state.preview = null
    }
  }

  return {
    name: 'pencil',
    icon: 'N',
    shortcut: 'n',
    cursor: 'crosshair',
    onDeactivate() { state.drawing = false; state.points = []; removePreview() },
    handlers: {
      onMouseDown(e: MouseEvent) {
        const svg = getSvg()
        if (!svg || e.button !== 0) return
        const pt = screenToDoc(svg, e.clientX, e.clientY)

        state.drawing = true
        state.points = [pt]

        const defaults = getDefaultStyle()
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
        path.setAttribute('d', `M${pt.x} ${pt.y}`)
        path.setAttribute('stroke', defaults.stroke)
        path.setAttribute('stroke-width', defaults.strokeWidth)
        path.setAttribute('fill', 'none')
        path.setAttribute('data-role', 'preview')
        path.setAttribute('pointer-events', 'none')
        svg.appendChild(path)
        state.preview = path
      },

      onMouseMove(e: MouseEvent) {
        if (!state.drawing || !state.preview) return
        const svg = getSvg()
        if (!svg) return
        const pt = screenToDoc(svg, e.clientX, e.clientY)
        state.points.push(pt)
        state.preview.setAttribute('d', pointsToPathD(state.points))
      },

      onMouseUp(_e: MouseEvent) {
        if (!state.drawing) return
        state.drawing = false
        removePreview()

        // Need at least 2 points for a path
        if (state.points.length < 2) {
          state.points = []
          return
        }

        // Simplify path (epsilon ~0.5mm for smooth reduction)
        const simplified = simplifyPath(state.points, 0.5)
        if (simplified.length < 2) {
          state.points = []
          return
        }

        const doc = getDoc()
        if (!doc) return
        const layer = doc.getActiveLayer()
        if (!layer) return
        if (layer.getAttribute('data-locked') === 'true') return

        const history = getHistory()
        const defaults = getDefaultStyle()
        const cmd = new AddElementCommand(doc, layer, 'path', {
          d: pointsToPathD(simplified),
          stroke: defaults.stroke,
          'stroke-width': defaults.strokeWidth,
          fill: defaults.fill,
        })
        history.execute(cmd)
        const el = cmd.getElement()
        if (el) { setSelection([el]); setActiveTool('select') }
        state.points = []
      },
    },
  }
}

export function registerPencilTool(
  getSvg: () => SVGSVGElement | null,
  getDoc: () => DocumentModel | null,
  getHistory: () => CommandHistory
): void {
  registerTool(createPencilTool(getSvg, getDoc, getHistory))
}
