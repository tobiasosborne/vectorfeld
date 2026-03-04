import { describe, it, expect } from 'vitest'
import { pickInterval, formatLabel } from './Ruler'

describe('pickInterval', () => {
  it('picks small interval at high zoom', () => {
    // 10mm span in 800px = very zoomed in
    const iv = pickInterval(10, 800)
    expect(iv).toBeLessThanOrEqual(2)
    expect(iv).toBeGreaterThan(0)
  })

  it('picks large interval at low zoom', () => {
    // 2000mm span in 800px = very zoomed out
    const iv = pickInterval(2000, 800)
    expect(iv).toBeGreaterThanOrEqual(100)
  })

  it('picks medium interval at normal zoom', () => {
    // 210mm (A4 width) in 800px ~ normal view
    const iv = pickInterval(210, 800)
    expect(iv).toBeGreaterThanOrEqual(10)
    expect(iv).toBeLessThanOrEqual(50)
  })

  it('returns last interval for extremely zoomed out view', () => {
    const iv = pickInterval(100000, 100)
    expect(iv).toBe(1000)
  })
})

describe('formatLabel', () => {
  it('formats integers for interval >= 1', () => {
    expect(formatLabel(10, 5)).toBe('10')
    expect(formatLabel(100, 10)).toBe('100')
    expect(formatLabel(0, 1)).toBe('0')
  })

  it('formats one decimal for interval 0.1-0.9', () => {
    expect(formatLabel(1.5, 0.5)).toBe('1.5')
    expect(formatLabel(0.1, 0.1)).toBe('0.1')
  })

  it('rounds to nearest integer for large intervals', () => {
    expect(formatLabel(99.999, 100)).toBe('100')
  })
})
