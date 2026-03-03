import { describe, it, expect } from 'vitest'
import {
  identityMatrix, translateMatrix, scaleMatrix, rotateMatrix,
  skewXMatrix, skewYMatrix, multiplyMatrix, applyMatrixToPoint,
  parseTransform,
} from './matrix'
import { transformedAABB } from './geometry'

const EPSILON = 1e-6
function near(a: number, b: number) { return Math.abs(a - b) < EPSILON }

describe('matrix', () => {
  it('identity leaves point unchanged', () => {
    const m = identityMatrix()
    const p = applyMatrixToPoint(m, 10, 20)
    expect(p.x).toBe(10)
    expect(p.y).toBe(20)
  })

  it('translate shifts point', () => {
    const m = translateMatrix(5, -3)
    const p = applyMatrixToPoint(m, 10, 20)
    expect(p.x).toBe(15)
    expect(p.y).toBe(17)
  })

  it('scale multiplies coordinates', () => {
    const m = scaleMatrix(2, 3)
    const p = applyMatrixToPoint(m, 10, 20)
    expect(p.x).toBe(20)
    expect(p.y).toBe(60)
  })

  it('rotate 90 degrees around origin', () => {
    const m = rotateMatrix(90)
    const p = applyMatrixToPoint(m, 10, 0)
    expect(near(p.x, 0)).toBe(true)
    expect(near(p.y, 10)).toBe(true)
  })

  it('rotate with center', () => {
    const m = rotateMatrix(180, 5, 5)
    const p = applyMatrixToPoint(m, 10, 5)
    expect(near(p.x, 0)).toBe(true)
    expect(near(p.y, 5)).toBe(true)
  })

  it('skewX shifts x by tan(angle) * y', () => {
    const m = skewXMatrix(45)
    const p = applyMatrixToPoint(m, 0, 10)
    expect(near(p.x, 10)).toBe(true)
    expect(p.y).toBe(10)
  })

  it('skewY shifts y by tan(angle) * x', () => {
    const m = skewYMatrix(45)
    const p = applyMatrixToPoint(m, 10, 0)
    expect(p.x).toBe(10)
    expect(near(p.y, 10)).toBe(true)
  })

  it('multiply identity * M = M', () => {
    const m = translateMatrix(3, 7)
    const result = multiplyMatrix(identityMatrix(), m)
    expect(result).toEqual(m)
  })

  it('multiply M * identity = M', () => {
    const m = scaleMatrix(2, 3)
    const result = multiplyMatrix(m, identityMatrix())
    expect(result).toEqual(m)
  })

  it('multiply translate * scale composes correctly', () => {
    const t = translateMatrix(10, 20)
    const s = scaleMatrix(2, 2)
    const m = multiplyMatrix(t, s) // translate then scale
    const p = applyMatrixToPoint(m, 5, 5)
    expect(p.x).toBe(20) // (5*2) + 10
    expect(p.y).toBe(30) // (5*2) + 20
  })
})

describe('parseTransform', () => {
  it('parses translate', () => {
    const m = parseTransform('translate(10, 20)')
    const p = applyMatrixToPoint(m, 0, 0)
    expect(p.x).toBe(10)
    expect(p.y).toBe(20)
  })

  it('parses scale with one arg', () => {
    const m = parseTransform('scale(3)')
    const p = applyMatrixToPoint(m, 5, 7)
    expect(p.x).toBe(15)
    expect(p.y).toBe(21)
  })

  it('parses rotate with center', () => {
    const m = parseTransform('rotate(90, 50, 50)')
    const p = applyMatrixToPoint(m, 100, 50)
    expect(near(p.x, 50)).toBe(true)
    expect(near(p.y, 100)).toBe(true)
  })

  it('parses chained transforms', () => {
    const m = parseTransform('translate(10, 0) scale(2)')
    const p = applyMatrixToPoint(m, 5, 0)
    // SVG applies left-to-right: translate first, then scale
    // translate(10,0) moves to (15,0), scale(2) makes it (30,0)
    // Actually SVG transform composition: result = translate * scale
    // So point goes: scale(5,0) = (10,0), then translate = (20,0)
    // Wait — SVG spec says transforms are applied right-to-left to points
    // but we compose left-to-right in the string.
    // parseTransform multiplies left-to-right: T * S
    // For point: (T * S) * p = T * (S * p)
    // S * (5,0) = (10, 0), T * (10,0) = (20, 0)
    expect(p.x).toBe(20)
    expect(p.y).toBe(0)
  })

  it('parses matrix() directly', () => {
    const m = parseTransform('matrix(2, 0, 0, 3, 10, 20)')
    const p = applyMatrixToPoint(m, 1, 1)
    expect(p.x).toBe(12) // 2*1 + 0*1 + 10
    expect(p.y).toBe(23) // 0*1 + 3*1 + 20
  })

  it('returns identity for empty string', () => {
    const m = parseTransform('')
    expect(m).toEqual([1, 0, 0, 1, 0, 0])
  })
})

describe('transformedAABB with full transform model', () => {
  it('handles translate', () => {
    const bbox = { x: 0, y: 0, width: 10, height: 10 }
    const result = transformedAABB(bbox, 'translate(50, 30)')
    expect(result.x).toBe(50)
    expect(result.y).toBe(30)
    expect(result.width).toBe(10)
    expect(result.height).toBe(10)
  })

  it('handles scale', () => {
    const bbox = { x: 0, y: 0, width: 10, height: 10 }
    const result = transformedAABB(bbox, 'scale(2)')
    expect(result.x).toBe(0)
    expect(result.y).toBe(0)
    expect(result.width).toBe(20)
    expect(result.height).toBe(20)
  })

  it('backward compat: handles rotate', () => {
    const bbox = { x: 0, y: 0, width: 10, height: 10 }
    const result = transformedAABB(bbox, 'rotate(45, 5, 5)')
    // Rotated 45° square has larger AABB
    expect(result.width).toBeGreaterThan(10)
    expect(result.height).toBeGreaterThan(10)
  })

  it('handles null transform', () => {
    const bbox = { x: 5, y: 10, width: 20, height: 30 }
    const result = transformedAABB(bbox, null)
    expect(result).toEqual(bbox)
  })

  it('handles translate + rotate combined', () => {
    const bbox = { x: 0, y: 0, width: 10, height: 0 }
    const result = transformedAABB(bbox, 'translate(50, 50) rotate(90)')
    // Line from (0,0)-(10,0) rotated 90° becomes (0,0)-(0,10), then translated to (50,50)-(50,60)
    expect(near(result.x, 50)).toBe(true)
    expect(near(result.y, 50)).toBe(true)
    expect(near(result.width, 0)).toBe(true)
    expect(near(result.height, 10)).toBe(true)
  })
})
