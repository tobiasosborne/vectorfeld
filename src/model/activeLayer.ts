/**
 * Active layer tracking — which layer receives new elements.
 * Follows the pub-sub pattern from selection.ts.
 */

let activeLayerElement: Element | null = null
let listeners: Array<() => void> = []

function notify() {
  listeners.forEach((fn) => fn())
}

export function getActiveLayerElement(): Element | null {
  return activeLayerElement
}

export function setActiveLayerElement(el: Element | null): void {
  activeLayerElement = el
  notify()
}

export function subscribeActiveLayer(fn: () => void): () => void {
  listeners.push(fn)
  return () => {
    listeners = listeners.filter((l) => l !== fn)
  }
}
