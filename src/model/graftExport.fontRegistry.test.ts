/// <reference types="node" />
/**
 * Tests for makeFontRegistry — the multi-font registry used by
 * the graft engine to route text through Carlito (new content)
 * vs. matched source fonts (in-place modifications) post-eb0.
 *
 * eb0-3 (vectorfeld-wgv): generalize the single-font registry.
 * Match rules verified here:
 *   1. exact (family, weight, style) → that key
 *   2. family + style match, weight differs → match by family+style
 *   3. family only matches → match
 *   4. nothing matches → fallback key
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { makeFontRegistry, type RegisteredFont } from './graftExport'
import { loadFontkit, type FontkitFont } from './graftShape'

const CARLITO_PATH = resolve(process.cwd(), 'src/fonts/Carlito-Regular.ttf')

let CARLITO: FontkitFont
beforeAll(() => {
  CARLITO = loadFontkit(new Uint8Array(readFileSync(CARLITO_PATH)))
})

function slot(key: string, family: string, weight = 'normal', style = 'normal'): RegisteredFont {
  return { key, family, weight, style, fontkitFont: CARLITO }
}

describe('makeFontRegistry — exact-match routing', () => {
  it('returns the exact-match key when (family, weight, style) all match', () => {
    const reg = makeFontRegistry([
      slot('VfCarlito', 'Carlito', 'normal', 'normal'),
      slot('VfSrcCalibri', 'Calibri', 'bold', 'normal'),
      slot('VfSrcCalibriItalic', 'Calibri', 'bold', 'italic'),
    ], 'VfCarlito')

    expect(reg.resolveFontKey('Calibri', 'normal', 'bold')).toBe('VfSrcCalibri')
    expect(reg.resolveFontKey('Calibri', 'italic', 'bold')).toBe('VfSrcCalibriItalic')
    expect(reg.resolveFontKey('Carlito', 'normal', 'normal')).toBe('VfCarlito')
  })

  it('matches family case-insensitively', () => {
    const reg = makeFontRegistry([
      slot('K', 'Calibri', 'normal', 'normal'),
    ], 'fb')
    expect(reg.resolveFontKey('CALIBRI', 'normal', 'normal')).toBe('K')
    expect(reg.resolveFontKey('calibri', 'normal', 'normal')).toBe('K')
  })
})

describe('makeFontRegistry — weight/style normalization', () => {
  it('treats numeric 700 as bold + numeric 400 as normal', () => {
    const reg = makeFontRegistry([
      slot('Reg', 'Calibri', 'normal', 'normal'),
      slot('Bold', 'Calibri', 'bold', 'normal'),
    ], 'fb')
    expect(reg.resolveFontKey('Calibri', 'normal', '700')).toBe('Bold')
    expect(reg.resolveFontKey('Calibri', 'normal', '400')).toBe('Reg')
  })

  it('treats "oblique" style as italic for matching', () => {
    const reg = makeFontRegistry([
      slot('Italic', 'Calibri', 'normal', 'italic'),
    ], 'fb')
    expect(reg.resolveFontKey('Calibri', 'oblique', 'normal')).toBe('Italic')
  })

  it('treats null/empty style and weight as normal', () => {
    const reg = makeFontRegistry([
      slot('Reg', 'Calibri', 'normal', 'normal'),
    ], 'fb')
    expect(reg.resolveFontKey('Calibri', null, null)).toBe('Reg')
    expect(reg.resolveFontKey('Calibri', '', '')).toBe('Reg')
  })
})

describe('makeFontRegistry — fallback chain', () => {
  it('falls back to family + style when weight differs', () => {
    const reg = makeFontRegistry([
      slot('Bold', 'Calibri', 'bold', 'normal'),
    ], 'fb')
    // Asking for normal-weight Calibri — no exact match, family+style
    // fallback picks the bold slot (better than fallback to fb).
    expect(reg.resolveFontKey('Calibri', 'normal', 'normal')).toBe('Bold')
  })

  it('falls back to family-only when style also differs', () => {
    const reg = makeFontRegistry([
      slot('Italic', 'Calibri', 'normal', 'italic'),
    ], 'fb')
    expect(reg.resolveFontKey('Calibri', 'normal', 'normal')).toBe('Italic')
  })

  it('falls back to fallbackKey when no slot matches family at all', () => {
    const reg = makeFontRegistry([
      slot('Cal', 'Calibri', 'normal', 'normal'),
    ], 'VfCarlito')
    expect(reg.resolveFontKey('Garamond', 'italic', 'bold')).toBe('VfCarlito')
  })

  it('falls back to fallbackKey for null family', () => {
    const reg = makeFontRegistry([
      slot('Cal', 'Calibri', 'normal', 'normal'),
    ], 'fb')
    expect(reg.resolveFontKey(null, null, null)).toBe('fb')
  })
})

describe('makeFontRegistry — getFontkitFont', () => {
  it('returns the FontkitFont registered under the key', () => {
    const reg = makeFontRegistry([slot('K', 'X')], 'K')
    expect(reg.getFontkitFont('K')).toBe(CARLITO)
  })

  it('throws a clear error when the key is unknown', () => {
    const reg = makeFontRegistry([slot('K', 'X')], 'K')
    expect(() => reg.getFontkitFont('Unknown')).toThrow(/not registered/)
  })

  it('throws with a useful list of known keys', () => {
    const reg = makeFontRegistry([slot('A', 'X'), slot('B', 'Y')], 'A')
    try {
      reg.getFontkitFont('Z')
      throw new Error('expected throw')
    } catch (e) {
      const msg = (e as Error).message
      expect(msg).toContain('A')
      expect(msg).toContain('B')
    }
  })
})

describe('makeFontRegistry — backwards compatibility with single-font usage', () => {
  it('a one-slot registry behaves like the previous single-font registry', () => {
    const reg = makeFontRegistry(
      [slot('VfCarlito', 'Carlito', 'normal', 'normal')],
      'VfCarlito',
    )
    expect(reg.resolveFontKey('Carlito', 'normal', 'normal')).toBe('VfCarlito')
    expect(reg.resolveFontKey(null, null, null)).toBe('VfCarlito')
    expect(reg.resolveFontKey('SomeOtherFont', 'italic', 'bold')).toBe('VfCarlito')
  })
})
