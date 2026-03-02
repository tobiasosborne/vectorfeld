/**
 * Wireframe/Outline view — toggle visual mode that shows only strokes.
 * Does NOT modify the document model — purely visual via injected <style>.
 */

let wireframeOn = false
let listeners: Array<() => void> = []

export function isWireframe(): boolean { return wireframeOn }

export function toggleWireframe(): void {
  wireframeOn = !wireframeOn
  listeners.forEach(fn => fn())
}

export function setWireframe(on: boolean): void {
  if (wireframeOn === on) return
  wireframeOn = on
  listeners.forEach(fn => fn())
}

export function subscribeWireframe(fn: () => void): () => void {
  listeners.push(fn)
  return () => { listeners = listeners.filter(l => l !== fn) }
}

// For testing
export function resetWireframe(): void {
  wireframeOn = false
  listeners = []
}

/** The CSS rules to inject into SVG for wireframe mode */
export const WIREFRAME_STYLE = `g[data-layer-name] * { fill: none !important; stroke: #333333 !important; stroke-width: 0.5 !important; stroke-opacity: 1 !important; opacity: 1 !important; }`
