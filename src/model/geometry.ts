/**
 * Shared geometry utilities — single source of truth for transform-aware
 * bounding box computation and hit testing.
 */

import { parseTransform, applyMatrixToPoint } from './matrix'
import { translatePathD } from './pathOps'
import { screenToDoc } from './coordinates'

export interface BBox {
  x: number
  y: number
  width: number
  height: number
}

/** Transform a local-space bbox through any SVG transform to get the axis-aligned bounding box */
export function transformedAABB(bbox: BBox, transform: string | null): BBox {
  if (!transform) return bbox
  const m = parseTransform(transform)
  // Identity check (no-op transform)
  if (m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1 && m[4] === 0 && m[5] === 0) return bbox
  const corners = [
    applyMatrixToPoint(m, bbox.x, bbox.y),
    applyMatrixToPoint(m, bbox.x + bbox.width, bbox.y),
    applyMatrixToPoint(m, bbox.x + bbox.width, bbox.y + bbox.height),
    applyMatrixToPoint(m, bbox.x, bbox.y + bbox.height),
  ]
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const pt of corners) {
    minX = Math.min(minX, pt.x)
    minY = Math.min(minY, pt.y)
    maxX = Math.max(maxX, pt.x)
    maxY = Math.max(maxY, pt.y)
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
  } else if (tag === 'rect' || tag === 'text' || tag === 'image') {
    changes.push(['x', String(parseFloat(el.getAttribute('x') || '0') + dx)])
    changes.push(['y', String(parseFloat(el.getAttribute('y') || '0') + dy)])
  } else if (tag === 'ellipse' || tag === 'circle') {
    changes.push(['cx', String(parseFloat(el.getAttribute('cx') || '0') + dx)])
    changes.push(['cy', String(parseFloat(el.getAttribute('cy') || '0') + dy)])
  } else if (tag === 'path') {
    // Bake translation directly into d attribute coordinates
    const d = el.getAttribute('d') || ''
    const existing = el.getAttribute('transform') || ''
    // Absorb any existing translate into the d offset
    const transMatch = existing.match(/translate\(([-\d.e+-]+),\s*([-\d.e+-]+)\)/)
    const totalDx = dx + (transMatch ? parseFloat(transMatch[1]) : 0)
    const totalDy = dy + (transMatch ? parseFloat(transMatch[2]) : 0)
    changes.push(['d', translatePathD(d, totalDx, totalDy)])
    // Rebuild transform: shift rotation center, strip translate, preserve skew
    const rotMatch = existing.match(/rotate\(([-\d.e+-]+)(?:,\s*([-\d.e+-]+),\s*([-\d.e+-]+))?\)/)
    const skewParts: string[] = []
    const skewXMatch = existing.match(/skewX\([^)]+\)/)
    const skewYMatch = existing.match(/skewY\([^)]+\)/)
    if (skewXMatch) skewParts.push(skewXMatch[0])
    if (skewYMatch) skewParts.push(skewYMatch[0])
    if (rotMatch) {
      const angle = rotMatch[1]
      const cx = parseFloat(rotMatch[2] || '0') + totalDx
      const cy = parseFloat(rotMatch[3] || '0') + totalDy
      const parts = [`rotate(${angle}, ${cx}, ${cy})`, ...skewParts]
      changes.push(['transform', parts.join(' ')])
    } else if (transMatch || skewParts.length > 0) {
      // Had translate and/or skew but no rotate — keep only skew
      changes.push(['transform', skewParts.join(' ')])
    }
    return changes
  } else if (tag === 'g' || tag === 'polygon' || tag === 'polyline') {
    // Move via translate transform (can't bake coords for groups)
    const existing = el.getAttribute('transform') || ''
    const transMatch = existing.match(/translate\(([-\d.e+-]+),\s*([-\d.e+-]+)\)/)
    const tx = (transMatch ? parseFloat(transMatch[1]) : 0) + dx
    const ty = (transMatch ? parseFloat(transMatch[2]) : 0) + dy
    const newTransform = transMatch
      ? existing.replace(/translate\([-\d.e+-]+,\s*[-\d.e+-]+\)/, `translate(${tx}, ${ty})`)
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

// ---------------------------------------------------------------------------
// Shared hit testing
// ---------------------------------------------------------------------------

const HIT_TOLERANCE_PX = 5

export interface HitTestOptions {
  /** If provided, only hit elements with these tag names */
  tagFilter?: Set<string>
  /** Skip locked layers (default: true) */
  skipLocked?: boolean
}

/**
 * Hit test: find topmost element under cursor.
 * Transform-aware (uses full affine matrix).
 */
export function hitTestElement(
  svg: SVGSVGElement,
  screenX: number,
  screenY: number,
  opts?: HitTestOptions,
): Element | null {
  const pt = screenToDoc(svg, screenX, screenY)
  const vb = svg.viewBox.baseVal
  const tolerance = vb.width > 0 && svg.clientWidth > 0
    ? HIT_TOLERANCE_PX * (vb.width / svg.clientWidth)
    : 2
  const skipLocked = opts?.skipLocked !== false
  const tagFilter = opts?.tagFilter
  const layers = svg.querySelectorAll('g[data-layer-name]')
  for (let li = layers.length - 1; li >= 0; li--) {
    const layer = layers[li]
    if (skipLocked && layer.getAttribute('data-locked') === 'true') continue
    if ((layer as SVGElement).style.display === 'none') continue
    const children = layer.children
    for (let ci = children.length - 1; ci >= 0; ci--) {
      const child = children[ci]
      if (tagFilter && !tagFilter.has(child.tagName)) continue
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

/**
 * Hit test returning ALL elements under cursor (for Alt+click cycle-through).
 */
export function hitTestAll(
  svg: SVGSVGElement,
  screenX: number,
  screenY: number,
): Element[] {
  const pt = screenToDoc(svg, screenX, screenY)
  const vb = svg.viewBox.baseVal
  const tolerance = vb.width > 0 && svg.clientWidth > 0
    ? HIT_TOLERANCE_PX * (vb.width / svg.clientWidth)
    : 2
  const hits: Element[] = []
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
        const transform = child.getAttribute('transform')
        const aabb = transformedAABB(bbox, transform)
        const padX = aabb.width < tolerance * 2 ? tolerance : 0
        const padY = aabb.height < tolerance * 2 ? tolerance : 0
        if (
          pt.x >= aabb.x - padX && pt.x <= aabb.x + aabb.width + padX &&
          pt.y >= aabb.y - padY && pt.y <= aabb.y + aabb.height + padY
        ) {
          hits.push(child)
        }
      } catch { /* skip */ }
    }
  }
  return hits
}
