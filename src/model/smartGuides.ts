/**
 * Smart guides — show alignment lines when dragging elements near other elements.
 * Snaps to edges and centers within a tolerance.
 */

import { transformedAABB } from './geometry'

interface AlignCandidate {
  value: number
  axis: 'x' | 'y'
}

interface SnapResult {
  dx: number
  dy: number
  guides: Array<{ axis: 'x' | 'y'; value: number; min: number; max: number }>
}

let enabled = true
let guideGroup: SVGGElement | null = null
let cachedCandidates: AlignCandidate[] | null = null

export function setSmartGuidesEnabled(v: boolean): void { enabled = v }
export function getSmartGuidesEnabled(): boolean { return enabled }

export function setGuideGroup(g: SVGGElement): void { guideGroup = g }

/** Cache candidates at drag-start for performance (avoids getBBox per frame) */
export function cacheSmartGuideCandidates(svg: SVGSVGElement, exclude: Set<Element>): void {
  cachedCandidates = collectCandidates(svg, exclude)
}

/** Clear cached candidates when drag ends */
export function clearCachedCandidates(): void {
  cachedCandidates = null
}

/** Collect alignment candidates from all non-dragged elements */
function collectCandidates(svg: SVGSVGElement, exclude: Set<Element>): AlignCandidate[] {
  const candidates: AlignCandidate[] = []
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
        // Left, center, right
        candidates.push({ value: aabb.x, axis: 'x' })
        candidates.push({ value: aabb.x + aabb.width / 2, axis: 'x' })
        candidates.push({ value: aabb.x + aabb.width, axis: 'x' })
        // Top, center, bottom
        candidates.push({ value: aabb.y, axis: 'y' })
        candidates.push({ value: aabb.y + aabb.height / 2, axis: 'y' })
        candidates.push({ value: aabb.y + aabb.height, axis: 'y' })
      } catch { /* skip */ }
    }
  }
  return candidates
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
  if (!enabled) return { dx: 0, dy: 0, guides: [] }

  // Use cached candidates if available (set at drag-start), else collect fresh
  const candidates = cachedCandidates ?? collectCandidates(svg, new Set(draggedElements))
  if (candidates.length === 0) return { dx: 0, dy: 0, guides: [] }

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
    for (const c of candidates) {
      if (c.axis !== 'x') continue
      const dist = Math.abs(edge - c.value)
      if (dist < tolerance && dist < bestDistX) {
        bestDistX = dist
        bestDx = c.value - edge
      }
    }
  }

  // Check Y alignment
  for (const edge of draggedEdges.y) {
    for (const c of candidates) {
      if (c.axis !== 'y') continue
      const dist = Math.abs(edge - c.value)
      if (dist < tolerance && dist < bestDistY) {
        bestDistY = dist
        bestDy = c.value - edge
      }
    }
  }

  // Collect all matching guide lines after snapping
  const vb = svg.viewBox.baseVal
  if (bestDistX <= tolerance) {
    for (const edge of draggedEdges.x) {
      const snappedEdge = edge + bestDx
      for (const c of candidates) {
        if (c.axis !== 'x') continue
        if (Math.abs(snappedEdge - c.value) < 0.01) {
          guides.push({ axis: 'x', value: c.value, min: vb.y, max: vb.y + vb.height })
        }
      }
    }
  }
  if (bestDistY <= tolerance) {
    for (const edge of draggedEdges.y) {
      const snappedEdge = edge + bestDy
      for (const c of candidates) {
        if (c.axis !== 'y') continue
        if (Math.abs(snappedEdge - c.value) < 0.01) {
          guides.push({ axis: 'y', value: c.value, min: vb.x, max: vb.x + vb.width })
        }
      }
    }
  }

  return { dx: bestDx, dy: bestDy, guides }
}

/** Render guide lines into the guide group */
export function renderGuides(svg: SVGSVGElement, guides: SnapResult['guides']): void {
  if (!guideGroup) return
  while (guideGroup.firstChild) guideGroup.removeChild(guideGroup.firstChild)

  const vb = svg.viewBox.baseVal
  const sw = vb.width > 0 && svg.clientWidth > 0
    ? (vb.width / svg.clientWidth) * 0.5
    : 0.3

  // Deduplicate guides by axis+value
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
    guideGroup.appendChild(line)
  }
}

/** Clear all guide lines */
export function clearGuides(): void {
  if (!guideGroup) return
  while (guideGroup.firstChild) guideGroup.removeChild(guideGroup.firstChild)
}
