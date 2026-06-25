import { MIN_SCALE_SIZE } from '../tools/selectTool'

/**
 * Attributes whose value MUST be a strictly positive size. A zero or negative
 * value here produces invalid SVG ("A negative value is not valid"), makes the
 * shape vanish, and leaves the selection overlay drawing phantom handles from a
 * stale bbox (vectorfeld-3yu.18). Clamped up to {@link MIN_SCALE_SIZE} (0.1),
 * the same floor the free-transform scale path uses.
 */
const POSITIVE_SIZE_ATTRS = new Set(['width', 'height', 'r'])

/**
 * Attributes that must be NON-negative but may legitimately be exactly 0.
 * `rx`/`ry` on a <rect> are corner radii — `rx="0"` means square corners and is
 * perfectly valid SVG, so the floor here is 0, not MIN_SCALE_SIZE. Only the
 * negative case is the bug.
 */
const NONNEGATIVE_ATTRS = new Set(['rx', 'ry'])

/**
 * Clamp a dimension attribute write to a valid floor before it reaches the DOM.
 *
 * @returns the value to write (clamped if it was below its floor, otherwise the
 *   original string unchanged), or `null` to REJECT the write entirely (caller
 *   must skip it). `null` is only returned for a non-numeric value on a
 *   dimension attribute.
 *
 * Non-dimension attributes (positions like x/y/cx/cy/x1.., transforms, colors,
 * paths, …) pass through UNCHANGED — negative positions are legal and must not
 * be touched.
 */
export function clampAttr(attr: string, value: string): string | null {
  const isPositiveSize = POSITIVE_SIZE_ATTRS.has(attr)
  const isNonNegative = NONNEGATIVE_ATTRS.has(attr)

  // Positions, transforms, colors, etc. — not a clamped dimension. Pass through.
  if (!isPositiveSize && !isNonNegative) return value

  const n = parseFloat(value)
  if (isNaN(n)) return null // reject: a non-numeric dimension would corrupt the SVG

  if (isPositiveSize) {
    return n < MIN_SCALE_SIZE ? String(MIN_SCALE_SIZE) : value
  }
  // NONNEGATIVE_ATTRS: 0 is valid (square corners); only negatives are clamped.
  return n < 0 ? '0' : value
}
