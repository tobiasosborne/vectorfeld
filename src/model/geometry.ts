/**
 * Shared geometry utilities — single source of truth for transform-aware
 * bounding box computation and hit testing.
 */

export interface BBox {
  x: number
  y: number
  width: number
  height: number
}

/** Transform a local-space bbox through a rotation to get the axis-aligned bounding box */
export function transformedAABB(bbox: BBox, transform: string | null): BBox {
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

/** Get the AABB of an SVG element, accounting for its transform */
export function getElementAABB(el: Element): BBox | null {
  try {
    const bbox = (el as SVGGraphicsElement).getBBox()
    const transform = el.getAttribute('transform')
    return transformedAABB(bbox, transform)
  } catch {
    return null
  }
}

/**
 * Apply delta translations to an element's position attributes.
 * Handles all element types including path and g (via translate transform).
 * Returns [attr, newValue] pairs for command creation.
 */
export function computeTranslateAttrs(el: Element, dx: number, dy: number): Array<[string, string]> {
  const changes: Array<[string, string]> = []
  const tag = el.tagName
  if (tag === 'line') {
    changes.push(['x1', String(parseFloat(el.getAttribute('x1') || '0') + dx)])
    changes.push(['y1', String(parseFloat(el.getAttribute('y1') || '0') + dy)])
    changes.push(['x2', String(parseFloat(el.getAttribute('x2') || '0') + dx)])
    changes.push(['y2', String(parseFloat(el.getAttribute('y2') || '0') + dy)])
  } else if (tag === 'rect' || tag === 'text') {
    changes.push(['x', String(parseFloat(el.getAttribute('x') || '0') + dx)])
    changes.push(['y', String(parseFloat(el.getAttribute('y') || '0') + dy)])
  } else if (tag === 'ellipse' || tag === 'circle') {
    changes.push(['cx', String(parseFloat(el.getAttribute('cx') || '0') + dx)])
    changes.push(['cy', String(parseFloat(el.getAttribute('cy') || '0') + dy)])
  } else if (tag === 'path' || tag === 'g' || tag === 'polygon' || tag === 'polyline') {
    // Move via translate transform
    const existing = el.getAttribute('transform') || ''
    const transMatch = existing.match(/translate\(([-\d.]+),\s*([-\d.]+)\)/)
    const tx = (transMatch ? parseFloat(transMatch[1]) : 0) + dx
    const ty = (transMatch ? parseFloat(transMatch[2]) : 0) + dy
    const newTransform = transMatch
      ? existing.replace(/translate\([-\d.]+,\s*[-\d.]+\)/, `translate(${tx}, ${ty})`)
      : `translate(${tx}, ${ty})${existing ? ' ' + existing : ''}`
    changes.push(['transform', newTransform])
    return changes // skip rotation center update for translate-based elements
  }
  // Update rotation center in transform if present
  const transform = el.getAttribute('transform')
  if (transform) {
    const match = transform.match(/rotate\(([-\d.]+)(?:,\s*([-\d.]+),\s*([-\d.]+))?\)/)
    if (match) {
      const angle = match[1]
      const cx = parseFloat(match[2] || '0') + dx
      const cy = parseFloat(match[3] || '0') + dy
      changes.push(['transform', `rotate(${angle}, ${cx}, ${cy})`])
    }
  }
  return changes
}
