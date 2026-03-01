/**
 * Align and distribute operations for multi-selection.
 * Pure functions that return attribute changes (consumed via CompoundCommand).
 */

interface BBox {
  x: number
  y: number
  width: number
  height: number
}

/** Get the AABB for an element (transform-aware) */
function getAABB(el: Element): BBox | null {
  try {
    const bbox = (el as SVGGraphicsElement).getBBox()
    const transform = el.getAttribute('transform')
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
  } catch {
    return null
  }
}

/** Get position attributes for an element to compute deltas */
function getPositionCenter(el: Element): { cx: number; cy: number } | null {
  const aabb = getAABB(el)
  if (!aabb) return null
  return { cx: aabb.x + aabb.width / 2, cy: aabb.y + aabb.height / 2 }
}

export type AlignOp = 'left' | 'center-h' | 'right' | 'top' | 'center-v' | 'bottom'

/**
 * Compute translation deltas for aligning elements.
 * Returns a Map of element -> { dx, dy } to apply.
 */
export function computeAlign(elements: Element[], op: AlignOp): Map<Element, { dx: number; dy: number }> {
  const result = new Map<Element, { dx: number; dy: number }>()
  if (elements.length < 2) return result

  const bboxes = new Map<Element, BBox>()
  for (const el of elements) {
    const aabb = getAABB(el)
    if (aabb) bboxes.set(el, aabb)
  }
  if (bboxes.size < 2) return result

  // Compute the reference value from the union of all bboxes
  let ref = 0
  const allBoxes = Array.from(bboxes.values())
  switch (op) {
    case 'left':
      ref = Math.min(...allBoxes.map((b) => b.x))
      break
    case 'center-h': {
      const minX = Math.min(...allBoxes.map((b) => b.x))
      const maxX = Math.max(...allBoxes.map((b) => b.x + b.width))
      ref = (minX + maxX) / 2
      break
    }
    case 'right':
      ref = Math.max(...allBoxes.map((b) => b.x + b.width))
      break
    case 'top':
      ref = Math.min(...allBoxes.map((b) => b.y))
      break
    case 'center-v': {
      const minY = Math.min(...allBoxes.map((b) => b.y))
      const maxY = Math.max(...allBoxes.map((b) => b.y + b.height))
      ref = (minY + maxY) / 2
      break
    }
    case 'bottom':
      ref = Math.max(...allBoxes.map((b) => b.y + b.height))
      break
  }

  for (const [el, bbox] of bboxes) {
    let dx = 0, dy = 0
    switch (op) {
      case 'left':     dx = ref - bbox.x; break
      case 'center-h': dx = ref - (bbox.x + bbox.width / 2); break
      case 'right':    dx = ref - (bbox.x + bbox.width); break
      case 'top':      dy = ref - bbox.y; break
      case 'center-v': dy = ref - (bbox.y + bbox.height / 2); break
      case 'bottom':   dy = ref - (bbox.y + bbox.height); break
    }
    if (Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001) {
      result.set(el, { dx, dy })
    }
  }

  return result
}

export type DistributeOp = 'horizontal' | 'vertical'

/**
 * Compute translation deltas for distributing elements evenly.
 * Requires 3+ elements. Returns Map of element -> { dx, dy }.
 */
export function computeDistribute(elements: Element[], op: DistributeOp): Map<Element, { dx: number; dy: number }> {
  const result = new Map<Element, { dx: number; dy: number }>()
  if (elements.length < 3) return result

  const items: Array<{ el: Element; bbox: BBox }> = []
  for (const el of elements) {
    const aabb = getAABB(el)
    if (aabb) items.push({ el, bbox: aabb })
  }
  if (items.length < 3) return result

  if (op === 'horizontal') {
    items.sort((a, b) => (a.bbox.x + a.bbox.width / 2) - (b.bbox.x + b.bbox.width / 2))
    const first = items[0].bbox.x + items[0].bbox.width / 2
    const last = items[items.length - 1].bbox.x + items[items.length - 1].bbox.width / 2
    const step = (last - first) / (items.length - 1)
    for (let i = 1; i < items.length - 1; i++) {
      const target = first + step * i
      const current = items[i].bbox.x + items[i].bbox.width / 2
      const dx = target - current
      if (Math.abs(dx) > 0.001) result.set(items[i].el, { dx, dy: 0 })
    }
  } else {
    items.sort((a, b) => (a.bbox.y + a.bbox.height / 2) - (b.bbox.y + b.bbox.height / 2))
    const first = items[0].bbox.y + items[0].bbox.height / 2
    const last = items[items.length - 1].bbox.y + items[items.length - 1].bbox.height / 2
    const step = (last - first) / (items.length - 1)
    for (let i = 1; i < items.length - 1; i++) {
      const target = first + step * i
      const current = items[i].bbox.y + items[i].bbox.height / 2
      const dy = target - current
      if (Math.abs(dy) > 0.001) result.set(items[i].el, { dx: 0, dy })
    }
  }

  return result
}

/**
 * Apply delta translations to an element by modifying its position attributes.
 * Returns the attribute changes as [attr, newValue] pairs for command creation.
 */
export function applyDelta(el: Element, dx: number, dy: number): Array<[string, string]> {
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
