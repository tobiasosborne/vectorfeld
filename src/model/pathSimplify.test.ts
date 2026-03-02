import { describe, it, expect } from 'vitest'
import { simplifyPath, pointsToPathD } from './pathSimplify'

describe('simplifyPath', () => {
  it('returns empty for empty input', () => {
    expect(simplifyPath([], 1)).toEqual([])
  })

  it('returns single point unchanged', () => {
    const pts = [{ x: 5, y: 10 }]
    expect(simplifyPath(pts, 1)).toEqual(pts)
  })

  it('returns two points unchanged', () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 10 }]
    expect(simplifyPath(pts, 1)).toEqual(pts)
  })

  it('removes collinear points', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 5, y: 5 },
      { x: 10, y: 10 },
    ]
    const result = simplifyPath(pts, 1)
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ x: 0, y: 0 })
    expect(result[1]).toEqual({ x: 10, y: 10 })
  })

  it('preserves corners', () => {
    // L-shaped path: right then down
    const pts = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ]
    const result = simplifyPath(pts, 1)
    expect(result).toHaveLength(3) // corner preserved
  })

  it('simplifies with epsilon threshold', () => {
    // Nearly straight line with small deviation
    const pts = [
      { x: 0, y: 0 },
      { x: 5, y: 0.3 },
      { x: 10, y: 0 },
    ]
    const loose = simplifyPath(pts, 0.5)
    expect(loose).toHaveLength(2) // point removed (deviation < epsilon)

    const tight = simplifyPath(pts, 0.1)
    expect(tight).toHaveLength(3) // point preserved (deviation > epsilon)
  })

  it('handles complex path', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 1, y: 0.1 }, // nearly collinear
      { x: 2, y: 0 },   // nearly collinear
      { x: 3, y: 0.1 }, // nearly collinear
      { x: 10, y: 0 },  // nearly collinear
      { x: 10, y: 10 }, // corner
      { x: 0, y: 10 },  // corner
    ]
    const result = simplifyPath(pts, 0.5)
    expect(result.length).toBeLessThan(pts.length)
    // First and last points always preserved
    expect(result[0]).toEqual(pts[0])
    expect(result[result.length - 1]).toEqual(pts[pts.length - 1])
  })
})

describe('pointsToPathD', () => {
  it('returns empty string for no points', () => {
    expect(pointsToPathD([])).toBe('')
  })

  it('builds M L path from points', () => {
    const pts = [{ x: 10, y: 20 }, { x: 30, y: 40 }, { x: 50, y: 60 }]
    expect(pointsToPathD(pts)).toBe('M10 20 L30 40 L50 60')
  })
})
