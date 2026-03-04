import { describe, it, expect } from 'vitest'
import { pointInPolygon } from './lassoTool'

describe('pointInPolygon', () => {
  const square = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ]

  it('detects point inside square', () => {
    expect(pointInPolygon({ x: 5, y: 5 }, square)).toBe(true)
  })

  it('detects point outside square', () => {
    expect(pointInPolygon({ x: 15, y: 5 }, square)).toBe(false)
  })

  it('handles concave polygon', () => {
    const L = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 5 },
      { x: 5, y: 5 },
      { x: 5, y: 10 },
      { x: 0, y: 10 },
    ]
    expect(pointInPolygon({ x: 2, y: 8 }, L)).toBe(true)   // inside the L
    expect(pointInPolygon({ x: 8, y: 8 }, L)).toBe(false)  // outside the L (concave region)
  })

  it('handles triangle', () => {
    const tri = [
      { x: 5, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ]
    expect(pointInPolygon({ x: 5, y: 5 }, tri)).toBe(true)
    expect(pointInPolygon({ x: 0, y: 0 }, tri)).toBe(false)
  })
})
