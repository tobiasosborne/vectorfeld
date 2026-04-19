/**
 * User placement guides — horizontal and vertical guide lines at specific positions.
 * Integrates with smart guides for snap-to-guide behavior during drag.
 */

export interface Guide {
  id: string
  axis: 'h' | 'v'
  position: number // mm
}

export class GuidesState {
  private guides: Guide[] = []
  private nextId = 1
  private listeners: Array<() => void> = []

  private notify(): void {
    this.listeners.forEach((fn) => fn())
  }

  getAll(): Guide[] { return [...this.guides] }

  add(axis: 'h' | 'v', position: number): Guide {
    const guide: Guide = { id: `guide-${this.nextId++}`, axis, position }
    this.guides.push(guide)
    this.notify()
    return guide
  }

  remove(id: string): void {
    this.guides = this.guides.filter((g) => g.id !== id)
    this.notify()
  }

  clearAll(): void {
    this.guides = []
    this.notify()
  }

  subscribe(fn: () => void): () => void {
    this.listeners.push(fn)
    return () => { this.listeners = this.listeners.filter((l) => l !== fn) }
  }

  candidates(): Array<{ value: number; axis: 'x' | 'y' }> {
    return this.guides.map((g) => ({
      value: g.position,
      axis: g.axis === 'h' ? 'y' as const : 'x' as const,
    }))
  }

  reset(): void {
    this.guides = []
    this.nextId = 1
    this.listeners = []
  }
}

let active: GuidesState = new GuidesState()
export function setActiveGuidesState(s: GuidesState): void { active = s }
export function getActiveGuidesState(): GuidesState { return active }

export function getGuides(): Guide[] { return active.getAll() }
export function addGuide(axis: 'h' | 'v', position: number): Guide { return active.add(axis, position) }
export function removeGuide(id: string): void { active.remove(id) }
export function clearAllGuides(): void { active.clearAll() }
export function subscribeGuides(fn: () => void): () => void { return active.subscribe(fn) }
export function getGuideCandidates(): Array<{ value: number; axis: 'x' | 'y' }> { return active.candidates() }
export function resetGuides(): void { active.reset() }
