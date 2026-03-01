import { registerTool } from './registry'
import type { ToolConfig } from './registry'
import { screenToDoc } from '../model/coordinates'
import { setSelection, clearSelection, toggleSelection, getSelection, refreshOverlay } from '../model/selection'
import type { DocumentModel } from '../model/document'
import type { CommandHistory } from '../model/commands'
import { CompoundCommand, ModifyAttributeCommand } from '../model/commands'

function hitTest(svg: SVGSVGElement, screenX: number, screenY: number): Element | null {
  const pt = screenToDoc(svg, screenX, screenY)
  // Find the topmost element at this document point.
  // Walk through layer children in reverse (top to bottom visually)
  const layers = svg.querySelectorAll('g[data-layer-name]')
  for (let li = layers.length - 1; li >= 0; li--) {
    const layer = layers[li]
    // Skip locked layers
    if (layer.getAttribute('data-locked') === 'true') continue
    // Skip hidden layers
    if ((layer as SVGElement).style.display === 'none') continue

    const children = layer.children
    for (let ci = children.length - 1; ci >= 0; ci--) {
      const child = children[ci]
      try {
        const bbox = (child as SVGGraphicsElement).getBBox()
        if (
          pt.x >= bbox.x &&
          pt.x <= bbox.x + bbox.width &&
          pt.y >= bbox.y &&
          pt.y <= bbox.y + bbox.height
        ) {
          return child
        }
      } catch {
        // skip elements without bbox
      }
    }
  }
  return null
}

interface DragState {
  dragging: boolean
  startX: number
  startY: number
  startPositions: Map<Element, { attr: string; vals: Record<string, number> }>
}

export function createSelectTool(
  getSvg: () => SVGSVGElement | null,
  _getDoc: () => DocumentModel | null,
  getHistory: () => CommandHistory
): ToolConfig {
  const dragState: DragState = {
    dragging: false,
    startX: 0,
    startY: 0,
    startPositions: new Map(),
  }

  function getPositionAttrs(el: Element): { attr: string; vals: Record<string, number> } {
    const tag = el.tagName
    if (tag === 'line') {
      return {
        attr: 'line',
        vals: {
          x1: parseFloat(el.getAttribute('x1') || '0'),
          y1: parseFloat(el.getAttribute('y1') || '0'),
          x2: parseFloat(el.getAttribute('x2') || '0'),
          y2: parseFloat(el.getAttribute('y2') || '0'),
        },
      }
    } else if (tag === 'rect') {
      return {
        attr: 'rect',
        vals: {
          x: parseFloat(el.getAttribute('x') || '0'),
          y: parseFloat(el.getAttribute('y') || '0'),
        },
      }
    } else if (tag === 'ellipse') {
      return {
        attr: 'ellipse',
        vals: {
          cx: parseFloat(el.getAttribute('cx') || '0'),
          cy: parseFloat(el.getAttribute('cy') || '0'),
        },
      }
    } else if (tag === 'circle') {
      return {
        attr: 'circle',
        vals: {
          cx: parseFloat(el.getAttribute('cx') || '0'),
          cy: parseFloat(el.getAttribute('cy') || '0'),
        },
      }
    } else if (tag === 'text') {
      return {
        attr: 'text',
        vals: {
          x: parseFloat(el.getAttribute('x') || '0'),
          y: parseFloat(el.getAttribute('y') || '0'),
        },
      }
    }
    return { attr: 'unknown', vals: {} }
  }

  function moveElement(el: Element, dx: number, dy: number) {
    const tag = el.tagName
    if (tag === 'line') {
      const start = dragState.startPositions.get(el)!
      el.setAttribute('x1', String(start.vals.x1 + dx))
      el.setAttribute('y1', String(start.vals.y1 + dy))
      el.setAttribute('x2', String(start.vals.x2 + dx))
      el.setAttribute('y2', String(start.vals.y2 + dy))
    } else if (tag === 'rect' || tag === 'text') {
      const start = dragState.startPositions.get(el)!
      el.setAttribute('x', String(start.vals.x + dx))
      el.setAttribute('y', String(start.vals.y + dy))
    } else if (tag === 'ellipse' || tag === 'circle') {
      const start = dragState.startPositions.get(el)!
      el.setAttribute('cx', String(start.vals.cx + dx))
      el.setAttribute('cy', String(start.vals.cy + dy))
    }
  }

  return {
    name: 'select',
    icon: 'V',
    shortcut: 'v',
    handlers: {
      onMouseDown(e: MouseEvent) {
        const svg = getSvg()
        if (!svg || e.button !== 0) return

        const hit = hitTest(svg, e.clientX, e.clientY)
        const pt = screenToDoc(svg, e.clientX, e.clientY)

        if (e.shiftKey && hit) {
          toggleSelection(hit)
          return
        }

        if (hit) {
          const sel = getSelection()
          if (!sel.includes(hit)) {
            setSelection([hit])
          }
          // Start drag
          dragState.dragging = true
          dragState.startX = pt.x
          dragState.startY = pt.y
          dragState.startPositions.clear()
          for (const el of getSelection()) {
            dragState.startPositions.set(el, getPositionAttrs(el))
          }
        } else {
          clearSelection()
        }
      },

      onMouseMove(e: MouseEvent) {
        if (!dragState.dragging) return
        const svg = getSvg()
        if (!svg) return
        const pt = screenToDoc(svg, e.clientX, e.clientY)
        const dx = pt.x - dragState.startX
        const dy = pt.y - dragState.startY

        for (const el of getSelection()) {
          moveElement(el, dx, dy)
        }

        refreshOverlay()
      },

      onMouseUp(e: MouseEvent) {
        if (!dragState.dragging) return
        dragState.dragging = false

        const svg = getSvg()
        if (!svg) return
        const pt = screenToDoc(svg, e.clientX, e.clientY)
        const dx = pt.x - dragState.startX
        const dy = pt.y - dragState.startY

        if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return // no movement

        // Create undo commands
        const commands = []
        for (const el of getSelection()) {
          const start = dragState.startPositions.get(el)
          if (!start) continue
          for (const [attr, origVal] of Object.entries(start.vals)) {
            const newVal = el.getAttribute(attr)
            if (newVal !== null && newVal !== String(origVal)) {
              commands.push(new ModifyAttributeCommand(el, attr, newVal))
              // Set old value for undo by adjusting the command's internal state
              // Actually, the command captures oldValue on execute, so we need to
              // reset the attribute to the original, then execute the command
              el.setAttribute(attr, String(origVal))
            }
          }
        }

        if (commands.length > 0) {
          const compound = new CompoundCommand(commands, 'Move')
          getHistory().execute(compound)
        }

        dragState.startPositions.clear()
      },
    },
  }
}

export function registerSelectTool(
  getSvg: () => SVGSVGElement | null,
  getDoc: () => DocumentModel | null,
  getHistory: () => CommandHistory
): void {
  registerTool(createSelectTool(getSvg, getDoc, getHistory))
}
