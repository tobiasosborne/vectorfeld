/**
 * Knife tool — draw a cut line across paths to split them at intersections.
 */
import { registerTool } from './registry'
import type { ToolConfig } from './registry'
import { screenToDoc } from '../model/coordinates'
import { AddElementCommand, RemoveElementCommand, CompoundCommand } from '../model/commands'
import type { DocumentModel } from '../model/document'
import type { CommandHistory } from '../model/commands'
import { parsePathD, intersectLineWithPath, splitPathAtT, commandsToD } from '../model/pathOps'
import { elementToPathD, extractStyleAttrs } from '../model/shapeToPath'

export function createKnifeTool(
  getSvg: () => SVGSVGElement | null,
  getDoc: () => DocumentModel | null,
  getHistory: () => CommandHistory
): ToolConfig {
  let startPt: { x: number; y: number } | null = null
  let previewLine: SVGLineElement | null = null

  return {
    name: 'knife',
    icon: 'K',
    shortcut: 'k',
    cursor: 'crosshair',
    handlers: {
      onMouseDown(e: MouseEvent) {
        const svg = getSvg()
        if (!svg || e.button !== 0) return
        startPt = screenToDoc(svg, e.clientX, e.clientY)

        // Create preview line
        previewLine = document.createElementNS('http://www.w3.org/2000/svg', 'line')
        previewLine.setAttribute('x1', String(startPt.x))
        previewLine.setAttribute('y1', String(startPt.y))
        previewLine.setAttribute('x2', String(startPt.x))
        previewLine.setAttribute('y2', String(startPt.y))
        previewLine.setAttribute('stroke', '#e53e3e')
        previewLine.setAttribute('stroke-width', '0.5')
        previewLine.setAttribute('stroke-dasharray', '2 2')
        previewLine.setAttribute('data-role', 'preview')
        previewLine.setAttribute('pointer-events', 'none')
        svg.appendChild(previewLine)
      },

      onMouseMove(e: MouseEvent) {
        if (!startPt || !previewLine) return
        const svg = getSvg()
        if (!svg) return
        const pt = screenToDoc(svg, e.clientX, e.clientY)
        previewLine.setAttribute('x2', String(pt.x))
        previewLine.setAttribute('y2', String(pt.y))
      },

      onMouseUp(e: MouseEvent) {
        const svg = getSvg()
        const doc = getDoc()
        if (!svg || !doc || !startPt) {
          cleanup()
          return
        }

        const endPt = screenToDoc(svg, e.clientX, e.clientY)
        cleanup()

        // Skip tiny drags
        const dx = endPt.x - startPt.x
        const dy = endPt.y - startPt.y
        if (Math.sqrt(dx * dx + dy * dy) < 1) {
          startPt = null
          return
        }

        const lx1 = startPt.x, ly1 = startPt.y
        const lx2 = endPt.x, ly2 = endPt.y
        startPt = null

        // Find all path/shape elements in visible unlocked layers
        const allCmds: Array<{
          el: Element
          d: string
          styleAttrs: Record<string, string>
          parent: Element
        }> = []

        for (const layer of svg.querySelectorAll('g[data-layer-name]')) {
          if (layer.getAttribute('data-locked') === 'true') continue
          if ((layer as SVGElement).style.display === 'none') continue
          for (const child of layer.children) {
            let d: string | null = null
            if (child.tagName === 'path') {
              d = child.getAttribute('d')
            } else {
              d = elementToPathD(child)
            }
            if (!d || !child.parentElement) continue
            allCmds.push({
              el: child,
              d,
              styleAttrs: extractStyleAttrs(child),
              parent: child.parentElement,
            })
          }
        }

        // Find intersections and split
        const cmds: Array<{ execute(): void; undo(): void; description: string }> = []

        for (const item of allCmds) {
          const parsed = parsePathD(item.d)
          const hits = intersectLineWithPath(lx1, ly1, lx2, ly2, parsed)
          if (hits.length === 0) continue

          // Split path at all intersection points (process in reverse order to maintain indices)
          let pieces: string[] = [item.d]
          const sortedHits = [...hits].reverse()

          for (const hit of sortedHits) {
            const lastPiece = pieces.pop()!
            const lastCmds = parsePathD(lastPiece)
            const result = splitPathAtT(lastCmds, hit.segIndex, hit.t)
            if (result) {
              pieces.push(result[1])
              pieces.push(result[0])
            } else {
              pieces.push(lastPiece)
            }
          }

          pieces.reverse()

          if (pieces.length > 1) {
            cmds.push(new RemoveElementCommand(doc, item.el))
            for (const piece of pieces) {
              cmds.push(new AddElementCommand(doc, item.parent, 'path', {
                ...item.styleAttrs,
                d: piece,
              }))
            }
          }
        }

        if (cmds.length > 0) {
          getHistory().execute(new CompoundCommand(cmds, 'Knife Cut'))
        }
      },
    },
  }

  function cleanup() {
    if (previewLine) {
      previewLine.remove()
      previewLine = null
    }
  }
}

export function registerKnifeTool(
  getSvg: () => SVGSVGElement | null,
  getDoc: () => DocumentModel | null,
  getHistory: () => CommandHistory
): void {
  registerTool(createKnifeTool(getSvg, getDoc, getHistory))
}
