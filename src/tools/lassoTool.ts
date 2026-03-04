/**
 * Lasso selection tool — freeform polygon selection.
 *
 * Draw a freeform path; on release, selects all elements whose
 * bounding box center falls inside the lasso polygon.
 * Uses the ray-casting algorithm for point-in-polygon testing.
 */
import { registerTool } from './registry'
import type { ToolConfig } from './registry'
import { screenToDoc } from '../model/coordinates'
import { setSelection } from '../model/selection'
import { transformedAABB } from '../model/geometry'
import type { DocumentModel } from '../model/document'
import type { CommandHistory } from '../model/commands'

type Pt = { x: number; y: number }

/**
 * Ray-casting point-in-polygon test.
 * Casts a ray from point p in the +x direction and counts edge crossings.
 * Odd crossings = inside.
 */
export function pointInPolygon(p: Pt, polygon: Pt[]): boolean {
  const n = polygon.length
  let inside = false

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const yi = polygon[i].y, yj = polygon[j].y
    const xi = polygon[i].x, xj = polygon[j].x

    if ((yi > p.y) !== (yj > p.y)) {
      const xIntersect = xi + (p.y - yi) * (xj - xi) / (yj - yi)
      if (p.x < xIntersect) inside = !inside
    }
  }

  return inside
}

export function createLassoTool(
  getSvg: () => SVGSVGElement | null,
  _getDoc: () => DocumentModel | null,
  _getHistory: () => CommandHistory
): ToolConfig {
  let points: Pt[] = []
  let previewPath: SVGPathElement | null = null

  return {
    name: 'lasso',
    icon: 'J',
    shortcut: 'j',
    cursor: 'crosshair',
    handlers: {
      onMouseDown(e: MouseEvent) {
        const svg = getSvg()
        if (!svg || e.button !== 0) return
        const pt = screenToDoc(svg, e.clientX, e.clientY)
        points = [pt]

        previewPath = document.createElementNS('http://www.w3.org/2000/svg', 'path')
        previewPath.setAttribute('fill', 'rgba(37, 99, 235, 0.08)')
        previewPath.setAttribute('stroke', '#2563eb')
        previewPath.setAttribute('stroke-width', '0.5')
        previewPath.setAttribute('stroke-dasharray', '2 1')
        previewPath.setAttribute('data-role', 'preview')
        previewPath.setAttribute('pointer-events', 'none')
        svg.appendChild(previewPath)
      },

      onMouseMove(e: MouseEvent) {
        if (!points.length || !previewPath) return
        const svg = getSvg()
        if (!svg) return
        const pt = screenToDoc(svg, e.clientX, e.clientY)

        // Only add point if it moved enough (avoid thousands of duplicate points)
        const last = points[points.length - 1]
        if (Math.hypot(pt.x - last.x, pt.y - last.y) < 0.5) return
        points.push(pt)

        // Update preview path
        const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ') + ' Z'
        previewPath.setAttribute('d', d)
      },

      onMouseUp() {
        const svg = getSvg()
        cleanup()

        if (!svg || points.length < 3) {
          points = []
          return
        }

        const polygon = points
        points = []

        // Find all elements whose bbox center is inside the lasso
        const selected: Element[] = []
        for (const layer of svg.querySelectorAll('g[data-layer-name]')) {
          if (layer.getAttribute('data-locked') === 'true') continue
          if ((layer as SVGElement).style.display === 'none') continue

          for (const child of layer.children) {
            const transform = child.getAttribute('transform')
            let bbox: { x: number; y: number; width: number; height: number }
            try {
              bbox = transformedAABB((child as SVGGraphicsElement).getBBox(), transform)
            } catch {
              continue
            }
            const center: Pt = {
              x: bbox.x + bbox.width / 2,
              y: bbox.y + bbox.height / 2,
            }
            if (pointInPolygon(center, polygon)) {
              selected.push(child)
            }
          }
        }

        setSelection(selected)
      },
    },
  }

  function cleanup() {
    if (previewPath) {
      previewPath.remove()
      previewPath = null
    }
  }
}

export function registerLassoTool(
  getSvg: () => SVGSVGElement | null,
  getDoc: () => DocumentModel | null,
  getHistory: () => CommandHistory
): void {
  registerTool(createLassoTool(getSvg, getDoc, getHistory))
}
