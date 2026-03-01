/**
 * Gradient management — create/update linear and radial gradients in <defs>.
 */

import { generateId } from './document'

export type FillType = 'none' | 'solid' | 'linear' | 'radial'

export interface LinearGradientDef {
  type: 'linear'
  id: string
  color1: string
  color2: string
  angle: number // degrees
}

export interface RadialGradientDef {
  type: 'radial'
  id: string
  color1: string
  color2: string
  cx: number  // 0-1 fraction
  cy: number  // 0-1 fraction
  r: number   // 0-1 fraction
}

export type GradientDef = LinearGradientDef | RadialGradientDef

/** Detect the fill type of an element */
export function detectFillType(el: Element): FillType {
  const fill = el.getAttribute('fill') || 'none'
  if (fill === 'none') return 'none'
  if (fill.startsWith('url(#')) {
    // Check if the referenced element is a linearGradient or radialGradient
    const id = fill.slice(5, -1)
    const svg = el.closest('svg')
    if (svg) {
      const ref = svg.querySelector(`#${CSS.escape(id)}`)
      if (ref?.tagName === 'linearGradient') return 'linear'
      if (ref?.tagName === 'radialGradient') return 'radial'
    }
    return 'solid'
  }
  return 'solid'
}

/** Create a linear gradient in <defs> and return its URL reference */
export function createLinearGradient(
  defs: SVGDefsElement,
  color1: string,
  color2: string,
  angle: number
): string {
  const id = generateId()
  const grad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient')
  grad.setAttribute('id', id)

  // Convert angle to x1/y1/x2/y2
  const rad = (angle * Math.PI) / 180
  const x1 = 0.5 - Math.cos(rad) * 0.5
  const y1 = 0.5 - Math.sin(rad) * 0.5
  const x2 = 0.5 + Math.cos(rad) * 0.5
  const y2 = 0.5 + Math.sin(rad) * 0.5
  grad.setAttribute('x1', String(x1))
  grad.setAttribute('y1', String(y1))
  grad.setAttribute('x2', String(x2))
  grad.setAttribute('y2', String(y2))
  grad.setAttribute('gradientUnits', 'objectBoundingBox')

  const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop')
  stop1.setAttribute('offset', '0%')
  stop1.setAttribute('stop-color', color1)
  grad.appendChild(stop1)

  const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop')
  stop2.setAttribute('offset', '100%')
  stop2.setAttribute('stop-color', color2)
  grad.appendChild(stop2)

  defs.appendChild(grad)
  return `url(#${id})`
}

/** Create a radial gradient in <defs> and return its URL reference */
export function createRadialGradient(
  defs: SVGDefsElement,
  color1: string,
  color2: string,
  cx: number = 0.5,
  cy: number = 0.5,
  r: number = 0.5
): string {
  const id = generateId()
  const grad = document.createElementNS('http://www.w3.org/2000/svg', 'radialGradient')
  grad.setAttribute('id', id)
  grad.setAttribute('cx', String(cx))
  grad.setAttribute('cy', String(cy))
  grad.setAttribute('r', String(r))
  grad.setAttribute('gradientUnits', 'objectBoundingBox')

  const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop')
  stop1.setAttribute('offset', '0%')
  stop1.setAttribute('stop-color', color1)
  grad.appendChild(stop1)

  const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop')
  stop2.setAttribute('offset', '100%')
  stop2.setAttribute('stop-color', color2)
  grad.appendChild(stop2)

  defs.appendChild(grad)
  return `url(#${id})`
}

/** Update an existing gradient's stop colors in-place. Returns true if updated. */
export function updateGradientColors(el: Element, color1: string, color2: string): boolean {
  const fill = el.getAttribute('fill') || ''
  if (!fill.startsWith('url(#')) return false
  const id = fill.slice(5, -1)
  const svg = el.closest('svg')
  if (!svg) return false
  const grad = svg.querySelector(`#${CSS.escape(id)}`)
  if (!grad) return false
  const stops = grad.querySelectorAll('stop')
  if (stops.length < 2) return false
  stops[0].setAttribute('stop-color', color1)
  stops[1].setAttribute('stop-color', color2)
  return true
}

/** Parse gradient stop colors from a gradient element referenced by fill */
export function parseGradientColors(el: Element): { color1: string; color2: string } | null {
  const fill = el.getAttribute('fill') || ''
  if (!fill.startsWith('url(#')) return null
  const id = fill.slice(5, -1)
  const svg = el.closest('svg')
  if (!svg) return null
  const grad = svg.querySelector(`#${CSS.escape(id)}`)
  if (!grad) return null
  const stops = grad.querySelectorAll('stop')
  if (stops.length < 2) return null
  return {
    color1: stops[0].getAttribute('stop-color') || '#000000',
    color2: stops[1].getAttribute('stop-color') || '#ffffff',
  }
}
