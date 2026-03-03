import { transformedAABB as sharedTransformedAABB } from './geometry'

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
const HANDLE_SCREEN_PX = 10

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

/** Transform a local-space bbox through a rotation to get the axis-aligned bounding box */
function transformedAABB(bbox: DOMRect, transform: string | null) {
  return sharedTransformedAABB(bbox, transform)
}

/** Compute the union bounding box of multiple elements (transform-aware) */
function unionBBox(elements: Element[]): DOMRect | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  let hasBox = false
  for (const el of elements) {
    try {
      const bbox = (el as SVGGraphicsElement).getBBox()
      const transform = el.getAttribute('transform')
      const aabb = transformedAABB(bbox, transform)
      minX = Math.min(minX, aabb.x)
      minY = Math.min(minY, aabb.y)
      maxX = Math.max(maxX, aabb.x + aabb.width)
      maxY = Math.max(maxY, aabb.y + aabb.height)
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

  // Draw per-element selection boxes (following element transform)
  for (const el of selectedElements) {
    try {
      const bbox = (el as SVGGraphicsElement).getBBox()
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
      rect.setAttribute('x', String(bbox.x))
      rect.setAttribute('y', String(bbox.y))
      rect.setAttribute('width', String(bbox.width))
      rect.setAttribute('height', String(bbox.height))
      // Apply element's transform so selection box follows rotation
      const transform = el.getAttribute('transform')
      if (transform) {
        rect.setAttribute('transform', transform)
      }
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

  const svg = overlayGroup.ownerSVGElement
  if (!svg) return

  const hs = handleDocSize(svg)
  const half = hs / 2
  const strokeW = Math.max(hs / 6, 0.1)

  // For a single rotated element, use OBB (oriented bounding box):
  // place handles on the local bbox and apply the element's transform
  const singleRotated = selectedElements.length === 1
    ? selectedElements[0].getAttribute('transform')
    : null

  let handleBox: DOMRect | null
  let handleTransform: string | null = null

  if (selectedElements.length === 1 && singleRotated) {
    // Use local (un-transformed) bbox for OBB handles
    try {
      const bbox = (selectedElements[0] as SVGGraphicsElement).getBBox()
      handleBox = new DOMRect(bbox.x, bbox.y, bbox.width, bbox.height)
      handleTransform = singleRotated
    } catch {
      handleBox = unionBBox(selectedElements)
    }
  } else {
    handleBox = unionBBox(selectedElements)
  }

  if (!handleBox) return

  for (const [pos, cx, cy] of handleCenters(handleBox)) {
    const handle = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    handle.setAttribute('x', String(cx - half))
    handle.setAttribute('y', String(cy - half))
    handle.setAttribute('width', String(hs))
    handle.setAttribute('height', String(hs))
    if (handleTransform) handle.setAttribute('transform', handleTransform)
    handle.setAttribute('fill', '#ffffff')
    handle.setAttribute('stroke', '#2563eb')
    handle.setAttribute('stroke-width', String(strokeW))
    handle.setAttribute('data-role', 'scale-handle')
    handle.setAttribute('data-handle-pos', pos)
    handle.setAttribute('pointer-events', 'auto')
    handle.style.cursor = HANDLE_CURSORS[pos]
    overlayGroup.appendChild(handle)
  }

  // Draw corner rotation zones (Illustrator-style: hover near corners to rotate)
  if (selectedElements.length === 1) {
    const rotZoneSize = hs * 2  // invisible hit area outside each corner
    const cornerPositions: [string, number, number][] = [
      ['nw', handleBox.x, handleBox.y],
      ['ne', handleBox.x + handleBox.width, handleBox.y],
      ['se', handleBox.x + handleBox.width, handleBox.y + handleBox.height],
      ['sw', handleBox.x, handleBox.y + handleBox.height],
    ]

    // Custom rotation cursors — curved arrow SVGs for each corner
    const rotArrow = (rotate: number) =>
      `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><g transform='rotate(${rotate} 12 12)'><path d='M7 4a8 8 0 0 1 10 0' fill='none' stroke='%23333' stroke-width='2' stroke-linecap='round'/><path d='M17 4l-3-2M17 4l-2 3' fill='none' stroke='%23333' stroke-width='2' stroke-linecap='round'/></g></svg>`)}") 12 12, crosshair`
    const ROTATION_CURSORS: Record<string, string> = {
      nw: rotArrow(180),
      ne: rotArrow(270),
      se: rotArrow(0),
      sw: rotArrow(90),
    }

    for (const [corner, cx, cy] of cornerPositions) {
      // Offset the rotation zone outward from the corner
      const offX = corner.includes('w') ? -rotZoneSize : 0
      const offY = corner.includes('n') ? -rotZoneSize : 0

      const zone = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
      zone.setAttribute('x', String(cx + offX))
      zone.setAttribute('y', String(cy + offY))
      zone.setAttribute('width', String(rotZoneSize))
      zone.setAttribute('height', String(rotZoneSize))
      if (handleTransform) zone.setAttribute('transform', handleTransform)
      zone.setAttribute('fill', 'transparent')
      zone.setAttribute('data-role', 'rotation-handle')
      zone.setAttribute('pointer-events', 'auto')
      zone.style.cursor = ROTATION_CURSORS[corner]
      overlayGroup.appendChild(zone)
    }
  }
}

export function refreshOverlay(): void {
  updateOverlay()
}
