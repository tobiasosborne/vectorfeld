import { describe, it, expect } from 'vitest'
import { makeCompoundD, releaseCompoundD } from './compoundPath'

describe('makeCompoundD', () => {
  it('combines two simple paths', () => {
    const result = makeCompoundD(['M0 0 L10 10', 'M20 20 L30 30'])
    expect(result).toBe('M0 0 L10 10 M20 20 L30 30')
  })

  it('combines three paths', () => {
    const result = makeCompoundD([
      'M0 0 L10 0 L10 10 Z',
      'M20 20 L30 20 L30 30 Z',
      'M40 40 L50 40 L50 50 Z',
    ])
    expect(result).toContain('M0 0')
    expect(result).toContain('M20 20')
    expect(result).toContain('M40 40')
    const subpaths = releaseCompoundD(result)
    expect(subpaths).toHaveLength(3)
  })

  it('filters empty strings', () => {
    const result = makeCompoundD(['M0 0 L10 10', '', 'M20 20 L30 30'])
    expect(result).toBe('M0 0 L10 10 M20 20 L30 30')
  })
})

describe('releaseCompoundD', () => {
  it('splits compound path into individual subpaths', () => {
    const parts = releaseCompoundD('M0 0 L10 10 M20 20 L30 30')
    expect(parts).toHaveLength(2)
    expect(parts[0]).toBe('M0 0 L10 10')
    expect(parts[1]).toBe('M20 20 L30 30')
  })

  it('returns single subpath as-is', () => {
    const parts = releaseCompoundD('M0 0 L10 10 L20 20')
    expect(parts).toHaveLength(1)
    expect(parts[0]).toBe('M0 0 L10 10 L20 20')
  })

  it('handles Z-terminated subpaths', () => {
    const parts = releaseCompoundD('M0 0 L10 0 L10 10 Z M20 20 L30 20 L30 30 Z')
    expect(parts).toHaveLength(2)
    expect(parts[0]).toBe('M0 0 L10 0 L10 10 Z')
    expect(parts[1]).toBe('M20 20 L30 20 L30 30 Z')
  })

  it('round-trips with makeCompoundD', () => {
    const originals = ['M0 0 L10 10 Z', 'M20 20 C25 25 30 30 35 35 Z']
    const compound = makeCompoundD(originals)
    const released = releaseCompoundD(compound)
    expect(released).toEqual(originals)
  })

  it('returns empty array for empty string', () => {
    expect(releaseCompoundD('')).toEqual([])
    expect(releaseCompoundD('  ')).toEqual([])
  })
})
