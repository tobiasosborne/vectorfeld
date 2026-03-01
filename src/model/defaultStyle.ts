/**
 * Default style module — tracks the last-used stroke/fill/strokeWidth.
 * Drawing tools read from this instead of hardcoding values.
 * Follows the same pub-sub pattern as selection.ts.
 */

export interface DefaultStyle {
  stroke: string
  fill: string
  strokeWidth: string
}

let current: DefaultStyle = {
  stroke: '#000000',
  fill: 'none',
  strokeWidth: '1',
}

let listeners: Array<() => void> = []

function notify() {
  listeners.forEach((fn) => fn())
}

export function getDefaultStyle(): DefaultStyle {
  return { ...current }
}

export function setDefaultStyle(style: Partial<DefaultStyle>): void {
  current = { ...current, ...style }
  notify()
}

export function subscribeDefaultStyle(fn: () => void): () => void {
  listeners.push(fn)
  return () => {
    listeners = listeners.filter((l) => l !== fn)
  }
}
