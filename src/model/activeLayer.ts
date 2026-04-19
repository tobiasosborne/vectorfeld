/**
 * Active layer tracking — which layer receives new elements.
 */

export class ActiveLayerState {
  private element: Element | null = null
  private listeners: Array<() => void> = []

  get(): Element | null { return this.element }
  set(el: Element | null): void {
    this.element = el
    this.listeners.forEach((fn) => fn())
  }
  subscribe(fn: () => void): () => void {
    this.listeners.push(fn)
    return () => { this.listeners = this.listeners.filter((l) => l !== fn) }
  }
  reset(): void {
    this.element = null
    this.listeners = []
  }
}

let active: ActiveLayerState = new ActiveLayerState()
export function setActiveActiveLayerState(s: ActiveLayerState): void { active = s }
export function getActiveActiveLayerState(): ActiveLayerState { return active }

export function getActiveLayerElement(): Element | null { return active.get() }
export function setActiveLayerElement(el: Element | null): void { active.set(el) }
export function subscribeActiveLayer(fn: () => void): () => void { return active.subscribe(fn) }
