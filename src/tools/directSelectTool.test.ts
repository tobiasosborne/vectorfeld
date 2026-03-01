import { describe, it, expect } from 'vitest'
import { parsePathAnchors, updatePathAnchor } from './directSelectTool'

describe('Direct Selection Tool', () => {
  describe('parsePathAnchors', () => {
    it('parses M command', () => {
      const anchors = parsePathAnchors('M 10 20')
      expect(anchors).toEqual([{ x: 10, y: 20 }])
    })

    it('parses M L commands', () => {
      const anchors = parsePathAnchors('M 10 20 L 30 40 L 50 60')
      expect(anchors).toEqual([
        { x: 10, y: 20 },
        { x: 30, y: 40 },
        { x: 50, y: 60 },
      ])
    })

    it('parses M L Z (closed path)', () => {
      const anchors = parsePathAnchors('M 0 0 L 10 0 L 10 10 Z')
      expect(anchors).toEqual([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ])
    })

    it('parses C command (extracts endpoints only)', () => {
      const anchors = parsePathAnchors('M 0 0 C 5 0 5 10 10 10')
      expect(anchors).toEqual([
        { x: 0, y: 0 },
        { x: 10, y: 10 },
      ])
    })

    it('parses mixed L and C commands', () => {
      const anchors = parsePathAnchors('M 0 0 L 10 0 C 15 5 15 5 20 10')
      expect(anchors).toEqual([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 20, y: 10 },
      ])
    })

    it('handles empty path', () => {
      expect(parsePathAnchors('')).toEqual([])
    })
  })

  describe('updatePathAnchor', () => {
    it('updates M command anchor', () => {
      const result = updatePathAnchor('M 10 20 L 30 40', 0, { x: 15, y: 25 })
      expect(result).toContain('M 15 25')
      expect(result).toContain('L 30 40')
    })

    it('updates L command anchor', () => {
      const result = updatePathAnchor('M 0 0 L 10 10 L 20 20', 1, { x: 15, y: 15 })
      expect(result).toContain('M 0 0')
      expect(result).toContain('15 15')
    })

    it('updates C command endpoint', () => {
      const result = updatePathAnchor('M 0 0 C 5 0 5 10 10 10', 1, { x: 12, y: 12 })
      expect(result).toContain('M 0 0')
      expect(result).toContain('12 12')
      // Control points should be preserved
      expect(result).toContain('5 0 5 10')
    })

    it('preserves Z command', () => {
      const result = updatePathAnchor('M 0 0 L 10 0 L 10 10 Z', 1, { x: 15, y: 5 })
      expect(result).toContain('Z')
    })
  })
})
