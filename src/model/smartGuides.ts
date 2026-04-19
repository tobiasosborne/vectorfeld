/**
 * Smart guides — show alignment lines when dragging elements near other elements.
 * Snaps to edges and centers within a tolerance.
 */

import { transformedAABB } from './geometry'
import { getGuideCandidates } from './guides'

interface Candidates {
  x: number[]
  y: number[]
}

interface SnapResult {
  dx: number
  dy: number
  guides: Array<{ axis: 'x' | 'y'; value: number; min: number; max: number }>
}

export class SmartGuidesState {
  enabled = true
  guideGroup: SVGGElement | null = null
  cachedCandidates: Candidates | null = null

  reset(): void {
    this.enabled = true
    this.guideGroup = null
    this.cachedCandidates = null
  }
}

let active: SmartGuidesState = new SmartGuidesState()
export function setActiveSmartGuidesState(s: SmartGuidesState): void { active = s }
export function getActiveSmartGuidesState(): SmartGuidesState { return active }

export function setSmartGuidesEnabled(v: boolean): void { active.enabled = v }
export function getSmartGuidesEnabled(): boolean { return active.enabled }

export function setGuideGroup(g: SVGGElement): void { active.guideGroup = g }

/** Cache candidates at drag-start for performance (avoids getBBox per frame) */
export function cacheSmartGuideCandidates(svg: SVGSVGElement, exclude: Set<Element>): void {
  active.cachedCandidates = collectCandidates(svg, exclude)
}

/** Clear cached candidates when drag ends */
export function clearCachedCandidates(): void {
  active.cachedCandidates = null
}

/** Collect alignment candidates from all non-dragged elements, pre-split by axis. */
function collectCandidates(svg: SVGSVGElement, exclude: Set<Element>): Candidates {
  const x: number[] = []
  const y: number[] = []
  const layers = svg.querySelectorAll('g[data-layer-name]')
  for (const layer of layers) {
    if (layer.getAttribute('data-locked') === 'true') continue
    if ((layer as SVGElement).style.display === 'none') continue
    for (const child of layer.children) {
      if (exclude.has(child)) continue
      try {
        const bbox = (child as SVGGraphicsElement).getBBox()
        const transform = child.getAttribute('transform')
        const aabb = transformedAABB(bbox, transform)
        x.push(aabb.x, aabb.x + aabb.width / 2, aabb.x + aabb.width)
        y.push(aabb.y, aabb.y + aabb.height / 2, aabb.y + aabb.height)
      } catch { /* skip */ }
    }
  }
  for (const gc of getGuideCandidates()) {
    if (gc.axis === 'x') x.push(gc.value)
    else y.push(gc.value)
  }
  return { x, y }
}

/**
 * Check dragged elements against alignment candidates.
 * Returns snap corrections and guide line positions.
 */
export function computeSmartGuides(
  svg: SVGSVGElement,
  draggedElements: Element[],
  tolerance: number
): SnapResult {
  if (!active.enabled) return { dx: 0, dy: 0, guides: [] }

  // Use cached candidates if available (set at drag-start), else collect fresh
  const { x: xCandidates, y: yCandidates } = active.cachedCandidates ?? collectCandidates(svg, new Set(draggedElements))
  if (xCandidates.length === 0 && yCandidates.length === 0) return { dx: 0, dy: 0, guides: [] }

  // Get the AABB of dragged elements
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const el of draggedElements) {
    try {
      const bbox = (el as SVGGraphicsElement).getBBox()
      const transform = el.getAttribute('transform')
      const aabb = transformedAABB(bbox, transform)
      minX = Math.min(minX, aabb.x)
      minY = Math.min(minY, aabb.y)
      maxX = Math.max(maxX, aabb.x + aabb.width)
      maxY = Math.max(maxY, aabb.y + aabb.height)
    } catch { /* skip */ }
  }

  const draggedEdges = {
    x: [minX, (minX + maxX) / 2, maxX],
    y: [minY, (minY + maxY) / 2, maxY],
  }

  let bestDx = 0, bestDy = 0
  let bestDistX = tolerance + 1, bestDistY = tolerance + 1
  const guides: SnapResult['guides'] = []

  // Check X alignment
  for (const edge of draggedEdges.x) {
    for (const v of xCandidates) {
      const dist = Math.abs(edge - v)
      if (dist < tolerance && dist < bestDistX) {
        bestDistX = dist
        bestDx = v - edge
      }
    }
  }

  // Check Y alignment
  for (const edge of draggedEdges.y) {
    for (const v of yCandidates) {
      const dist = Math.abs(edge - v)
      if (dist < tolerance && dist < bestDistY) {
        bestDistY = dist
        bestDy = v - edge
      }
    }
  }

  // Collect all matching guide lines after snapping
  const vb = svg.viewBox.baseVal
  if (bestDistX <= tolerance) {
    for (const edge of draggedEdges.x) {
      const snappedEdge = edge + bestDx
      for (const v of xCandidates) {
        if (Math.abs(snappedEdge - v) < 0.01) {
          guides.push({ axis: 'x', value: v, min: vb.y, max: vb.y + vb.height })
        }
      }
    }
  }
  if (bestDistY <= tolerance) {
    for (const edge of draggedEdges.y) {
      const snappedEdge = edge + bestDy
      for (const v of yCandidates) {
        if (Math.abs(snappedEdge - v) < 0.01) {
          guides.push({ axis: 'y', value: v, min: vb.x, max: vb.x + vb.width })
        }
      }
    }
  }

  return { dx: bestDx, dy: bestDy, guides }
}

/** Render guide lines into the guide group */
export function renderGuides(svg: SVGSVGElement, guides: SnapResult['guides']): void {
  const g0 = active.guideGroup
  if (!g0) return
  while (g0.firstChild) g0.removeChild(g0.firstChild)

  const vb = svg.viewBox.baseVal
  const sw = vb.width > 0 && svg.clientWidth > 0
    ? (vb.width / svg.clientWidth) * 0.5
    : 0.3

  const seen = new Set<string>()
  for (const g of guides) {
    const key = `${g.axis}:${g.value.toFixed(2)}`
    if (seen.has(key)) continue
    seen.add(key)

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
    if (g.axis === 'x') {
      line.setAttribute('x1', String(g.value))
      line.setAttribute('y1', String(vb.y))
      line.setAttribute('x2', String(g.value))
      line.setAttribute('y2', String(vb.y + vb.height))
    } else {
      line.setAttribute('x1', String(vb.x))
      line.setAttribute('y1', String(g.value))
      line.setAttribute('x2', String(vb.x + vb.width))
      line.setAttribute('y2', String(g.value))
    }
    line.setAttribute('stroke', '#ff00ff')
    line.setAttribute('stroke-width', String(sw))
    line.setAttribute('stroke-dasharray', `${sw * 4} ${sw * 2}`)
    line.setAttribute('data-role', 'overlay')
    line.setAttribute('pointer-events', 'none')
    g0.appendChild(line)
  }
}

/** Clear all guide lines */
export function clearGuides(): void {
  const g0 = active.guideGroup
  if (!g0) return
  while (g0.firstChild) g0.removeChild(g0.firstChild)
}

// ---------------------------------------------------------------------------
// Point-based snapping (for line endpoint snapping, etc.)
// ---------------------------------------------------------------------------

export interface PointCandidate {
  x: number
  y: number
}

/** Collect snap point candidates (endpoints of lines and paths, corners/centers of all elements) */
export function collectPointCandidates(svg: SVGSVGElement, exclude: Set<Element>): PointCandidate[] {
  const points: PointCandidate[] = []
  const layers = svg.querySelectorAll('g[data-layer-name]')
  for (const layer of layers) {
    if (layer.getAttribute('data-locked') === 'true') continue
    if ((layer as SVGElement).style.display === 'none') continue
    for (const child of layer.children) {
      if (exclude.has(child)) continue
      const tag = child.tagName
      if (tag === 'line') {
        points.push({
          x: parseFloat(child.getAttribute('x1') || '0'),
          y: parseFloat(child.getAttribute('y1') || '0'),
        })
        points.push({
          x: parseFloat(child.getAttribute('x2') || '0'),
          y: parseFloat(child.getAttribute('y2') || '0'),
        })
      } else if (tag === 'path') {
        const d = child.getAttribute('d') || ''
        points.push(...getPathEndpoints(d))
      }
      // Also add AABB corners and center for all elements
      try {
        const bbox = (child as SVGGraphicsElement).getBBox()
        points.push({ x: bbox.x, y: bbox.y })
        points.push({ x: bbox.x + bbox.width, y: bbox.y })
        points.push({ x: bbox.x + bbox.width, y: bbox.y + bbox.height })
        points.push({ x: bbox.x, y: bbox.y + bbox.height })
        points.push({ x: bbox.x + bbox.width / 2, y: bbox.y + bbox.height / 2 })
      } catch { /* skip */ }
    }
  }
  return points
}

/** Find the nearest point candidate within tolerance (Euclidean distance) */
export function snapToNearestPoint(
  x: number, y: number,
  candidates: PointCandidate[],
  tolerance: number
): { x: number; y: number; snapped: boolean } {
  let bestDist = tolerance + 1
  let bestX = x, bestY = y
  for (const c of candidates) {
    const dist = Math.sqrt((x - c.x) ** 2 + (y - c.y) ** 2)
    if (dist < tolerance && dist < bestDist) {
      bestDist = dist
      bestX = c.x
      bestY = c.y
    }
  }
  return { x: bestX, y: bestY, snapped: bestDist <= tolerance }
}

function getPathEndpoints(d: string): PointCandidate[] {
  const points: PointCandidate[] = []
  // Get first M point
  const mMatch = d.match(/M\s*([-\d.]+)[\s,]+([-\d.]+)/)
  if (mMatch) {
    points.push({ x: parseFloat(mMatch[1]), y: parseFloat(mMatch[2]) })
  }
  // Get last coordinate pair (last point in the path)
  const coordPairs = [...d.matchAll(/([-\d.]+)[\s,]+([-\d.]+)/g)]
  if (coordPairs.length > 0) {
    const last = coordPairs[coordPairs.length - 1]
    const lx = parseFloat(last[1]), ly = parseFloat(last[2])
    // Avoid duplicating the first point
    if (points.length === 0 || points[0].x !== lx || points[0].y !== ly) {
      points.push({ x: lx, y: ly })
    }
  }
  return points
}
