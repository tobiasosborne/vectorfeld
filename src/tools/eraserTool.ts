import { registerTool } from './registry'
import type { ToolConfig } from './registry'
import type { Command } from '../model/commands'
import type { DocumentModel } from '../model/document'
import type { CommandHistory } from '../model/commands'
import { removeFromSelection, refreshOverlay } from '../model/selection'
import { hitTestElement } from '../model/geometry'

export function createEraserTool(
  getSvg: () => SVGSVGElement | null,
  getDoc: () => DocumentModel | null,
  getHistory: () => CommandHistory
): ToolConfig {
  let dragging = false
  const erasedInDrag = new Set<Element>()
  const erasedPositions = new Map<Element, { parent: Element; nextSibling: Element | null }>()
  let highlightedEl: Element | null = null
  let origOutline: string | null = null

  function clearHighlight() {
    if (highlightedEl) {
      if (origOutline !== null) {
        (highlightedEl as SVGElement).style.outline = origOutline
      } else {
        (highlightedEl as SVGElement).style.removeProperty('outline')
      }
      highlightedEl = null
      origOutline = null
    }
  }

  return {
    name: 'eraser',
    icon: 'X',
    shortcut: 'x',
    cursor: 'crosshair',
    handlers: {
      onMouseDown(e: MouseEvent) {
        const svg = getSvg()
        const doc = getDoc()
        if (!svg || !doc || e.button !== 0) return
        dragging = true
        erasedInDrag.clear()
        erasedPositions.clear()
        clearHighlight()

        const hit = hitTestElement(svg, e.clientX, e.clientY)
        if (hit) {
          erasedInDrag.add(hit)
          erasedPositions.set(hit, { parent: hit.parentElement!, nextSibling: hit.nextElementSibling })
          removeFromSelection(hit)
          hit.remove()
        }
        refreshOverlay()
      },

      onMouseMove(e: MouseEvent) {
        const svg = getSvg()
        if (!svg) return

        if (dragging) {
          const hit = hitTestElement(svg, e.clientX, e.clientY)
          if (hit && !erasedInDrag.has(hit)) {
            erasedInDrag.add(hit)
            erasedPositions.set(hit, { parent: hit.parentElement!, nextSibling: hit.nextElementSibling })
            removeFromSelection(hit)
            hit.remove()
            refreshOverlay()
          }
          return
        }

        // Hover highlight — show red outline on element under cursor
        const hit = hitTestElement(svg, e.clientX, e.clientY)
        if (hit !== highlightedEl) {
          clearHighlight()
          if (hit) {
            highlightedEl = hit
            origOutline = (hit as SVGElement).style.outline || null
            ;(hit as SVGElement).style.outline = '2px solid #ef4444'
          }
        }
      },

      onMouseUp() {
        if (!dragging) return
        dragging = false
        clearHighlight()
        const doc = getDoc()
        if (!doc || erasedInDrag.size === 0) return

        const elements = Array.from(erasedInDrag)
        const positions = new Map(erasedPositions)
        const history = getHistory()

        let firstExec = true
        const wrappedCmd: Command = {
          description: 'Erase',
          execute() {
            if (firstExec) { firstExec = false; return }
            for (const el of elements) el.remove()
          },
          undo() {
            for (const el of elements) {
              const pos = positions.get(el)
              if (pos) {
                if (pos.nextSibling) {
                  pos.parent.insertBefore(el, pos.nextSibling)
                } else {
                  pos.parent.appendChild(el)
                }
              }
            }
          },
        }
        history.execute(wrappedCmd)
        erasedInDrag.clear()
        erasedPositions.clear()
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
