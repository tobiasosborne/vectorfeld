/**
 * Color swatches — named color palette with localStorage persistence.
 */

export interface Swatch {
  id: string
  name: string
  color: string
}

const STORAGE_KEY = 'vectorfeld-swatches'
const DEFAULT_SWATCHES: Swatch[] = [
  { id: 'sw-1', name: 'Black', color: '#000000' },
  { id: 'sw-2', name: 'White', color: '#ffffff' },
  { id: 'sw-3', name: 'Red', color: '#ef4444' },
  { id: 'sw-4', name: 'Blue', color: '#3b82f6' },
  { id: 'sw-5', name: 'Green', color: '#22c55e' },
  { id: 'sw-6', name: 'Yellow', color: '#eab308' },
  { id: 'sw-7', name: 'Purple', color: '#a855f7' },
  { id: 'sw-8', name: 'Orange', color: '#f97316' },
]

let swatches: Swatch[] = loadSwatches()
let nextId = swatches.length + 1
let listeners: Array<() => void> = []

function loadSwatches(): Swatch[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) return JSON.parse(stored)
  } catch { /* ignore */ }
  return [...DEFAULT_SWATCHES]
}

function saveSwatches(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(swatches))
  } catch { /* ignore */ }
}

export function getSwatches(): Swatch[] { return [...swatches] }

export function addSwatch(name: string, color: string): Swatch {
  const swatch: Swatch = { id: `sw-${nextId++}`, name, color }
  swatches.push(swatch)
  saveSwatches()
  notify()
  return swatch
}

export function removeSwatch(id: string): void {
  swatches = swatches.filter(s => s.id !== id)
  saveSwatches()
  notify()
}

export function subscribeSwatches(fn: () => void): () => void {
  listeners.push(fn)
  return () => { listeners = listeners.filter(l => l !== fn) }
}

function notify(): void {
  listeners.forEach(fn => fn())
}

// For testing
export function resetSwatches(): void {
  swatches = [...DEFAULT_SWATCHES]
  nextId = swatches.length + 1
  listeners = []
  try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
}
