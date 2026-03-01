import { setViewBox, parseViewBox } from './coordinates'

const MIN_ZOOM = 0.1   // 10% of natural
const MAX_ZOOM = 64    // 6400% of natural
const ZOOM_FACTOR = 1.1 // 10% per scroll step

/**
 * Convert screen coords to document coords using pure viewBox math.
 * Does not rely on SVG DOM APIs (works in jsdom tests).
 */
function screenToDocViaViewBox(
  svg: SVGSVGElement,
  screenX: number,
  screenY: number
): { x: number; y: number } {
  const vb = svg.viewBox.baseVal
  const rect = svg.getBoundingClientRect()
  const ratioX = (screenX - rect.left) / rect.width
  const ratioY = (screenY - rect.top) / rect.height
  return {
    x: vb.x + ratioX * vb.width,
    y: vb.y + ratioY * vb.height,
  }
}

/**
 * Zoom toward a screen point, keeping the document point under the cursor stable.
 * deltaY > 0 = scroll down = zoom out, deltaY < 0 = scroll up = zoom in.
 */
export function zoomAtPoint(
  svg: SVGSVGElement,
  screenX: number,
  screenY: number,
  deltaY: number
): void {
  const vb = parseViewBox(svg)
  if (vb.width === 0 || vb.height === 0) return

  // Document point under cursor before zoom
  const docPt = screenToDocViaViewBox(svg, screenX, screenY)

  // Compute scale factor
  const scale = deltaY > 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR

  // New viewBox dimensions
  let newWidth = vb.width * scale
  let newHeight = vb.height * scale

  // Clamp to zoom limits
  const newPxPerUnit = svg.clientWidth / newWidth
  if (newPxPerUnit < MIN_ZOOM || newPxPerUnit > MAX_ZOOM) return

  if (newWidth < 1) newWidth = 1
  if (newHeight < 1) newHeight = 1

  // Reposition viewBox so docPt stays at the same screen position.
  const rect = svg.getBoundingClientRect()
  const ratioX = (screenX - rect.left) / rect.width
  const ratioY = (screenY - rect.top) / rect.height
  const newX = docPt.x - ratioX * newWidth
  const newY = docPt.y - ratioY * newHeight

  setViewBox(svg, newX, newY, newWidth, newHeight)
}

export { MIN_ZOOM, MAX_ZOOM, ZOOM_FACTOR }
