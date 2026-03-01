import { registerTool } from './registry'
import type { ToolConfig } from './registry'
import { screenToDoc } from '../model/coordinates'
import type { DocumentModel } from '../model/document'
import type { CommandHistory } from '../model/commands'
import { setDefaultStyle } from '../model/defaultStyle'

/** Transform a local-space bbox through a rotation to get the AABB */
function transformedAABB(
  bbox: { x: number; y: number; width: number; height: number },
  transform: string | null
): { x: number; y: number; width: number; height: number } {
  if (!transform) return bbox
  const match = transform.match(/rotate\(([-\d.]+)(?:,\s*([-\d.]+),\s*([-\d.]+))?\)/)
  if (!match) return bbox
  const angle = (parseFloat(match[1]) * Math.PI) / 180
  const cx = match[2] ? parseFloat(match[2]) : 0
  const cy = match[3] ? parseFloat(match[3]) : 0
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const corners = [
    { x: bbox.x, y: bbox.y },
    { x: bbox.x + bbox.width, y: bbox.y },
    { x: bbox.x + bbox.width, y: bbox.y + bbox.height },
    { x: bbox.x, y: bbox.y + bbox.height },
  ]
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const pt of corners) {
    const rx = pt.x - cx
    const ry = pt.y - cy
    const tx = cx + rx * cos - ry * sin
    const ty = cy + rx * sin + ry * cos
    minX = Math.min(minX, tx)
    minY = Math.min(minY, ty)
    maxX = Math.max(maxX, tx)
    maxY = Math.max(maxY, ty)
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

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
        const transform = child.getAttribute('transform')
        const aabb = transformedAABB(bbox, transform)
        const padX = aabb.width < tolerance * 2 ? tolerance : 0
        const padY = aabb.height < tolerance * 2 ? tolerance : 0
        if (
          pt.x >= aabb.x - padX && pt.x <= aabb.x + aabb.width + padX &&
          pt.y >= aabb.y - padY && pt.y <= aabb.y + aabb.height + padY
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
