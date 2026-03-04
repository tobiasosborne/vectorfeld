import { describe, it, expect } from 'vitest'
import { pathBoolean } from './pathBooleans'

// Two overlapping 10x10 rects: rect1 at (0,0), rect2 at (5,5)
const rect1 = 'M0 0 L10 0 L10 10 L0 10 Z'
const rect2 = 'M5 5 L15 5 L15 15 L5 15 Z'

describe('pathBoolean', () => {
  it('unites two overlapping rects', async () => {
    const result = await pathBoolean(rect1, rect2, 'unite')
    expect(result.length).toBeGreaterThanOrEqual(1)
    // United path should exist and be non-empty
    expect(result[0].length).toBeGreaterThan(0)
    expect(result[0]).toContain('M')
  })

  it('subtracts rect from rect', async () => {
    const result = await pathBoolean(rect1, rect2, 'subtract')
    expect(result.length).toBeGreaterThanOrEqual(1)
    expect(result[0]).toContain('M')
  })

  it('intersects two rects', async () => {
    const result = await pathBoolean(rect1, rect2, 'intersect')
    expect(result.length).toBeGreaterThanOrEqual(1)
    // Intersection should produce a valid path
    expect(result[0]).toContain('M')
  })

  it('divides two rects into multiple parts', async () => {
    const result = await pathBoolean(rect1, rect2, 'divide')
    // Divide should produce multiple paths (the overlap region + non-overlapping parts)
    expect(result.length).toBeGreaterThanOrEqual(2)
    for (const d of result) {
      expect(d).toContain('M')
    }
  })
})
