/**
 * Reflect/Mirror — flip selected elements horizontally or vertically.
 * Returns [attr, newValue] pairs for building ModifyAttributeCommands.
 */

import { getElementAABB } from './geometry'

/** Compute attribute changes to reflect an element horizontally (across its vertical center axis) */
export function computeReflectH(el: Element): Array<[string, string]> {
  const tag = el.tagName
  const aabb = getElementAABB(el)
  if (!aabb) return []
  const cx = aabb.x + aabb.width / 2

  if (tag === 'line') {
    const x1 = parseFloat(el.getAttribute('x1') || '0')
    const x2 = parseFloat(el.getAttribute('x2') || '0')
    return [
      ['x1', String(2 * cx - x1)],
      ['x2', String(2 * cx - x2)],
    ]
  }
  if (tag === 'rect' || tag === 'text' || tag === 'image') {
    const x = parseFloat(el.getAttribute('x') || '0')
    const w = parseFloat(el.getAttribute('width') || '0')
    return [['x', String(2 * cx - x - w)]]
  }
  if (tag === 'ellipse') {
    // cx is already center — no position change needed for symmetric shape
    return []
  }
  if (tag === 'circle') {
    return []
  }
  // path, g, polygon, polyline: apply scale(-1,1) transform around center
  if (tag === 'path' || tag === 'g' || tag === 'polygon' || tag === 'polyline') {
    return buildScaleTransform(el, -1, 1, cx, aabb.y + aabb.height / 2)
  }
  return []
}

/** Compute attribute changes to reflect an element vertically (across its horizontal center axis) */
export function computeReflectV(el: Element): Array<[string, string]> {
  const tag = el.tagName
  const aabb = getElementAABB(el)
  if (!aabb) return []
  const cy = aabb.y + aabb.height / 2

  if (tag === 'line') {
    const y1 = parseFloat(el.getAttribute('y1') || '0')
    const y2 = parseFloat(el.getAttribute('y2') || '0')
    return [
      ['y1', String(2 * cy - y1)],
      ['y2', String(2 * cy - y2)],
    ]
  }
  if (tag === 'rect' || tag === 'text' || tag === 'image') {
    const y = parseFloat(el.getAttribute('y') || '0')
    const h = parseFloat(el.getAttribute('height') || '0')
    return [['y', String(2 * cy - y - h)]]
  }
  if (tag === 'ellipse' || tag === 'circle') {
    return []
  }
  if (tag === 'path' || tag === 'g' || tag === 'polygon' || tag === 'polyline') {
    return buildScaleTransform(el, 1, -1, aabb.x + aabb.width / 2, cy)
  }
  return []
}

/**
 * Build a scale transform around a center point, composing with existing transform.
 * scale(-1,1) around (cx,cy) = translate(2*cx, 0) scale(-1, 1)
 * But we use matrix form: translate(cx,cy) scale(sx,sy) translate(-cx,-cy) composed with existing.
 */
function buildScaleTransform(
  el: Element, sx: number, sy: number, cx: number, cy: number
): Array<[string, string]> {
  const existing = el.getAttribute('transform') || ''
  // Matrix: translate(cx,cy) * scale(sx,sy) * translate(-cx,-cy)
  // = [ sx, 0, cx*(1-sx), 0, sy, cy*(1-sy) ]
  const tx = cx * (1 - sx)
  const ty = cy * (1 - sy)
  const scaleStr = `translate(${tx}, ${ty}) scale(${sx}, ${sy})`
  const newTransform = existing ? `${scaleStr} ${existing}` : scaleStr
  return [['transform', newTransform]]
}
