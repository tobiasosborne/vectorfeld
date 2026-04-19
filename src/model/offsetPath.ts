/**
 * Offset path — expand or contract a path by a uniform distance.
 *
 * Algorithm: sample the path densely, compute outward normals at each point,
 * offset along normals, then fit cubic Béziers back through the offset points.
 *
 * Positive distance = outward, negative = inward.
 */

import { parsePathD, commandsToD, type PathCommand } from './pathOps'

type Pt = { x: number; y: number }

// ── Sampling ───────────────────────────────────────────────────────────

/** Evaluate a cubic Bézier at parameter t */
function cubicPt(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const u = 1 - t
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  }
}

/**
 * Sample the path into a polyline with outward normals.
 * Returns arrays of { point, normal } for each subpath.
 */
function samplePath(
  cmds: PathCommand[],
  samplesPerSegment = 32
): Array<{ pts: Pt[]; normals: Pt[]; closed: boolean }> {
  const subpaths: Array<{ pts: Pt[]; normals: Pt[]; closed: boolean }> = []
  let pts: Pt[] = []
  let cur: Pt = { x: 0, y: 0 }
  let subpathStart: Pt = { x: 0, y: 0 }

  const flush = (closed: boolean) => {
    if (pts.length < 2) return
    const normals = computeNormals(pts, closed)
    subpaths.push({ pts, normals, closed })
    pts = []
  }

  for (const cmd of cmds) {
    if (cmd.type === 'M') {
      flush(false)
      cur = cmd.points[0]
      subpathStart = cur
      pts.push(cur)
    } else if (cmd.type === 'L') {
      const end = cmd.points[0]
      // Just add the endpoint; the segment is a straight line
      pts.push(end)
      cur = end
    } else if (cmd.type === 'C') {
      const [cp1, cp2, end] = cmd.points
      for (let i = 1; i <= samplesPerSegment; i++) {
        pts.push(cubicPt(cur, cp1, cp2, end, i / samplesPerSegment))
      }
      cur = end
    } else if (cmd.type === 'Z') {
      if (dist(cur, subpathStart) > 1e-6) pts.push(subpathStart)
      flush(true)
      cur = subpathStart
    }
  }
  flush(false)
  return subpaths
}

// ── Normals ────────────────────────────────────────────────────────────

function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function normalize(v: Pt): Pt {
  const len = Math.hypot(v.x, v.y)
  return len > 1e-10 ? { x: v.x / len, y: v.y / len } : { x: 0, y: -1 }
}

/** Compute outward normals at each sample point (left-hand normal of tangent). */
function computeNormals(pts: Pt[], closed: boolean): Pt[] {
  const n = pts.length
  const normals: Pt[] = []

  for (let i = 0; i < n; i++) {
    const prev = closed ? pts[(i - 1 + n) % n] : pts[Math.max(0, i - 1)]
    const next = closed ? pts[(i + 1) % n] : pts[Math.min(n - 1, i + 1)]
    const tangent = normalize({ x: next.x - prev.x, y: next.y - prev.y })
    // Left-hand normal: rotate tangent -90°
    normals.push({ x: -tangent.y, y: tangent.x })
  }
  return normals
}

// ── Offset ─────────────────────────────────────────────────────────────

function offsetPoints(pts: Pt[], normals: Pt[], distance: number): Pt[] {
  return pts.map((p, i) => ({
    x: p.x + normals[i].x * distance,
    y: p.y + normals[i].y * distance,
  }))
}

// ── Cubic Bézier fitting ───────────────────────────────────────────────

/**
 * Fit a sequence of cubic Béziers through a polyline.
 * Uses the Catmull–Rom → Bézier conversion for smooth C¹ continuity.
 */
function fitCubics(pts: Pt[], closed: boolean): PathCommand[] {
  const n = pts.length
  if (n < 2) return []
  if (n === 2) {
    return [
      { type: 'M', points: [pts[0]] },
      { type: 'L', points: [pts[1]] },
    ]
  }

  const cmds: PathCommand[] = [{ type: 'M', points: [pts[0]] }]
  const tau = 1 / 3 // Catmull–Rom tension → Bézier control point ratio

  for (let i = 0; i < n - 1; i++) {
    const p0 = closed ? pts[(i - 1 + n) % n] : pts[Math.max(0, i - 1)]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = closed ? pts[(i + 2) % n] : pts[Math.min(n - 1, i + 2)]

    const cp1: Pt = {
      x: p1.x + tau * (p2.x - p0.x),
      y: p1.y + tau * (p2.y - p0.y),
    }
    const cp2: Pt = {
      x: p2.x - tau * (p3.x - p1.x),
      y: p2.y - tau * (p3.y - p1.y),
    }
    cmds.push({ type: 'C', points: [cp1, cp2, p2] })
  }

  if (closed) cmds.push({ type: 'Z', points: [] })
  return cmds
}

// ── Simplification ─────────────────────────────────────────────────────

/** Ramer–Douglas–Peucker simplification to reduce point count. */
function simplify(pts: Pt[], epsilon: number): Pt[] {
  if (pts.length <= 2) return pts

  let maxDist = 0
  let maxIdx = 0
  const first = pts[0]
  const last = pts[pts.length - 1]

  for (let i = 1; i < pts.length - 1; i++) {
    const d = pointToLineDist(pts[i], first, last)
    if (d > maxDist) {
      maxDist = d
      maxIdx = i
    }
  }

  if (maxDist > epsilon) {
    const left = simplify(pts.slice(0, maxIdx + 1), epsilon)
    const right = simplify(pts.slice(maxIdx), epsilon)
    return [...left.slice(0, -1), ...right]
  }
  return [first, last]
}

function pointToLineDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  if (lenSq < 1e-10) return dist(p, a)
  const cross = Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx)
  return cross / Math.sqrt(lenSq)
}

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Offset a path by a given distance.
 * Positive = outward (left of path direction), negative = inward.
 *
 * @param d - SVG path d string
 * @param distance - offset distance in document units (mm)
 * @param simplifyEpsilon - RDP tolerance for point reduction (default 0.1)
 * @returns offset path d string
 */
export function offsetPathD(d: string, distance: number, simplifyEpsilon = 0.1): string {
  if (Math.abs(distance) < 1e-6) return d

  const cmds = parsePathD(d)
  const subpaths = samplePath(cmds)
  const resultParts: string[] = []

  for (const { pts, normals, closed } of subpaths) {
    const offset = offsetPoints(pts, normals, distance)
    const simplified = simplify(offset, simplifyEpsilon)
    const fitted = fitCubics(simplified, closed)
    if (fitted.length > 0) resultParts.push(commandsToD(fitted))
  }

  return resultParts.join(' ')
}
