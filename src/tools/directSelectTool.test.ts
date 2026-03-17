import { describe, it, expect } from 'vitest'
import { parsePathAnchors, updatePathAnchor, parsePathWithHandles, updatePathControlPoint } from './directSelectTool'

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

    it('updates C command endpoint and moves adjacent handles by same delta', () => {
      const result = updatePathAnchor('M 0 0 C 5 0 5 10 10 10', 1, { x: 12, y: 12 })
      expect(result).toContain('M 0 0')
      expect(result).toContain('12 12')
      // cp1 (outgoing from anchor 0) is preserved; cp2 (incoming to anchor 1) moves by delta (+2,+2)
      expect(result).toContain('5 0 7 12')
    })

    it('preserves Z command', () => {
      const result = updatePathAnchor('M 0 0 L 10 0 L 10 10 Z', 1, { x: 15, y: 5 })
      expect(result).toContain('Z')
    })
  })

  describe('parsePathWithHandles', () => {
    it('returns no handles for L segments', () => {
      const result = parsePathWithHandles('M 0 0 L 10 10')
      expect(result).toHaveLength(2)
      expect(result[0].handles.handleOut).toBeNull()
      expect(result[1].handles.handleIn).toBeNull()
    })

    it('returns handles for C segments', () => {
      const result = parsePathWithHandles('M 0 0 C 5 0 5 10 10 10')
      expect(result).toHaveLength(2)
      // First anchor gets outgoing handle (cp1)
      expect(result[0].handles.handleOut).toEqual({ x: 5, y: 0 })
      // Second anchor gets incoming handle (cp2)
      expect(result[1].handles.handleIn).toEqual({ x: 5, y: 10 })
    })

    it('handles mixed L and C', () => {
      const result = parsePathWithHandles('M 0 0 L 10 0 C 15 5 15 5 20 10')
      expect(result).toHaveLength(3)
      expect(result[0].handles.handleOut).toBeNull() // L segment, no handle
      expect(result[1].handles.handleOut).toEqual({ x: 15, y: 5 }) // outgoing from L anchor into C
      expect(result[2].handles.handleIn).toEqual({ x: 15, y: 5 })
    })
  })

  describe('updatePathControlPoint', () => {
    it('updates cp1 (outgoing handle)', () => {
      const result = updatePathControlPoint('M 0 0 C 5 0 5 10 10 10', 0, 'out', { x: 7, y: 2 })
      expect(result).toContain('7 2 5 10 10 10')
    })

    it('updates cp2 (incoming handle)', () => {
      const result = updatePathControlPoint('M 0 0 C 5 0 5 10 10 10', 1, 'in', { x: 8, y: 12 })
      expect(result).toContain('5 0 8 12 10 10')
    })

    it('preserves other coordinates', () => {
      const result = updatePathControlPoint('M 0 0 C 5 0 5 10 10 10', 0, 'out', { x: 7, y: 2 })
      expect(result).toContain('M 0 0')
      expect(result).toContain('10 10') // endpoint preserved
    })
  })
})
