import { describe, it, expect } from 'vitest'
import { parsePathAnchors, updatePathAnchor, parsePathWithHandles, updatePathControlPoint } from './directSelectTool'
import { parsePathD } from '../model/pathOps'

/**
 * These helpers compare path geometry by structure rather than by raw
 * whitespace. The node editor now rebuilds paths via pathOps' `commandsToD`,
 * which emits a normalized format (`M15 25`, no space after the command
 * letter) that differs from the old hand-rolled regex serializer. Comparing
 * via `parsePathD` keeps the assertions independent of that surface format.
 */
function commandTypes(d: string): string {
  return parsePathD(d).map(c => c.type).join('')
}
function flatCoords(d: string): number[] {
  return parsePathD(d).flatMap(c => c.points.flatMap(p => [p.x, p.y]))
}

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

    // --- Fixtures the old regex parser got wrong ---

    it('parses relative m/l as absolute (old parser read them verbatim)', () => {
      const anchors = parsePathAnchors('m 10 10 l 5 0 l 0 5')
      expect(anchors).toEqual([
        { x: 10, y: 10 },
        { x: 15, y: 10 },
        { x: 15, y: 15 },
      ])
    })

    it('captures H/V commands (old parser dropped them entirely)', () => {
      const anchors = parsePathAnchors('M 0 0 H 10 V 10')
      expect(anchors).toEqual([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ])
    })

    it('captures S smooth-cubic anchors (old parser dropped them)', () => {
      const anchors = parsePathAnchors('M0 0 C5 0 5 10 10 10 S15 20 20 20')
      expect(anchors).toHaveLength(3)
      expect(anchors[0]).toEqual({ x: 0, y: 0 })
      expect(anchors[1]).toEqual({ x: 10, y: 10 })
      expect(anchors[2]).toEqual({ x: 20, y: 20 })
    })
  })

  describe('updatePathAnchor', () => {
    it('updates M command anchor', () => {
      const result = updatePathAnchor('M 10 20 L 30 40', 0, { x: 15, y: 25 })
      expect(commandTypes(result)).toBe('ML')
      expect(parsePathAnchors(result)).toEqual([
        { x: 15, y: 25 },
        { x: 30, y: 40 },
      ])
    })

    it('updates L command anchor', () => {
      const result = updatePathAnchor('M 0 0 L 10 10 L 20 20', 1, { x: 15, y: 15 })
      expect(parsePathAnchors(result)).toEqual([
        { x: 0, y: 0 },
        { x: 15, y: 15 },
        { x: 20, y: 20 },
      ])
    })

    it('updates C command endpoint and moves adjacent handles by same delta', () => {
      const result = updatePathAnchor('M 0 0 C 5 0 5 10 10 10', 1, { x: 12, y: 12 })
      const cmds = parsePathD(result)
      expect(cmds.map(c => c.type).join('')).toBe('MC')
      const c = cmds[1]
      // cp1 (outgoing from anchor 0) is preserved
      expect(c.points[0]).toEqual({ x: 5, y: 0 })
      // cp2 (incoming to anchor 1) moves by delta (+2,+2): 5,10 -> 7,12
      expect(c.points[1]).toEqual({ x: 7, y: 12 })
      // endpoint set to new pos
      expect(c.points[2]).toEqual({ x: 12, y: 12 })
    })

    it('preserves Z command', () => {
      const result = updatePathAnchor('M 0 0 L 10 0 L 10 10 Z', 1, { x: 15, y: 5 })
      expect(commandTypes(result)).toBe('MLLZ')
    })

    it('drops no command when editing a relative + H/V + S compound path', () => {
      const d = 'm 5 5 l 10 0 H 30 V 20 C 35 20 35 30 40 30 S 45 40 50 40'
      const before = parsePathD(d)
      // editing the 3rd anchor (index 2) by a non-trivial delta
      const result = updatePathAnchor(d, 2, { x: 99, y: 99 })
      const after = parsePathD(result)
      // No segment dropped: same command count and same command-type sequence.
      expect(after).toHaveLength(before.length)
      expect(after.map(c => c.type)).toEqual(before.map(c => c.type))
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
      const c = parsePathD(result)[1]
      expect(c.points).toEqual([
        { x: 7, y: 2 },
        { x: 5, y: 10 },
        { x: 10, y: 10 },
      ])
    })

    it('updates cp2 (incoming handle)', () => {
      const result = updatePathControlPoint('M 0 0 C 5 0 5 10 10 10', 1, 'in', { x: 8, y: 12 })
      const c = parsePathD(result)[1]
      expect(c.points).toEqual([
        { x: 5, y: 0 },
        { x: 8, y: 12 },
        { x: 10, y: 10 },
      ])
    })

    it('preserves other coordinates', () => {
      const result = updatePathControlPoint('M 0 0 C 5 0 5 10 10 10', 0, 'out', { x: 7, y: 2 })
      expect(flatCoords(result)).toEqual([0, 0, 7, 2, 5, 10, 10, 10])
    })
  })
})
