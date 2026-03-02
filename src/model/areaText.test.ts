import { describe, it, expect } from 'vitest'
import { wrapText, buildAreaTextAttrs } from './areaText'

describe('wrapText', () => {
  it('returns empty for empty text', () => {
    expect(wrapText('', 100, 16)).toEqual([])
  })

  it('returns single line for short text', () => {
    const lines = wrapText('Hi', 100, 16)
    expect(lines).toEqual(['Hi'])
  })

  it('wraps long text at word boundaries', () => {
    const lines = wrapText('hello world foo bar baz', 60, 16)
    // At fontSize 16, avgCharWidth ~= 9.6, charsPerLine ~= 6
    // So each line ~6 chars → words split across lines
    expect(lines.length).toBeGreaterThan(1)
    // All words should be present
    const joined = lines.join(' ')
    expect(joined).toContain('hello')
    expect(joined).toContain('baz')
  })

  it('preserves single word longer than line', () => {
    const lines = wrapText('superlongword', 30, 16)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toBe('superlongword')
  })

  it('handles multiple short words', () => {
    const lines = wrapText('a b c d e', 100, 16)
    // All should fit on one line at 100mm width
    expect(lines.length).toBeGreaterThanOrEqual(1)
    expect(lines.join(' ')).toBe('a b c d e')
  })

  it('returns empty for zero width', () => {
    expect(wrapText('hello', 0, 16)).toEqual([])
  })
})

describe('buildAreaTextAttrs', () => {
  it('builds text and tspan attributes', () => {
    const lines = ['Hello', 'World']
    const result = buildAreaTextAttrs(10, 20, 80, 60, lines, 16, 'sans-serif')

    expect(result.textAttrs.x).toBe('10')
    expect(result.textAttrs['font-size']).toBe('16')
    expect(result.tspans).toHaveLength(2)
    expect(result.tspans[0].text).toBe('Hello')
    expect(result.tspans[1].text).toBe('World')
    expect(result.tspans[0].attrs.dy).toBe('0')
    expect(parseFloat(result.tspans[1].attrs.dy)).toBeGreaterThan(0)
  })

  it('sets baseline offset from y', () => {
    const result = buildAreaTextAttrs(0, 0, 100, 100, ['test'], 16, 'serif')
    expect(parseFloat(result.textAttrs.y)).toBe(16) // y + fontSize
  })
})
