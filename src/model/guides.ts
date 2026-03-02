/**
 * User placement guides — horizontal and vertical guide lines at specific positions.
 * Integrates with smart guides for snap-to-guide behavior during drag.
 */

export interface Guide {
  id: string
  axis: 'h' | 'v'
  position: number // mm
}

let guides: Guide[] = []
let nextId = 1
let listeners: Array<() => void> = []

export function getGuides(): Guide[] { return [...guides] }

export function addGuide(axis: 'h' | 'v', position: number): Guide {
  const guide: Guide = { id: `guide-${nextId++}`, axis, position }
  guides.push(guide)
  notify()
  return guide
}

export function removeGuide(id: string): void {
  guides = guides.filter(g => g.id !== id)
  notify()
}

export function clearAllGuides(): void {
  guides = []
  notify()
}

export function subscribeGuides(fn: () => void): () => void {
  listeners.push(fn)
  return () => { listeners = listeners.filter(l => l !== fn) }
}

function notify(): void {
  listeners.forEach(fn => fn())
}

/** Get guide positions as smart guide alignment candidates */
export function getGuideCandidates(): Array<{ value: number; axis: 'x' | 'y' }> {
  return guides.map(g => ({
    value: g.position,
    axis: g.axis === 'h' ? 'y' as const : 'x' as const,
  }))
}

// For testing
export function resetGuides(): void {
  guides = []
  nextId = 1
  listeners = []
}
