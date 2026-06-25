import { describe, it, expect } from 'vitest'
import { clampAttr } from './numeric'
import { MIN_SCALE_SIZE } from '../tools/selectTool'

// vectorfeld-3yu.18: dimension attributes must never reach the DOM negative or
// (for true sizes) zero, or the SVG renderer rejects them ("A negative value is
// not valid"), the shape vanishes, and the overlay draws phantom handles.

describe('clampAttr', () => {
  const FLOOR = String(MIN_SCALE_SIZE) // '0.1'

  it('floors positive-size attrs (width/height/r) at MIN_SCALE_SIZE', () => {
    for (const attr of ['width', 'height', 'r']) {
      expect(clampAttr(attr, '-50')).toBe(FLOOR)
      expect(clampAttr(attr, '0')).toBe(FLOOR)
      expect(clampAttr(attr, '0.05')).toBe(FLOOR) // below the floor
    }
  })

  it('leaves valid positive sizes unchanged (no reformatting)', () => {
    expect(clampAttr('width', '100')).toBe('100')
    expect(clampAttr('height', '50.5')).toBe('50.5')
    expect(clampAttr('r', '0.1')).toBe('0.1') // exactly at the floor is allowed
  })

  it('clamps rx/ry to >= 0 but treats 0 as valid (square corners)', () => {
    expect(clampAttr('rx', '0')).toBe('0') // valid SVG — NOT bumped to 0.1
    expect(clampAttr('ry', '0')).toBe('0')
    expect(clampAttr('rx', '-3')).toBe('0')
    expect(clampAttr('ry', '-3')).toBe('0')
    expect(clampAttr('rx', '5')).toBe('5')
  })

  it('passes position attributes through unchanged (negatives are legal)', () => {
    for (const attr of ['x', 'y', 'cx', 'cy', 'x1', 'y1', 'x2', 'y2']) {
      expect(clampAttr(attr, '-50')).toBe('-50')
      expect(clampAttr(attr, '0')).toBe('0')
      expect(clampAttr(attr, '12.5')).toBe('12.5')
    }
  })

  it('passes non-dimension attributes through unchanged', () => {
    expect(clampAttr('transform', 'rotate(30, 5, 5)')).toBe('rotate(30, 5, 5)')
    expect(clampAttr('fill', 'none')).toBe('none')
    expect(clampAttr('d', 'M0 0 L10 10')).toBe('M0 0 L10 10')
    expect(clampAttr('stroke-dasharray', '4 2')).toBe('4 2')
  })

  it('rejects (returns null) a non-numeric value on a dimension attr', () => {
    expect(clampAttr('width', 'abc')).toBeNull()
    expect(clampAttr('height', '')).toBeNull()
    expect(clampAttr('r', 'NaN')).toBeNull()
    expect(clampAttr('rx', 'foo')).toBeNull()
  })

  it('the headline bug cases: width=-50 and width=0 become a positive value', () => {
    const a = clampAttr('width', '-50')
    const b = clampAttr('width', '0')
    expect(a).not.toBeNull()
    expect(b).not.toBeNull()
    expect(parseFloat(a as string)).toBeGreaterThan(0)
    expect(parseFloat(b as string)).toBeGreaterThan(0)
  })
})
