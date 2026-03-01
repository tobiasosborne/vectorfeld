export type HandlePosition = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

const HANDLE_CURSORS: Record<HandlePosition, string> = {
  nw: 'nwse-resize',
  n: 'ns-resize',
  ne: 'nesw-resize',
  e: 'ew-resize',
  se: 'nwse-resize',
  s: 'ns-resize',
  sw: 'nesw-resize',
  w: 'ew-resize',
}

const HANDLE_POSITIONS: HandlePosition[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

/** Screen pixels for handle square side length */
const HANDLE_SCREEN_PX = 6

/** Screen pixels for rotation handle distance above top-center */
const ROTATION_HANDLE_OFFSET_PX = 20

let selectedElements: Element[] = []
let listeners: Array<() => void> = []
let overlayGroup: SVGGElement | null = null

function notify() {
  listeners.forEach((fn) => fn())
}

export function getSelection(): Element[] {
  return [...selectedElements]
}

export function setSelection(elements: Element[]): void {
  selectedElements = [...elements]
  updateOverlay()
  notify()
}

export function addToSelection(el: Element): void {
  if (!selectedElements.includes(el)) {
    selectedElements.push(el)
    updateOverlay()
    notify()
  }
}

export function removeFromSelection(el: Element): void {
  selectedElements = selectedElements.filter((e) => e !== el)
  updateOverlay()
  notify()
}

export function toggleSelection(el: Element): void {
  if (selectedElements.includes(el)) {
    removeFromSelection(el)
  } else {
    addToSelection(el)
  }
}

export function clearSelection(): void {
  selectedElements = []
  updateOverlay()
  notify()
}

export function isSelected(el: Element): boolean {
  return selectedElements.includes(el)
}

export function subscribeSelection(fn: () => void): () => void {
  listeners.push(fn)
  return () => {
    listeners = listeners.filter((l) => l !== fn)
  }
}

export function setOverlayGroup(g: SVGGElement): void {
  overlayGroup = g
}

/** Compute the union bounding box of multiple elements */
function unionBBox(elements: Element[]): DOMRect | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  let hasBox = false
  for (const el of elements) {
    try {
      const bbox = (el as SVGGraphicsElement).getBBox()
      minX = Math.min(minX, bbox.x)
      minY = Math.min(minY, bbox.y)
      maxX = Math.max(maxX, bbox.x + bbox.width)
      maxY = Math.max(maxY, bbox.y + bbox.height)
      hasBox = true
    } catch {
      // skip
    }
  }
  if (!hasBox) return null
  return new DOMRect(minX, minY, maxX - minX, maxY - minY)
}

/** Calculate handle side-length in document units so it appears HANDLE_SCREEN_PX on screen */
function handleDocSize(svg: SVGSVGElement): number {
  const vb = svg.viewBox.baseVal
  if (vb.width === 0 || svg.clientWidth === 0) return 2 // fallback
  return HANDLE_SCREEN_PX * (vb.width / svg.clientWidth)
}

/** Get the document-coordinate center for each handle position */
function handleCenters(
  bbox: DOMRect
): [HandlePosition, number, number][] {
  const { x, y, width, height } = bbox
  return [
    ['nw', x, y],
    ['n', x + width / 2, y],
    ['ne', x + width, y],
    ['e', x + width, y + height / 2],
    ['se', x + width, y + height],
    ['s', x + width / 2, y + height],
    ['sw', x, y + height],
    ['w', x, y + height / 2],
  ]
}

function updateOverlay(): void {
  if (!overlayGroup) return
  // Clear old overlay
  while (overlayGroup.firstChild) {
    overlayGroup.removeChild(overlayGroup.firstChild)
  }

  if (selectedElements.length === 0) return

  // Draw per-element selection boxes
  for (const el of selectedElements) {
    try {
      const bbox = (el as SVGGraphicsElement).getBBox()
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
      rect.setAttribute('x', String(bbox.x))
      rect.setAttribute('y', String(bbox.y))
      rect.setAttribute('width', String(bbox.width))
      rect.setAttribute('height', String(bbox.height))
      rect.setAttribute('fill', 'none')
      rect.setAttribute('stroke', '#2563eb')
      rect.setAttribute('stroke-width', '0.5')
      rect.setAttribute('stroke-dasharray', '2 1')
      rect.setAttribute('data-role', 'selection-box')
      rect.setAttribute('pointer-events', 'none')
      overlayGroup.appendChild(rect)
    } catch {
      // getBBox may fail for elements without layout
    }
  }

  // Draw 8 scale handles around the union bounding box
  const ubox = unionBBox(selectedElements)
  if (!ubox) return

  const svg = overlayGroup.ownerSVGElement
  if (!svg) return

  const hs = handleDocSize(svg)
  const half = hs / 2
  const strokeW = Math.max(hs / 6, 0.1)

  for (const [pos, cx, cy] of handleCenters(ubox)) {
    const handle = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    handle.setAttribute('x', String(cx - half))
    handle.setAttribute('y', String(cy - half))
    handle.setAttribute('width', String(hs))
    handle.setAttribute('height', String(hs))
    handle.setAttribute('fill', '#ffffff')
    handle.setAttribute('stroke', '#2563eb')
    handle.setAttribute('stroke-width', String(strokeW))
    handle.setAttribute('data-role', 'scale-handle')
    handle.setAttribute('data-handle-pos', pos)
    handle.setAttribute('pointer-events', 'auto')
    handle.style.cursor = HANDLE_CURSORS[pos]
    overlayGroup.appendChild(handle)
  }

  // Draw rotation handle above top-center (single selection only)
  if (selectedElements.length === 1) {
    const topCenterX = ubox.x + ubox.width / 2
    const topCenterY = ubox.y
    const offset = ROTATION_HANDLE_OFFSET_PX * (svg.viewBox.baseVal.width / svg.clientWidth)

    // Connecting line from top-center to rotation handle
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
    line.setAttribute('x1', String(topCenterX))
    line.setAttribute('y1', String(topCenterY))
    line.setAttribute('x2', String(topCenterX))
    line.setAttribute('y2', String(topCenterY - offset))
    line.setAttribute('stroke', '#2563eb')
    line.setAttribute('stroke-width', String(strokeW))
    line.setAttribute('data-role', 'rotation-line')
    line.setAttribute('pointer-events', 'none')
    overlayGroup.appendChild(line)

    // Rotation handle circle
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
    circle.setAttribute('cx', String(topCenterX))
    circle.setAttribute('cy', String(topCenterY - offset))
    circle.setAttribute('r', String(hs * 0.6))
    circle.setAttribute('fill', '#ffffff')
    circle.setAttribute('stroke', '#2563eb')
    circle.setAttribute('stroke-width', String(strokeW))
    circle.setAttribute('data-role', 'rotation-handle')
    circle.setAttribute('pointer-events', 'auto')
    circle.style.cursor = 'grab'
    overlayGroup.appendChild(circle)
  }
}

export function refreshOverlay(): void {
  updateOverlay()
}
