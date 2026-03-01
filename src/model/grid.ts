/**
 * Grid state module — controls grid display and snap-to-grid.
 * Follows the pub-sub pattern from selection.ts.
 */

export interface GridSettings {
  visible: boolean
  snapEnabled: boolean
  majorSpacing: number  // mm
  minorSpacing: number  // mm
}

let settings: GridSettings = {
  visible: false,
  snapEnabled: false,
  majorSpacing: 10,
  minorSpacing: 5,
}

let listeners: Array<() => void> = []

function notify() {
  listeners.forEach((fn) => fn())
}

export function getGridSettings(): GridSettings {
  return { ...settings }
}

export function setGridSettings(update: Partial<GridSettings>): void {
  settings = { ...settings, ...update }
  notify()
}

export function toggleGridVisible(): void {
  settings.visible = !settings.visible
  notify()
}

export function toggleGridSnap(): void {
  settings.snapEnabled = !settings.snapEnabled
  notify()
}

export function subscribeGrid(fn: () => void): () => void {
  listeners.push(fn)
  return () => {
    listeners = listeners.filter((l) => l !== fn)
  }
}

/** Snap a point to the nearest grid intersection when snap is enabled */
export function snapToGrid(x: number, y: number): { x: number; y: number } {
  if (!settings.snapEnabled) return { x, y }
  const s = settings.minorSpacing
  return {
    x: Math.round(x / s) * s,
    y: Math.round(y / s) * s,
  }
}

/** Maximum number of grid lines per axis to prevent browser freeze */
const MAX_GRID_LINES = 500

/** Render grid lines into an SVG group. Caller should place this in the overlay. */
export function renderGrid(
  svg: SVGSVGElement,
  gridGroup: SVGGElement
): void {
  // Clear existing grid lines
  while (gridGroup.firstChild) gridGroup.removeChild(gridGroup.firstChild)

  if (!settings.visible) return

  const vb = svg.viewBox.baseVal
  const x1 = vb.x + vb.width
  const y1 = vb.y + vb.height

  // Guard against excessive line counts
  const hLineCount = (x1 - vb.x) / settings.minorSpacing
  const vLineCount = (y1 - vb.y) / settings.minorSpacing
  if (hLineCount > MAX_GRID_LINES || vLineCount > MAX_GRID_LINES) return

  const x0 = Math.floor(vb.x / settings.minorSpacing) * settings.minorSpacing
  const y0 = Math.floor(vb.y / settings.minorSpacing) * settings.minorSpacing

  // Compute stroke widths relative to zoom
  const pixelSize = vb.width > 0 && svg.clientWidth > 0
    ? vb.width / svg.clientWidth
    : 0.5
  const minorSW = pixelSize * 0.5
  const majorSW = pixelSize * 1

  // Precompute major line interval (avoids floating-point modulo issues)
  const majorEvery = Math.round(settings.majorSpacing / settings.minorSpacing)

  // Draw vertical lines
  let i = 0
  for (let x = x0; x <= x1; x += settings.minorSpacing, i++) {
    const isMajor = majorEvery > 0 && (Math.round((x - x0) / settings.minorSpacing) % majorEvery === 0)
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
    line.setAttribute('x1', String(x))
    line.setAttribute('y1', String(vb.y))
    line.setAttribute('x2', String(x))
    line.setAttribute('y2', String(y1))
    line.setAttribute('stroke', isMajor ? '#cccccc' : '#e8e8e8')
    line.setAttribute('stroke-width', String(isMajor ? majorSW : minorSW))
    line.setAttribute('data-role', 'overlay')
    line.setAttribute('pointer-events', 'none')
    gridGroup.appendChild(line)
  }

  // Draw horizontal lines
  i = 0
  for (let y = y0; y <= y1; y += settings.minorSpacing, i++) {
    const isMajor = majorEvery > 0 && (Math.round((y - y0) / settings.minorSpacing) % majorEvery === 0)
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
    line.setAttribute('x1', String(vb.x))
    line.setAttribute('y1', String(y))
    line.setAttribute('x2', String(x1))
    line.setAttribute('y2', String(y))
    line.setAttribute('stroke', isMajor ? '#cccccc' : '#e8e8e8')
    line.setAttribute('stroke-width', String(isMajor ? majorSW : minorSW))
    line.setAttribute('data-role', 'overlay')
    line.setAttribute('pointer-events', 'none')
    gridGroup.appendChild(line)
  }
}
