import { registerTool } from './registry'
import type { ToolConfig } from './registry'
import { screenToDoc } from '../model/coordinates'
import type { Command } from '../model/commands'
import type { DocumentModel } from '../model/document'
import type { CommandHistory } from '../model/commands'

function hitTest(svg: SVGSVGElement, screenX: number, screenY: number): Element | null {
  const pt = screenToDoc(svg, screenX, screenY)
  const layers = svg.querySelectorAll('g[data-layer-name]')
  for (let li = layers.length - 1; li >= 0; li--) {
    const layer = layers[li]
    if (layer.getAttribute('data-locked') === 'true') continue
    if ((layer as SVGElement).style.display === 'none') continue
    const children = layer.children
    for (let ci = children.length - 1; ci >= 0; ci--) {
      const child = children[ci]
      try {
        const bbox = (child as SVGGraphicsElement).getBBox()
        if (pt.x >= bbox.x && pt.x <= bbox.x + bbox.width && pt.y >= bbox.y && pt.y <= bbox.y + bbox.height) {
          return child
        }
      } catch { /* skip */ }
    }
  }
  return null
}

export function createEraserTool(
  getSvg: () => SVGSVGElement | null,
  getDoc: () => DocumentModel | null,
  getHistory: () => CommandHistory
): ToolConfig {
  let dragging = false
  const erasedInDrag = new Set<Element>()

  return {
    name: 'eraser',
    icon: 'X',
    shortcut: 'x',
    cursor: 'not-allowed',
    handlers: {
      onMouseDown(e: MouseEvent) {
        const svg = getSvg()
        const doc = getDoc()
        if (!svg || !doc || e.button !== 0) return
        dragging = true
        erasedInDrag.clear()

        const hit = hitTest(svg, e.clientX, e.clientY)
        if (hit) {
          erasedInDrag.add(hit)
          hit.remove()
        }
      },

      onMouseMove(e: MouseEvent) {
        if (!dragging) return
        const svg = getSvg()
        if (!svg) return
        const hit = hitTest(svg, e.clientX, e.clientY)
        if (hit && !erasedInDrag.has(hit)) {
          erasedInDrag.add(hit)
          hit.remove()
        }
      },

      onMouseUp() {
        if (!dragging) return
        dragging = false
        const doc = getDoc()
        if (!doc || erasedInDrag.size === 0) return

        // Create undo commands — elements are already removed,
        // so we build RemoveElementCommands and mark them as already executed
        // Actually, we need to undo-ably track these. Since elements are already
        // removed from DOM, we create a compound command that re-removes on execute
        // and restores on undo. Simplest: just push a custom command.
        const elements = Array.from(erasedInDrag)
        const history = getHistory()

        // We already removed them, so we need a command whose undo restores them.
        // We'll create a dummy compound command.
        let firstExec = true
        const wrappedCmd: Command = {
          description: 'Erase',
          execute() {
            if (firstExec) { firstExec = false; return }
            for (const el of elements) el.remove()
          },
          undo() {
            const layer = doc.getActiveLayer()
            if (layer) {
              for (const el of elements) layer.appendChild(el)
            }
          },
        }
        history.execute(wrappedCmd)
        erasedInDrag.clear()
      },
    },
  }
}

export function registerEraserTool(
  getSvg: () => SVGSVGElement | null,
  getDoc: () => DocumentModel | null,
  getHistory: () => CommandHistory
): void {
  registerTool(createEraserTool(getSvg, getDoc, getHistory))
}
