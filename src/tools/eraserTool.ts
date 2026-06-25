import { registerTool } from './registry'
import type { ToolConfig } from './registry'
import type { DocumentModel } from '../model/document'
import type { CommandHistory } from '../model/commands'
import { RemoveElementCommand, CompoundCommand } from '../model/commands'
import { removeFromSelection, refreshOverlay } from '../model/selection'
import { hitTestElement } from '../model/geometry'

export function createEraserTool(
  getSvg: () => SVGSVGElement | null,
  getDoc: () => DocumentModel | null,
  getHistory: () => CommandHistory
): ToolConfig {
  let dragging = false
  // Elements collected during the drag — NOT yet removed from the DOM.
  const erasedInDrag = new Set<Element>()
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

  /** Hide an element from view without detaching it from the DOM. */
  function hideElement(el: Element): void {
    (el as SVGElement).style.visibility = 'hidden'
    removeFromSelection(el)
    refreshOverlay()
  }

  /** Restore visibility on collected elements (called before committing the command
   *  so that RemoveElementCommand.execute() performs the canonical detach). */
  function restoreVisibility(): void {
    for (const el of erasedInDrag) {
      (el as SVGElement).style.removeProperty('visibility')
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
        clearHighlight()

        const hit = hitTestElement(svg, e.clientX, e.clientY)
        if (hit) {
          erasedInDrag.add(hit)
          hideElement(hit)
        }
      },

      onMouseMove(e: MouseEvent) {
        const svg = getSvg()
        if (!svg) return

        if (dragging) {
          const hit = hitTestElement(svg, e.clientX, e.clientY)
          if (hit && !erasedInDrag.has(hit)) {
            erasedInDrag.add(hit)
            hideElement(hit)
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

        // Restore visibility BEFORE RemoveElementCommand.execute() detaches elements,
        // so the command records clean DOM state (no lingering style mutations).
        restoreVisibility()

        const elements = Array.from(erasedInDrag)
        erasedInDrag.clear()

        const history = getHistory()
        // CompoundCommand undoes children in reverse order, so sibling z-order is
        // always restored correctly even when A→B→C were erased in sequence.
        history.execute(
          new CompoundCommand(
            elements.map((el) => new RemoveElementCommand(doc, el)),
            'Erase'
          )
        )
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
