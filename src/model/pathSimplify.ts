/**
 * Path simplification — reduce point count by removing nearly-collinear points.
 * Uses the Ramer-Douglas-Peucker algorithm.
 */

export interface Point {
  x: number
  y: number
}

/**
 * Simplify a polyline by removing points that are within `epsilon` distance
 * of the line between their neighbors (Ramer-Douglas-Peucker).
 */
export function simplifyPath(points: Point[], epsilon: number): Point[] {
  if (points.length <= 2) return [...points]

  // Find the point with the maximum distance from the line start->end
  const start = points[0]
  const end = points[points.length - 1]
  let maxDist = 0
  let maxIdx = 0

  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i], start, end)
    if (d > maxDist) {
      maxDist = d
      maxIdx = i
    }
  }

  if (maxDist > epsilon) {
    const left = simplifyPath(points.slice(0, maxIdx + 1), epsilon)
    const right = simplifyPath(points.slice(maxIdx), epsilon)
    return [...left.slice(0, -1), ...right]
  }
  return [start, end]
}

/** Perpendicular distance from point to line defined by lineStart-lineEnd */
function perpendicularDistance(point: Point, lineStart: Point, lineEnd: Point): number {
  const dx = lineEnd.x - lineStart.x
  const dy = lineEnd.y - lineStart.y
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) {
    // lineStart and lineEnd are the same point
    const px = point.x - lineStart.x
    const py = point.y - lineStart.y
    return Math.sqrt(px * px + py * py)
  }
  const area = Math.abs(dy * point.x - dx * point.y + lineEnd.x * lineStart.y - lineEnd.y * lineStart.x)
  return area / Math.sqrt(lenSq)
}

/** Build SVG path `d` string from points */
export function pointsToPathD(points: Point[]): string {
  if (points.length === 0) return ''
  let d = `M${points[0].x} ${points[0].y}`
  for (let i = 1; i < points.length; i++) {
    d += ` L${points[i].x} ${points[i].y}`
  }
  return d
}
