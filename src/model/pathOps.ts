/**
 * Path operations — parsing, splitting, and nearest-point computation for SVG paths.
 */

export interface PathCommand {
  type: 'M' | 'L' | 'C' | 'Z'
  points: Array<{ x: number; y: number }>
}

/** Parse an SVG path `d` attribute into structured commands */
export function parsePathD(d: string): PathCommand[] {
  const commands: PathCommand[] = []
  // Normalize: insert spaces before commands, split
  const normalized = d.replace(/([MLCZmlcz])/g, ' $1 ').trim()
  const tokens = normalized.split(/[\s,]+/).filter(Boolean)

  let i = 0
  let curX = 0, curY = 0

  while (i < tokens.length) {
    const cmd = tokens[i]
    i++
    if (cmd === 'M' || cmd === 'm') {
      const x = parseFloat(tokens[i++])
      const y = parseFloat(tokens[i++])
      const absX = cmd === 'm' ? curX + x : x
      const absY = cmd === 'm' ? curY + y : y
      commands.push({ type: 'M', points: [{ x: absX, y: absY }] })
      curX = absX; curY = absY
    } else if (cmd === 'L' || cmd === 'l') {
      const x = parseFloat(tokens[i++])
      const y = parseFloat(tokens[i++])
      const absX = cmd === 'l' ? curX + x : x
      const absY = cmd === 'l' ? curY + y : y
      commands.push({ type: 'L', points: [{ x: absX, y: absY }] })
      curX = absX; curY = absY
    } else if (cmd === 'C' || cmd === 'c') {
      const x1 = parseFloat(tokens[i++])
      const y1 = parseFloat(tokens[i++])
      const x2 = parseFloat(tokens[i++])
      const y2 = parseFloat(tokens[i++])
      const x = parseFloat(tokens[i++])
      const y = parseFloat(tokens[i++])
      if (cmd === 'c') {
        commands.push({ type: 'C', points: [
          { x: curX + x1, y: curY + y1 },
          { x: curX + x2, y: curY + y2 },
          { x: curX + x, y: curY + y },
        ]})
        curX += x; curY += y
      } else {
        commands.push({ type: 'C', points: [
          { x: x1, y: y1 }, { x: x2, y: y2 }, { x, y },
        ]})
        curX = x; curY = y
      }
    } else if (cmd === 'Z' || cmd === 'z') {
      commands.push({ type: 'Z', points: [] })
    }
  }
  return commands
}

/** Convert parsed commands back to SVG path `d` string */
export function commandsToD(commands: PathCommand[]): string {
  return commands.map(cmd => {
    if (cmd.type === 'M') return `M${cmd.points[0].x} ${cmd.points[0].y}`
    if (cmd.type === 'L') return `L${cmd.points[0].x} ${cmd.points[0].y}`
    if (cmd.type === 'C') return `C${cmd.points[0].x} ${cmd.points[0].y} ${cmd.points[1].x} ${cmd.points[1].y} ${cmd.points[2].x} ${cmd.points[2].y}`
    return 'Z'
  }).join(' ')
}

/** Get the "current point" before a given command index */
function currentPointBefore(commands: PathCommand[], index: number): { x: number; y: number } {
  for (let i = index - 1; i >= 0; i--) {
    const cmd = commands[i]
    if (cmd.points.length > 0) {
      return cmd.points[cmd.points.length - 1]
    }
  }
  return { x: 0, y: 0 }
}

/** Distance from point to line segment */
function pointToSegmentDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return Math.sqrt((px - ax) ** 2 + (py - ay) ** 2)
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))
  const projX = ax + t * dx, projY = ay + t * dy
  return Math.sqrt((px - projX) ** 2 + (py - projY) ** 2)
}

/** Find the nearest segment to a point. Returns segIndex (command index, starting from 1 for first L/C) */
export function nearestSegment(commands: PathCommand[], px: number, py: number): { segIndex: number; distance: number } {
  let bestIdx = -1
  let bestDist = Infinity

  for (let i = 1; i < commands.length; i++) {
    const cmd = commands[i]
    if (cmd.type === 'Z') continue
    const prev = currentPointBefore(commands, i)

    let dist: number
    if (cmd.type === 'L') {
      dist = pointToSegmentDist(px, py, prev.x, prev.y, cmd.points[0].x, cmd.points[0].y)
    } else if (cmd.type === 'C') {
      // Approximate: sample 10 points on the curve
      dist = Infinity
      for (let t = 0; t <= 1; t += 0.1) {
        const pt = deCasteljauPoint(prev, cmd.points[0], cmd.points[1], cmd.points[2], t)
        const d = Math.sqrt((px - pt.x) ** 2 + (py - pt.y) ** 2)
        dist = Math.min(dist, d)
      }
    } else {
      continue
    }
    if (dist < bestDist) {
      bestDist = dist
      bestIdx = i
    }
  }
  return { segIndex: bestIdx, distance: bestDist }
}

/** De Casteljau evaluation of cubic Bezier at parameter t */
function deCasteljauPoint(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  t: number
): { x: number; y: number } {
  const mt = 1 - t
  return {
    x: mt * mt * mt * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t * t * t * p3.x,
    y: mt * mt * mt * p0.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2.y + t * t * t * p3.y,
  }
}

/** De Casteljau subdivision: split cubic Bezier at t into two curves */
export function splitCubicAt(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  t: number
): {
  left: [typeof p0, typeof p0, typeof p0, typeof p0]
  right: [typeof p0, typeof p0, typeof p0, typeof p0]
} {
  const mt = 1 - t
  const a = { x: mt * p0.x + t * p1.x, y: mt * p0.y + t * p1.y }
  const b = { x: mt * p1.x + t * p2.x, y: mt * p1.y + t * p2.y }
  const c = { x: mt * p2.x + t * p3.x, y: mt * p2.y + t * p3.y }
  const d = { x: mt * a.x + t * b.x, y: mt * a.y + t * b.y }
  const e = { x: mt * b.x + t * c.x, y: mt * b.y + t * c.y }
  const f = { x: mt * d.x + t * e.x, y: mt * d.y + t * e.y }
  return {
    left: [p0, a, d, f],
    right: [f, e, c, p3],
  }
}

/**
 * Split a path at a given segment index, returning two sub-paths as `d` strings.
 * For L segments, splits at midpoint. For C segments, splits at t=0.5 via De Casteljau.
 */
export function splitPathAt(commands: PathCommand[], segIndex: number): [string, string] {
  const prev = currentPointBefore(commands, segIndex)
  const cmd = commands[segIndex]

  const before = commands.slice(0, segIndex)
  const after = commands.slice(segIndex + 1)

  if (cmd.type === 'L') {
    const end = cmd.points[0]
    const mid = { x: (prev.x + end.x) / 2, y: (prev.y + end.y) / 2 }
    const path1Cmds = [...before, { type: 'L' as const, points: [mid] }]
    const path2Cmds = [{ type: 'M' as const, points: [mid] }, { type: 'L' as const, points: [end] }, ...after]
    return [commandsToD(path1Cmds), commandsToD(path2Cmds)]
  }

  if (cmd.type === 'C') {
    const [cp1, cp2, end] = cmd.points
    const { left, right } = splitCubicAt(prev, cp1, cp2, end, 0.5)
    const path1Cmds = [...before, { type: 'C' as const, points: [left[1], left[2], left[3]] }]
    const path2Cmds = [
      { type: 'M' as const, points: [right[0]] },
      { type: 'C' as const, points: [right[1], right[2], right[3]] },
      ...after,
    ]
    return [commandsToD(path1Cmds), commandsToD(path2Cmds)]
  }

  // Fallback: return the whole path as-is
  return [commandsToD(commands), '']
}

// --- Path joining ---

function getLastPoint(cmds: PathCommand[]): { x: number; y: number } {
  for (let i = cmds.length - 1; i >= 0; i--) {
    if (cmds[i].points.length > 0) {
      const pts = cmds[i].points
      return pts[pts.length - 1]
    }
  }
  return { x: 0, y: 0 }
}

function ptDist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)
}

/** Reverse the direction of parsed path commands */
function reverseCommands(cmds: PathCommand[]): PathCommand[] {
  // Collect anchor points and segment info
  const points: Array<{ x: number; y: number }> = []
  const segTypes: Array<'L' | 'C'> = []
  const controlPoints: Array<{ cp1: { x: number; y: number }; cp2: { x: number; y: number } } | null> = []

  for (const cmd of cmds) {
    if (cmd.type === 'M') {
      points.push(cmd.points[0])
    } else if (cmd.type === 'L') {
      points.push(cmd.points[0])
      segTypes.push('L')
      controlPoints.push(null)
    } else if (cmd.type === 'C') {
      points.push(cmd.points[2])
      segTypes.push('C')
      controlPoints.push({ cp1: cmd.points[0], cp2: cmd.points[1] })
    }
  }

  const reversed: PathCommand[] = []
  reversed.push({ type: 'M', points: [points[points.length - 1]] })

  for (let i = segTypes.length - 1; i >= 0; i--) {
    if (segTypes[i] === 'L') {
      reversed.push({ type: 'L', points: [points[i]] })
    } else if (segTypes[i] === 'C') {
      const cp = controlPoints[i]!
      reversed.push({ type: 'C', points: [cp.cp2, cp.cp1, points[i]] })
    }
  }
  return reversed
}

/** Reverse the direction of a path d string */
export function reversePathD(d: string): string {
  return commandsToD(reverseCommands(parsePathD(d)))
}

/**
 * Join two path d strings by connecting them at their closest endpoints.
 * Auto-orients paths so the closest endpoints connect.
 * If endpoints within tolerance, no connecting L segment is added.
 */
export function joinPaths(d1: string, d2: string, tolerance = 1): string {
  const cmds1 = parsePathD(d1)
  const cmds2 = parsePathD(d2)
  if (cmds1.length === 0) return d2
  if (cmds2.length === 0) return d1

  const start1 = cmds1[0].points[0]
  const end1 = getLastPoint(cmds1)
  const start2 = cmds2[0].points[0]
  const end2 = getLastPoint(cmds2)

  // Find closest endpoint pair and orient accordingly
  const options = [
    { d: ptDist(end1, start2), rev1: false, rev2: false },
    { d: ptDist(end1, end2), rev1: false, rev2: true },
    { d: ptDist(start1, start2), rev1: true, rev2: false },
    { d: ptDist(start1, end2), rev1: true, rev2: true },
  ]
  options.sort((a, b) => a.d - b.d)
  const best = options[0]

  let final1 = best.rev1 ? reverseCommands(cmds1) : cmds1
  const final2 = best.rev2 ? reverseCommands(cmds2) : cmds2

  // Remove Z from end of first path
  if (final1.length > 0 && final1[final1.length - 1].type === 'Z') {
    final1 = final1.slice(0, -1)
  }

  // Remove M from start of second path
  const cmds2NoM = final2.slice(1)

  // Check if connection point is within tolerance
  const connEnd = getLastPoint(final1)
  const connStart = final2[0].points[0]
  const gap = ptDist(connEnd, connStart)

  if (gap > tolerance) {
    return commandsToD([...final1, { type: 'L', points: [connStart] }, ...cmds2NoM])
  }
  return commandsToD([...final1, ...cmds2NoM])
}

// --- Path scaling ---

/** Scale all points in a path `d` string relative to an anchor point */
export function scalePathD(
  d: string,
  sx: number,
  sy: number,
  anchorX: number,
  anchorY: number,
): string {
  const commands = parsePathD(d)
  for (const cmd of commands) {
    for (const pt of cmd.points) {
      pt.x = anchorX + (pt.x - anchorX) * sx
      pt.y = anchorY + (pt.y - anchorY) * sy
    }
  }
  return commandsToD(commands)
}
