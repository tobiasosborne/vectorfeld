import { registerTool } from './registry'
import type { ToolConfig } from './registry'
import { screenToDoc } from '../model/coordinates'
import type { DocumentModel } from '../model/document'
import type { CommandHistory } from '../model/commands'
import { setDefaultStyle } from '../model/defaultStyle'

/** Hit test for eyedropper — find topmost element under cursor */
function hitTest(svg: SVGSVGElement, screenX: number, screenY: number): Element | null {
  const pt = screenToDoc(svg, screenX, screenY)
  const vb = svg.viewBox.baseVal
  const tolerance = vb.width > 0 && svg.clientWidth > 0
    ? 5 * (vb.width / svg.clientWidth)
    : 2
  const layers = svg.querySelectorAll('g[data-layer-name]')
  for (let li = layers.length - 1; li >= 0; li--) {
    const layer = layers[li]
    if ((layer as SVGElement).style.display === 'none') continue
    const children = layer.children
    for (let ci = children.length - 1; ci >= 0; ci--) {
      const child = children[ci]
      try {
        const bbox = (child as SVGGraphicsElement).getBBox()
        const padX = bbox.width < tolerance * 2 ? tolerance : 0
        const padY = bbox.height < tolerance * 2 ? tolerance : 0
        if (
          pt.x >= bbox.x - padX && pt.x <= bbox.x + bbox.width + padX &&
          pt.y >= bbox.y - padY && pt.y <= bbox.y + bbox.height + padY
        ) {
          return child
        }
      } catch { /* skip */ }
    }
  }
  return null
}

export function createEyedropperTool(
  getSvg: () => SVGSVGElement | null,
  _getDoc: () => DocumentModel | null,
  _getHistory: () => CommandHistory
): ToolConfig {
  return {
    name: 'eyedropper',
    icon: 'I',
    shortcut: 'i',
    cursor: 'crosshair',
    handlers: {
      onMouseDown(e: MouseEvent) {
        const svg = getSvg()
        if (!svg || e.button !== 0) return
        const hit = hitTest(svg, e.clientX, e.clientY)
        if (!hit) return
        const stroke = hit.getAttribute('stroke') || '#000000'
        const fill = hit.getAttribute('fill') || 'none'
        const strokeWidth = hit.getAttribute('stroke-width') || '1'
        setDefaultStyle({ stroke, fill, strokeWidth })
      },
    },
  }
}

export function registerEyedropperTool(
  getSvg: () => SVGSVGElement | null,
  getDoc: () => DocumentModel | null,
  getHistory: () => CommandHistory
): void {
  registerTool(createEyedropperTool(getSvg, getDoc, getHistory))
}
