import { describe, it, expect } from 'vitest'
import { parsePathD, commandsToD, nearestSegment, splitPathAt, splitCubicAt } from './pathOps'

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
