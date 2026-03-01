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

function updateOverlay(): void {
  if (!overlayGroup) return
  // Clear old overlay
  while (overlayGroup.firstChild) {
    overlayGroup.removeChild(overlayGroup.firstChild)
  }

  if (selectedElements.length === 0) return

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
}

export function refreshOverlay(): void {
  updateOverlay()
}
