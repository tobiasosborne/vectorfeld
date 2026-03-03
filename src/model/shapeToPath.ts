/**
 * Shape-to-path converters — convert SVG primitives to <path> d strings.
 */

/** Kappa constant for quarter-circle cubic Bezier approximation */
const KAPPA = 0.5522847498

/** Style attributes to preserve when converting shape to path */
const STYLE_ATTRS = [
  'stroke', 'stroke-width', 'fill', 'opacity',
  'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin',
  'marker-start', 'marker-end', 'transform',
]

/** Convert rect to path d. Handles optional rounded corners. */
export function rectToPathD(x: number, y: number, w: number, h: number, rx = 0, ry = 0): string {
  if (rx === 0 && ry === 0) {
    return `M${x} ${y} L${x + w} ${y} L${x + w} ${y + h} L${x} ${y + h} Z`
  }
  rx = Math.min(rx, w / 2)
  ry = Math.min(ry, h / 2)
  const kx = rx * KAPPA
  const ky = ry * KAPPA
  return [
    `M${x + rx} ${y}`,
    `L${x + w - rx} ${y}`,
    `C${x + w - rx + kx} ${y} ${x + w} ${y + ry - ky} ${x + w} ${y + ry}`,
    `L${x + w} ${y + h - ry}`,
    `C${x + w} ${y + h - ry + ky} ${x + w - rx + kx} ${y + h} ${x + w - rx} ${y + h}`,
    `L${x + rx} ${y + h}`,
    `C${x + rx - kx} ${y + h} ${x} ${y + h - ry + ky} ${x} ${y + h - ry}`,
    `L${x} ${y + ry}`,
    `C${x} ${y + ry - ky} ${x + rx - kx} ${y} ${x + rx} ${y}`,
    'Z',
  ].join(' ')
}

/** Convert ellipse to path d using 4 cubic Bezier arcs. */
export function ellipseToPathD(cx: number, cy: number, rx: number, ry: number): string {
  const kx = rx * KAPPA
  const ky = ry * KAPPA
  return [
    `M${cx} ${cy - ry}`,
    `C${cx + kx} ${cy - ry} ${cx + rx} ${cy - ky} ${cx + rx} ${cy}`,
    `C${cx + rx} ${cy + ky} ${cx + kx} ${cy + ry} ${cx} ${cy + ry}`,
    `C${cx - kx} ${cy + ry} ${cx - rx} ${cy + ky} ${cx - rx} ${cy}`,
    `C${cx - rx} ${cy - ky} ${cx - kx} ${cy - ry} ${cx} ${cy - ry}`,
    'Z',
  ].join(' ')
}

/** Convert circle to path d. */
export function circleToPathD(cx: number, cy: number, r: number): string {
  return ellipseToPathD(cx, cy, r, r)
}

/** Convert line to path d. */
export function lineToPathD(x1: number, y1: number, x2: number, y2: number): string {
  return `M${x1} ${y1} L${x2} ${y2}`
}

/** Extract the path d string for any supported SVG element */
export function elementToPathD(el: Element): string | null {
  const tag = el.tagName
  if (tag === 'rect') {
    return rectToPathD(
      parseFloat(el.getAttribute('x') || '0'),
      parseFloat(el.getAttribute('y') || '0'),
      parseFloat(el.getAttribute('width') || '0'),
      parseFloat(el.getAttribute('height') || '0'),
      parseFloat(el.getAttribute('rx') || '0'),
      parseFloat(el.getAttribute('ry') || '0'),
    )
  }
  if (tag === 'ellipse') {
    return ellipseToPathD(
      parseFloat(el.getAttribute('cx') || '0'),
      parseFloat(el.getAttribute('cy') || '0'),
      parseFloat(el.getAttribute('rx') || '0'),
      parseFloat(el.getAttribute('ry') || '0'),
    )
  }
  if (tag === 'circle') {
    return circleToPathD(
      parseFloat(el.getAttribute('cx') || '0'),
      parseFloat(el.getAttribute('cy') || '0'),
      parseFloat(el.getAttribute('r') || '0'),
    )
  }
  if (tag === 'line') {
    return lineToPathD(
      parseFloat(el.getAttribute('x1') || '0'),
      parseFloat(el.getAttribute('y1') || '0'),
      parseFloat(el.getAttribute('x2') || '0'),
      parseFloat(el.getAttribute('y2') || '0'),
    )
  }
  return null
}

/** Get style attributes from an element for transfer to a new path */
export function extractStyleAttrs(el: Element): Record<string, string> {
  const attrs: Record<string, string> = {}
  for (const attr of STYLE_ATTRS) {
    const val = el.getAttribute(attr)
    if (val !== null && val !== '') {
      attrs[attr] = val
    }
  }
  return attrs
}
