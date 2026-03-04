import { describe, it, expect } from 'vitest'
import { offsetPathD } from './offsetPath'
import { parsePathD } from './pathOps'

describe('offsetPathD', () => {
  it('offsets a square outward', () => {
    const square = 'M0 0 L10 0 L10 10 L0 10 Z'
    const result = offsetPathD(square, 2)
    expect(result).toContain('M')
    // Offset square should be larger — parse and check bounds
    const cmds = parsePathD(result)
    const xs = cmds.flatMap(c => c.points.map(p => p.x))
    const ys = cmds.flatMap(c => c.points.map(p => p.y))
    expect(Math.min(...xs)).toBeLessThan(0)  // expanded leftward
    expect(Math.max(...xs)).toBeGreaterThan(10)  // expanded rightward
    expect(Math.min(...ys)).toBeLessThan(0)
    expect(Math.max(...ys)).toBeGreaterThan(10)
  })

  it('offsets a square inward (negative distance)', () => {
    const square = 'M0 0 L10 0 L10 10 L0 10 Z'
    const outward = offsetPathD(square, 2)
    const inward = offsetPathD(square, -1)
    // Inward offset should produce a different (smaller) path than outward
    expect(inward).not.toBe(outward)
    // Both should be valid paths
    expect(parsePathD(inward).length).toBeGreaterThan(0)
    expect(parsePathD(outward).length).toBeGreaterThan(0)
  })

  it('returns original path for zero distance', () => {
    const line = 'M0 0 L10 10'
    expect(offsetPathD(line, 0)).toBe(line)
  })

  it('offsets a circle-like path', () => {
    // Quarter arc approximation
    const path = 'M10 0 C10 5.5 5.5 10 0 10'
    const result = offsetPathD(path, 2)
    expect(result.length).toBeGreaterThan(0)
    expect(result).toContain('C')
  })

  it('handles open paths', () => {
    const line = 'M0 0 L10 0 L10 10'
    const result = offsetPathD(line, 1)
    // Should produce a valid path
    expect(result).toContain('M')
    const cmds = parsePathD(result)
    expect(cmds.length).toBeGreaterThanOrEqual(2)
  })
})
