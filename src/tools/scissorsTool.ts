import { registerTool } from './registry'
import type { ToolConfig } from './registry'
import { screenToDoc } from '../model/coordinates'
import { AddElementCommand, RemoveElementCommand, CompoundCommand } from '../model/commands'
import type { DocumentModel } from '../model/document'
import type { CommandHistory } from '../model/commands'
import { parsePathD, nearestSegment, splitPathAt } from '../model/pathOps'

export function createScissorsTool(
  getSvg: () => SVGSVGElement | null,
  getDoc: () => DocumentModel | null,
  getHistory: () => CommandHistory
): ToolConfig {
  return {
    name: 'scissors',
    icon: 'C',
    shortcut: 'c',
    cursor: 'crosshair',
    handlers: {
      onMouseDown(e: MouseEvent) {
        const svg = getSvg()
        const doc = getDoc()
        if (!svg || !doc || e.button !== 0) return
        const pt = screenToDoc(svg, e.clientX, e.clientY)

        // Find nearest path element via hit test
        const tolerance = svg.viewBox.baseVal.width > 0 && svg.clientWidth > 0
          ? (svg.viewBox.baseVal.width / svg.clientWidth) * 8
          : 3

        let bestEl: SVGPathElement | null = null
        let bestDist = Infinity
        let bestSegIdx = -1

        const layers = svg.querySelectorAll('g[data-layer-name]')
        for (const layer of layers) {
          if (layer.getAttribute('data-locked') === 'true') continue
          if ((layer as SVGElement).style.display === 'none') continue
          for (const child of layer.children) {
            if (child.tagName !== 'path') continue
            const d = child.getAttribute('d')
            if (!d) continue
            const cmds = parsePathD(d)
            const { segIndex, distance } = nearestSegment(cmds, pt.x, pt.y)
            if (segIndex >= 0 && distance < tolerance && distance < bestDist) {
              bestDist = distance
              bestEl = child as SVGPathElement
              bestSegIdx = segIndex
            }
          }
        }

        if (!bestEl || bestSegIdx < 0) return

        // Split the path
        const d = bestEl.getAttribute('d')!
        const cmds = parsePathD(d)
        const [d1, d2] = splitPathAt(cmds, bestSegIdx)

        if (!d1 || !d2) return

        const parent = bestEl.parentElement
        if (!parent) return

        // Copy style attributes from original
        const styleAttrs: Record<string, string> = {}
        for (const attr of bestEl.attributes) {
          if (attr.name !== 'id' && attr.name !== 'd') {
            styleAttrs[attr.name] = attr.value
          }
        }

        const history = getHistory()
        const removeCmd = new RemoveElementCommand(doc, bestEl)
        const add1 = new AddElementCommand(doc, parent, 'path', { ...styleAttrs, d: d1 })
        const add2 = new AddElementCommand(doc, parent, 'path', { ...styleAttrs, d: d2 })
        history.execute(new CompoundCommand([removeCmd, add1, add2], 'Split Path'))
      },
    },
  }
}

export function registerScissorsTool(
  getSvg: () => SVGSVGElement | null,
  getDoc: () => DocumentModel | null,
  getHistory: () => CommandHistory
): void {
  registerTool(createScissorsTool(getSvg, getDoc, getHistory))
}
