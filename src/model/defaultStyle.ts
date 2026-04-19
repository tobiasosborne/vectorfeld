/**
 * Default style module — tracks the last-used stroke/fill/strokeWidth.
 * Drawing tools read from this instead of hardcoding values.
 *
 * Backed by a DefaultStyleState instance that is swappable per document
 * (see documentState.ts). The exported functions operate on the currently-
 * active instance; tests and single-document flows continue to work unchanged.
 */

export interface DefaultStyle {
  stroke: string
  fill: string
  strokeWidth: string
}

const INITIAL: DefaultStyle = {
  stroke: '#000000',
  fill: 'none',
  strokeWidth: '1',
}

export class DefaultStyleState {
  private current: DefaultStyle = { ...INITIAL }
  private listeners: Array<() => void> = []

  get(): DefaultStyle {
    return { ...this.current }
  }

  set(style: Partial<DefaultStyle>): void {
    this.current = { ...this.current, ...style }
    this.listeners.forEach((fn) => fn())
  }

  subscribe(fn: () => void): () => void {
    this.listeners.push(fn)
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn)
    }
  }

  reset(): void {
    this.current = { ...INITIAL }
    this.listeners.forEach((fn) => fn())
  }
}

let active: DefaultStyleState = new DefaultStyleState()

/** Swap the active state bundle. Used by documentState.ts when switching documents. */
export function setActiveDefaultStyleState(s: DefaultStyleState): void { active = s }
export function getActiveDefaultStyleState(): DefaultStyleState { return active }

export function getDefaultStyle(): DefaultStyle { return active.get() }
export function setDefaultStyle(style: Partial<DefaultStyle>): void { active.set(style) }
export function subscribeDefaultStyle(fn: () => void): () => void { return active.subscribe(fn) }
