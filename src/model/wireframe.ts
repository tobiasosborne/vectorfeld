/**
 * Wireframe/Outline view — toggle visual mode that shows only strokes.
 * Does NOT modify the document model — purely visual via injected <style>.
 */

export class WireframeState {
  private on = false
  private listeners: Array<() => void> = []

  is(): boolean { return this.on }
  toggle(): void {
    this.on = !this.on
    this.listeners.forEach((fn) => fn())
  }
  setOn(on: boolean): void {
    if (this.on === on) return
    this.on = on
    this.listeners.forEach((fn) => fn())
  }
  subscribe(fn: () => void): () => void {
    this.listeners.push(fn)
    return () => { this.listeners = this.listeners.filter((l) => l !== fn) }
  }
  reset(): void {
    this.on = false
    this.listeners = []
  }
}

let active: WireframeState = new WireframeState()
export function setActiveWireframeState(s: WireframeState): void { active = s }
export function getActiveWireframeState(): WireframeState { return active }

export function isWireframe(): boolean { return active.is() }
export function toggleWireframe(): void { active.toggle() }
export function setWireframe(on: boolean): void { active.setOn(on) }
export function subscribeWireframe(fn: () => void): () => void { return active.subscribe(fn) }
export function resetWireframe(): void { active.reset() }

/** The CSS rules to inject into SVG for wireframe mode */
export const WIREFRAME_STYLE = `g[data-layer-name] * { fill: none !important; stroke: #333333 !important; stroke-width: 0.5 !important; stroke-opacity: 1 !important; opacity: 1 !important; }`
