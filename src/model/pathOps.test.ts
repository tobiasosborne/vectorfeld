import { describe, it, expect } from 'vitest'
import { parsePathD, commandsToD, nearestSegment, splitPathAt, splitCubicAt, intersectLineWithPath, splitPathAtT } from './pathOps'

describe('parsePathD', () => {
  it('parses M L L path', () => {
    const cmds = parsePathD('M10 20 L30 40 L50 60')
    expect(cmds).toHaveLength(3)
    expect(cmds[0]).toEqual({ type: 'M', points: [{ x: 10, y: 20 }] })
    expect(cmds[1]).toEqual({ type: 'L', points: [{ x: 30, y: 40 }] })
    expect(cmds[2]).toEqual({ type: 'L', points: [{ x: 50, y: 60 }] })
  })

  it('parses M C path', () => {
    const cmds = parsePathD('M0 0 C10 0 20 10 20 20')
    expect(cmds).toHaveLength(2)
    expect(cmds[1].type).toBe('C')
    expect(cmds[1].points).toHaveLength(3)
    expect(cmds[1].points[2]).toEqual({ x: 20, y: 20 })
  })

  it('parses Z command', () => {
    const cmds = parsePathD('M0 0 L10 0 L10 10 Z')
    expect(cmds).toHaveLength(4)
    expect(cmds[3].type).toBe('Z')
  })
})

describe('commandsToD', () => {
  it('reconstructs d string', () => {
    const cmds = parsePathD('M10 20 L30 40')
    const d = commandsToD(cmds)
    expect(d).toBe('M10 20 L30 40')
  })

  it('reconstructs C command', () => {
    const cmds = parsePathD('M0 0 C10 0 20 10 20 20')
    const d = commandsToD(cmds)
    expect(d).toBe('M0 0 C10 0 20 10 20 20')
  })
})

describe('nearestSegment', () => {
  it('finds nearest L segment', () => {
    const cmds = parsePathD('M0 0 L100 0 L100 100')
    // Point near the second segment (vertical line at x=100)
    const result = nearestSegment(cmds, 95, 50)
    expect(result.segIndex).toBe(2) // second L command
    expect(result.distance).toBeLessThan(10)
  })

  it('finds nearest first segment', () => {
    const cmds = parsePathD('M0 0 L100 0 L100 100')
    // Point near the first segment (horizontal line at y=0)
    const result = nearestSegment(cmds, 50, 2)
    expect(result.segIndex).toBe(1) // first L command
    expect(result.distance).toBeLessThan(5)
  })
})

describe('splitPathAt', () => {
  it('splits M L L at segment 1', () => {
    const cmds = parsePathD('M0 0 L100 0 L100 100')
    const [d1, d2] = splitPathAt(cmds, 1)
    // First path: M0 0 -> midpoint of first L (50, 0)
    expect(d1).toContain('M0 0')
    expect(d1).toContain('L50 0')
    // Second path: starts at midpoint, continues to L100 0 L100 100
    expect(d2).toContain('M50 0')
    expect(d2).toContain('L100 0')
  })

  it('splits M L L at segment 2', () => {
    const cmds = parsePathD('M0 0 L100 0 L100 100')
    const [d1, d2] = splitPathAt(cmds, 2)
    expect(d1).toContain('M0 0')
    expect(d1).toContain('L100 0')
    expect(d1).toContain('L100 50')
    expect(d2).toContain('M100 50')
    expect(d2).toContain('L100 100')
  })
})

describe('splitCubicAt', () => {
  it('splits at t=0.5 producing two valid curves', () => {
    const p0 = { x: 0, y: 0 }
    const p1 = { x: 10, y: 0 }
    const p2 = { x: 20, y: 10 }
    const p3 = { x: 20, y: 20 }
    const { left, right } = splitCubicAt(p0, p1, p2, p3, 0.5)
    // Left curve starts at p0
    expect(left[0]).toEqual(p0)
    // Right curve ends at p3
    expect(right[3]).toEqual(p3)
    // They share the midpoint
    expect(left[3].x).toBeCloseTo(right[0].x, 5)
    expect(left[3].y).toBeCloseTo(right[0].y, 5)
  })

  it('split at t=0 returns original as right', () => {
    const p0 = { x: 0, y: 0 }
    const p1 = { x: 10, y: 0 }
    const p2 = { x: 20, y: 10 }
    const p3 = { x: 20, y: 20 }
    const { left, right } = splitCubicAt(p0, p1, p2, p3, 0)
    expect(left[0]).toEqual(p0)
    expect(left[3]).toEqual(p0) // degenerate
    expect(right[0]).toEqual(p0)
    expect(right[3]).toEqual(p3)
  })
})

describe('intersectLineWithPath', () => {
  it('finds intersection with L segment', () => {
    // Horizontal line from (0,5) to (10,5) crossed by vertical cut from (5,0) to (5,10)
    const cmds = parsePathD('M0 5 L10 5')
    const hits = intersectLineWithPath(5, 0, 5, 10, cmds)
    expect(hits.length).toBe(1)
    expect(hits[0].segIndex).toBe(1)
    expect(Math.abs(hits[0].x - 5)).toBeLessThan(0.1)
    expect(Math.abs(hits[0].y - 5)).toBeLessThan(0.1)
  })

  it('finds no intersection when cut misses', () => {
    const cmds = parsePathD('M0 0 L10 0')
    const hits = intersectLineWithPath(5, 5, 5, 10, cmds)
    expect(hits.length).toBe(0)
  })

  it('finds multiple intersections on a rect path', () => {
    // Rect path: vertical cut crosses left and right sides
    const cmds = parsePathD('M0 0 L10 0 L10 10 L0 10 Z')
    const hits = intersectLineWithPath(5, -1, 5, 11, cmds)
    expect(hits.length).toBeGreaterThanOrEqual(2)
  })

  it('finds intersection with cubic Bezier', () => {
    // Curved path: C command, horizontal cut at y=10
    const cmds = parsePathD('M0 0 C5 20 15 20 20 0')
    const hits = intersectLineWithPath(-1, 10, 21, 10, cmds)
    // Cubic crosses y=10 twice (going up and coming down)
    expect(hits.length).toBe(2)
  })
})

describe('splitPathAtT', () => {
  it('splits L segment at t=0.5', () => {
    const cmds = parsePathD('M0 0 L10 0')
    const result = splitPathAtT(cmds, 1, 0.5)
    expect(result).not.toBeNull()
    const [d1, d2] = result!
    expect(d1).toContain('M0 0')
    expect(d1).toContain('5')
    expect(d2).toContain('10')
  })

  it('splits C segment at t=0.5', () => {
    const cmds = parsePathD('M0 0 C5 10 15 10 20 0')
    const result = splitPathAtT(cmds, 1, 0.5)
    expect(result).not.toBeNull()
    const [d1, d2] = result!
    expect(d1).toContain('M0 0')
    expect(d2).toContain('C')
  })

  it('returns null for non-splittable commands', () => {
    const cmds = parsePathD('M0 0 L10 0 Z')
    const result = splitPathAtT(cmds, 2, 0.5) // Z command
    expect(result).toBeNull()
  })
})
