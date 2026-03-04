/**
 * Multiple artboard management.
 *
 * Each artboard is a positioned rectangular region with its own dimensions.
 * Artboards are laid out horizontally with a configurable gap.
 * One artboard is "active" at any time — new elements go to its layers.
 *
 * Pub-sub pattern consistent with selection.ts, grid.ts, etc.
 */

export interface Artboard {
  id: string
  name: string
  x: number       // position in document space (mm)
  y: number
  width: number   // mm
  height: number  // mm
}

const GAP = 20 // mm between artboards

let artboards: Artboard[] = []
let activeId: string | null = null
let listeners: Array<() => void> = []
let nextIndex = 1

function notify() {
  for (const fn of listeners) fn()
}

export function getArtboards(): Artboard[] {
  return [...artboards]
}

export function getActiveArtboard(): Artboard | null {
  return artboards.find(a => a.id === activeId) ?? artboards[0] ?? null
}

export function setActiveArtboard(id: string): void {
  if (artboards.some(a => a.id === id)) {
    activeId = id
    notify()
  }
}

export function addArtboard(width = 210, height = 297, name?: string): Artboard {
  const id = `ab-${nextIndex++}`
  const ab: Artboard = {
    id,
    name: name ?? `Artboard ${artboards.length + 1}`,
    x: 0,
    y: 0,
    width,
    height,
  }
  artboards.push(ab)
  layoutArtboards()
  if (!activeId) activeId = id
  notify()
  return ab
}

export function removeArtboard(id: string): void {
  artboards = artboards.filter(a => a.id !== id)
  if (activeId === id) activeId = artboards[0]?.id ?? null
  layoutArtboards()
  notify()
}

export function updateArtboard(id: string, update: Partial<Pick<Artboard, 'name' | 'width' | 'height'>>): void {
  const ab = artboards.find(a => a.id === id)
  if (!ab) return
  if (update.name !== undefined) ab.name = update.name
  if (update.width !== undefined) ab.width = update.width
  if (update.height !== undefined) ab.height = update.height
  layoutArtboards()
  notify()
}

export function subscribeArtboards(fn: () => void): () => void {
  listeners.push(fn)
  return () => { listeners = listeners.filter(l => l !== fn) }
}

/**
 * Compute artboard positions: horizontal row, left-aligned, GAP between each.
 */
export function layoutArtboards(): void {
  let x = 0
  for (const ab of artboards) {
    ab.x = x
    ab.y = 0
    x += ab.width + GAP
  }
}

/**
 * Compute the bounding box that contains all artboards (for viewBox).
 * Adds padding around the edges.
 */
export function computeDocumentBounds(padding = 10): { x: number; y: number; width: number; height: number } {
  if (artboards.length === 0) return { x: 0, y: 0, width: 210, height: 297 }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const ab of artboards) {
    minX = Math.min(minX, ab.x)
    minY = Math.min(minY, ab.y)
    maxX = Math.max(maxX, ab.x + ab.width)
    maxY = Math.max(maxY, ab.y + ab.height)
  }
  return {
    x: minX - padding,
    y: minY - padding,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
  }
}

/**
 * Find which artboard a document-space point falls within.
 */
export function artboardAtPoint(x: number, y: number): Artboard | null {
  for (const ab of artboards) {
    if (x >= ab.x && x <= ab.x + ab.width && y >= ab.y && y <= ab.y + ab.height) {
      return ab
    }
  }
  return null
}

/** Reset state (for testing) */
export function resetArtboards(): void {
  artboards = []
  activeId = null
  nextIndex = 1
  listeners = []
}
