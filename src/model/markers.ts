/**
 * Arrow marker definitions for SVG <defs>.
 * Provides preset markers and lazy creation via ensureMarkerDef().
 */

export type MarkerType = 'none' | 'triangle' | 'open' | 'reverse' | 'circle'

export const MARKER_TYPES: MarkerType[] = ['none', 'triangle', 'open', 'reverse', 'circle']

const MARKER_LABELS: Record<MarkerType, string> = {
  none: 'None',
  triangle: 'Triangle',
  open: 'Open Arrow',
  reverse: 'Reverse',
  circle: 'Circle',
}

export function getMarkerLabel(type: MarkerType): string {
  return MARKER_LABELS[type]
}

function markerId(type: MarkerType): string {
  return `vf-marker-${type}`
}

export function getMarkerUrl(type: MarkerType): string {
  if (type === 'none') return ''
  return `url(#${markerId(type)})`
}

/** Extract marker type from a marker attribute value like "url(#vf-marker-triangle)" */
export function parseMarkerType(value: string | null): MarkerType {
  if (!value) return 'none'
  const match = value.match(/url\(#vf-marker-(\w+)\)/)
  if (!match) return 'none'
  return (MARKER_TYPES.includes(match[1] as MarkerType) ? match[1] : 'none') as MarkerType
}

/** Ensure a marker definition exists in <defs>. Creates it if missing. */
export function ensureMarkerDef(defs: SVGDefsElement, type: MarkerType): void {
  if (type === 'none') return
  const id = markerId(type)
  if (defs.querySelector(`#${id}`)) return // already exists

  const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker')
  marker.setAttribute('id', id)
  marker.setAttribute('orient', 'auto')
  marker.setAttribute('markerUnits', 'strokeWidth')

  switch (type) {
    case 'triangle': {
      marker.setAttribute('viewBox', '0 0 10 10')
      marker.setAttribute('refX', '10')
      marker.setAttribute('refY', '5')
      marker.setAttribute('markerWidth', '6')
      marker.setAttribute('markerHeight', '6')
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      path.setAttribute('d', 'M 0 0 L 10 5 L 0 10 Z')
      path.setAttribute('fill', 'context-stroke')
      marker.appendChild(path)
      break
    }
    case 'open': {
      marker.setAttribute('viewBox', '0 0 10 10')
      marker.setAttribute('refX', '10')
      marker.setAttribute('refY', '5')
      marker.setAttribute('markerWidth', '6')
      marker.setAttribute('markerHeight', '6')
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      path.setAttribute('d', 'M 0 0 L 10 5 L 0 10')
      path.setAttribute('fill', 'none')
      path.setAttribute('stroke', 'context-stroke')
      path.setAttribute('stroke-width', '1.5')
      marker.appendChild(path)
      break
    }
    case 'reverse': {
      marker.setAttribute('viewBox', '0 0 10 10')
      marker.setAttribute('refX', '0')
      marker.setAttribute('refY', '5')
      marker.setAttribute('markerWidth', '6')
      marker.setAttribute('markerHeight', '6')
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      path.setAttribute('d', 'M 10 0 L 0 5 L 10 10 Z')
      path.setAttribute('fill', 'context-stroke')
      marker.appendChild(path)
      break
    }
    case 'circle': {
      marker.setAttribute('viewBox', '0 0 10 10')
      marker.setAttribute('refX', '5')
      marker.setAttribute('refY', '5')
      marker.setAttribute('markerWidth', '5')
      marker.setAttribute('markerHeight', '5')
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
      circle.setAttribute('cx', '5')
      circle.setAttribute('cy', '5')
      circle.setAttribute('r', '4')
      circle.setAttribute('fill', 'context-stroke')
      marker.appendChild(circle)
      break
    }
  }

  defs.appendChild(marker)
}
