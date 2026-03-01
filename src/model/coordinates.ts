export interface Point {
  x: number
  y: number
}

/**
 * Convert screen (pixel) coordinates to document (mm) coordinates.
 * Uses the SVG element's coordinate transform matrix.
 */
export function screenToDoc(svg: SVGSVGElement, screenX: number, screenY: number): Point {
  const pt = svg.createSVGPoint()
  pt.x = screenX
  pt.y = screenY
  const ctm = svg.getScreenCTM()
  if (!ctm) return { x: 0, y: 0 }
  const transformed = pt.matrixTransform(ctm.inverse())
  return { x: transformed.x, y: transformed.y }
}

/**
 * Convert document (mm) coordinates to screen (pixel) coordinates.
 */
export function docToScreen(svg: SVGSVGElement, docX: number, docY: number): Point {
  const pt = svg.createSVGPoint()
  pt.x = docX
  pt.y = docY
  const ctm = svg.getScreenCTM()
  if (!ctm) return { x: 0, y: 0 }
  const transformed = pt.matrixTransform(ctm)
  return { x: transformed.x, y: transformed.y }
}

/**
 * Parse a viewBox string into its components.
 */
export function parseViewBox(svg: SVGSVGElement): { x: number; y: number; width: number; height: number } {
  const vb = svg.viewBox.baseVal
  return { x: vb.x, y: vb.y, width: vb.width, height: vb.height }
}

/**
 * Set the viewBox on an SVG element.
 */
export function setViewBox(svg: SVGSVGElement, x: number, y: number, width: number, height: number): void {
  svg.setAttribute('viewBox', `${x} ${y} ${width} ${height}`)
}

/**
 * Get the current zoom level as a ratio.
 * Zoom = (SVG element client width in px) / (viewBox width in SVG units).
 * At 96 DPI with 1 unit = 1mm, 100% zoom means ~3.78 px per mm.
 */
export function getZoomLevel(svg: SVGSVGElement): number {
  const vb = svg.viewBox.baseVal
  if (vb.width === 0) return 1
  return svg.clientWidth / vb.width
}

/**
 * Get zoom as a percentage relative to the "natural" 96 DPI mapping.
 * At 96 DPI, 1mm = 3.7795... px. So 100% zoom means pxPerUnit ≈ 3.78.
 */
export function getZoomPercent(svg: SVGSVGElement): number {
  const PX_PER_MM_96DPI = 96 / 25.4 // ≈ 3.7795
  const pxPerUnit = getZoomLevel(svg)
  return (pxPerUnit / PX_PER_MM_96DPI) * 100
}
