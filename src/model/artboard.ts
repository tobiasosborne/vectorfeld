/**
 * Multiple artboard management.
 *
 * Each artboard is a positioned rectangular region with its own dimensions.
 * Artboards are laid out horizontally with a configurable gap.
 * One artboard is "active" at any time — new elements go to its layers.
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

export class ArtboardState {
  private artboards: Artboard[] = []
  private activeId: string | null = null
  private listeners: Array<() => void> = []
  private nextIndex = 1

  private notify(): void { this.listeners.forEach((fn) => fn()) }

  getAll(): Artboard[] { return [...this.artboards] }

  getActive(): Artboard | null {
    return this.artboards.find((a) => a.id === this.activeId) ?? this.artboards[0] ?? null
  }

  setActive(id: string): void {
    if (this.artboards.some((a) => a.id === id)) {
      this.activeId = id
      this.notify()
    }
  }

  add(width = 210, height = 297, name?: string): Artboard {
    const id = `ab-${this.nextIndex++}`
    const ab: Artboard = {
      id,
      name: name ?? `Artboard ${this.artboards.length + 1}`,
      x: 0,
      y: 0,
      width,
      height,
    }
    this.artboards.push(ab)
    this.layout()
    if (!this.activeId) this.activeId = id
    this.notify()
    return ab
  }

  remove(id: string): void {
    this.artboards = this.artboards.filter((a) => a.id !== id)
    if (this.activeId === id) this.activeId = this.artboards[0]?.id ?? null
    this.layout()
    this.notify()
  }

  update(id: string, update: Partial<Pick<Artboard, 'name' | 'width' | 'height'>>): void {
    const ab = this.artboards.find((a) => a.id === id)
    if (!ab) return
    if (update.name !== undefined) ab.name = update.name
    if (update.width !== undefined) ab.width = update.width
    if (update.height !== undefined) ab.height = update.height
    this.layout()
    this.notify()
  }

  subscribe(fn: () => void): () => void {
    this.listeners.push(fn)
    return () => { this.listeners = this.listeners.filter((l) => l !== fn) }
  }

  layout(): void {
    let x = 0
    for (const ab of this.artboards) {
      ab.x = x
      ab.y = 0
      x += ab.width + GAP
    }
  }

  bounds(padding = 10): { x: number; y: number; width: number; height: number } {
    if (this.artboards.length === 0) return { x: 0, y: 0, width: 210, height: 297 }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const ab of this.artboards) {
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

  atPoint(x: number, y: number): Artboard | null {
    for (const ab of this.artboards) {
      if (x >= ab.x && x <= ab.x + ab.width && y >= ab.y && y <= ab.y + ab.height) return ab
    }
    return null
  }

  reset(): void {
    this.artboards = []
    this.activeId = null
    this.nextIndex = 1
    this.listeners = []
  }
}

let active: ArtboardState = new ArtboardState()
export function setActiveArtboardState(s: ArtboardState): void { active = s }
export function getActiveArtboardState(): ArtboardState { return active }

export function getArtboards(): Artboard[] { return active.getAll() }
export function getActiveArtboard(): Artboard | null { return active.getActive() }
export function setActiveArtboard(id: string): void { active.setActive(id) }
export function addArtboard(width = 210, height = 297, name?: string): Artboard { return active.add(width, height, name) }
export function removeArtboard(id: string): void { active.remove(id) }
export function updateArtboard(id: string, update: Partial<Pick<Artboard, 'name' | 'width' | 'height'>>): void { active.update(id, update) }
export function subscribeArtboards(fn: () => void): () => void { return active.subscribe(fn) }
export function layoutArtboards(): void { active.layout() }
export function computeDocumentBounds(padding = 10) { return active.bounds(padding) }
export function artboardAtPoint(x: number, y: number): Artboard | null { return active.atPoint(x, y) }
export function resetArtboards(): void { active.reset() }
