/// <reference types="node" />
/**
 * Tests for emitText — graft engine text-emission primitive.
 *
 * After vectorfeld-yyj, emitText shapes via fontkit and emits Identity-H
 * TJ ops referencing a Type-0 / CID-keyed font. Mirrors pdfExport.drawText
 * for tspan inheritance, per-char x-arrays, default black fill, font-size
 * scaling. Diverges in:
 *   - emits `[<gidHex>(adjustment)<gidHex>] TJ` instead of `(text) Tj`.
 *   - registry must supply a fontkit Font per fontKey (used for shaping).
 *   - GSUB ligatures collapse multi-codepoint runs to single glyphs.
 *   - GPOS kerning emits inline numeric adjustments inside the TJ array.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { emitText, type FontRegistry } from './graftCs'
import { loadFontkit, type FontkitFont } from './graftShape'
import { identityMatrix, translateMatrix, scaleMatrix } from './matrix'

const SVG_NS = 'http://www.w3.org/2000/svg'
const PT = 72 / 25.4
const PAGE_H = 297 * PT
const CARLITO_PATH = resolve(process.cwd(), 'src/fonts/Carlito-Regular.ttf')

let CARLITO: FontkitFont
beforeAll(() => {
  CARLITO = loadFontkit(new Uint8Array(readFileSync(CARLITO_PATH)))
})

function build(svg: string): Element {
  return new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement
}

function findById(root: Element, id: string): Element {
  return root.querySelector(`#${id}`)!
}

function ctx(matrix = identityMatrix(), pageHeightPt = PAGE_H) {
  return { matrix, pageHeightPt }
}

interface MockRegistry extends FontRegistry {
  calls: Array<{ family: string | null; style: string | null; weight: string | null }>
}

function mockRegistry(keyByFamily: Record<string, string> = {}, defaultKey = 'F1'): MockRegistry {
  const calls: MockRegistry['calls'] = []
  return {
    calls,
    resolveFontKey(family, style, weight) {
      calls.push({ family, style, weight })
      return keyByFamily[family ?? ''] ?? defaultKey
    },
    // Single-font test mock — every key maps to Carlito. Real registries
    // (graftExport.makeSingleFontRegistry) do the same; multi-font
    // registries are a future bead.
    getFontkitFont: () => CARLITO,
  }
}

function f(n: number): string {
  if (!Number.isFinite(n)) return '0'
  const s = n.toFixed(3)
  const stripped = s.replace(/\.?0+$/, '')
  return stripped === '' || stripped === '-' || stripped === '-0' ? '0' : stripped
}

/** Compute the Identity-H hex string for `text` using fontkit's cmap-only
 *  lookup (no shaping, no ligatures). Useful for asserting expected GID
 *  hex for simple strings whose chars don't form ligatures. */
function gidHexNoShaping(text: string): string {
  return [...text]
    .map((c) => CARLITO.glyphForCodePoint(c.codePointAt(0)!).id.toString(16).padStart(4, '0'))
    .join('')
}

// ---------------------------------------------------------------------------

describe('emitText — plain text (no tspans)', () => {
  it('returns "" for empty/whitespace-only text', () => {
    const root = build(`<svg xmlns="${SVG_NS}"><text id="t" x="0" y="0" font-size="6"></text></svg>`)
    expect(emitText(findById(root, 't'), ctx(), mockRegistry())).toBe('')
  })

  it('emits q + BT + Tf + rg + Tm + [<hex>] TJ + ET + Q with element-level x/y', () => {
    const root = build(`<svg xmlns="${SVG_NS}"><text id="t" x="10" y="20" font-size="6" fill="#ff0000">Hi</text></svg>`)
    const out = emitText(findById(root, 't'), ctx(), mockRegistry({}, 'F1'))
    const xPt = 10 * PT
    const yPt = PAGE_H - 20 * PT
    const sizePt = 6 * PT
    const hex = gidHexNoShaping('Hi')
    expect(out).toBe(
      'q\n' +
        'BT\n' +
        `/F1 ${f(sizePt)} Tf\n` +
        '1 0 0 rg\n' +
        `1 0 0 1 ${f(xPt)} ${f(yPt)} Tm\n` +
        `[<${hex}>] TJ\n` +
        'ET\n' +
        'Q\n',
    )
  })

  it('default fill is black when no fill attribute', () => {
    const root = build(`<svg xmlns="${SVG_NS}"><text id="t" x="0" y="0">x</text></svg>`)
    const out = emitText(findById(root, 't'), ctx(), mockRegistry())
    expect(out).toContain('0 0 0 rg')
  })

  it('default font-size is 12mm (matches pdfExport)', () => {
    const root = build(`<svg xmlns="${SVG_NS}"><text id="t" x="0" y="0">x</text></svg>`)
    const out = emitText(findById(root, 't'), ctx(), mockRegistry())
    expect(out).toContain(`/F1 ${f(12 * PT)} Tf`)
  })

  it('font-size is scaled by extractScale(matrix).sx', () => {
    const root = build(`<svg xmlns="${SVG_NS}"><text id="t" x="0" y="0" font-size="6">x</text></svg>`)
    const out = emitText(findById(root, 't'), ctx(scaleMatrix(2, 2)), mockRegistry())
    expect(out).toContain(`/F1 ${f(12 * PT)} Tf`)
  })

  it('translate ancestor matrix shifts the baseline position', () => {
    const root = build(`<svg xmlns="${SVG_NS}"><text id="t" x="10" y="20" font-size="6">x</text></svg>`)
    const out = emitText(findById(root, 't'), ctx(translateMatrix(5, 5)), mockRegistry())
    const xPt = 15 * PT
    const yPt = PAGE_H - 25 * PT
    expect(out).toContain(`1 0 0 1 ${f(xPt)} ${f(yPt)} Tm`)
  })

  it('passes element-level font attributes to the registry', () => {
    const root = build(
      `<svg xmlns="${SVG_NS}"><text id="t" x="0" y="0" font-family="Carlito" font-style="italic" font-weight="bold">x</text></svg>`,
    )
    const reg = mockRegistry({ Carlito: 'CarRegKey' })
    emitText(findById(root, 't'), ctx(), reg)
    // emitText also calls resolveFontKey(null, null, null) to get
    // the fallback key for the coverage check (vectorfeld-eb0).
    // Filter those out and assert the element triple was forwarded.
    const realCalls = reg.calls.filter((c) => c.family !== null)
    expect(realCalls).toHaveLength(1)
    expect(realCalls[0]).toEqual({ family: 'Carlito', style: 'italic', weight: 'bold' })
  })
})

describe('emitText — tspan with single x/y', () => {
  it('uses tspan x/y when present (overrides element x/y)', () => {
    const root = build(
      `<svg xmlns="${SVG_NS}"><text id="t" x="0" y="0" font-size="6"><tspan x="10" y="20">Hi</tspan></text></svg>`,
    )
    const out = emitText(findById(root, 't'), ctx(), mockRegistry())
    expect(out).toContain(`1 0 0 1 ${f(10 * PT)} ${f(PAGE_H - 20 * PT)} Tm`)
    expect(out).toContain(`[<${gidHexNoShaping('Hi')}>] TJ`)
  })

  it('falls back to element x/y when tspan lacks them', () => {
    const root = build(
      `<svg xmlns="${SVG_NS}"><text id="t" x="10" y="20" font-size="6"><tspan>Hi</tspan></text></svg>`,
    )
    const out = emitText(findById(root, 't'), ctx(), mockRegistry())
    expect(out).toContain(`1 0 0 1 ${f(10 * PT)} ${f(PAGE_H - 20 * PT)} Tm`)
  })

  it('multiple tspans each emit their own Tm + TJ', () => {
    const root = build(
      `<svg xmlns="${SVG_NS}"><text id="t" x="0" y="0" font-size="6"><tspan x="10" y="10">A</tspan><tspan x="20" y="20">B</tspan></text></svg>`,
    )
    const out = emitText(findById(root, 't'), ctx(), mockRegistry())
    expect(out).toContain(`1 0 0 1 ${f(10 * PT)} ${f(PAGE_H - 10 * PT)} Tm\n[<${gidHexNoShaping('A')}>] TJ`)
    expect(out).toContain(`1 0 0 1 ${f(20 * PT)} ${f(PAGE_H - 20 * PT)} Tm\n[<${gidHexNoShaping('B')}>] TJ`)
  })

  it('tspan inherits font-family from element when not overridden', () => {
    const root = build(
      `<svg xmlns="${SVG_NS}"><text id="t" x="0" y="0" font-family="Carlito"><tspan>Hi</tspan></text></svg>`,
    )
    const reg = mockRegistry()
    emitText(findById(root, 't'), ctx(), reg)
    expect(reg.calls[0].family).toBe('Carlito')
  })

  it('tspan font-family overrides element font-family', () => {
    const root = build(
      `<svg xmlns="${SVG_NS}"><text id="t" x="0" y="0" font-family="Carlito"><tspan font-family="Liberation">Hi</tspan></text></svg>`,
    )
    const reg = mockRegistry()
    emitText(findById(root, 't'), ctx(), reg)
    expect(reg.calls[0].family).toBe('Liberation')
  })

  it('tspan fill overrides element fill', () => {
    const root = build(
      `<svg xmlns="${SVG_NS}"><text id="t" x="0" y="0" fill="#ff0000"><tspan x="0" y="0" fill="#00ff00">Hi</tspan></text></svg>`,
    )
    const out = emitText(findById(root, 't'), ctx(), mockRegistry())
    expect(out).toContain('0 1 0 rg')
    expect(out).not.toContain('1 0 0 rg')
  })

  it('tspan font-size overrides element font-size', () => {
    const root = build(
      `<svg xmlns="${SVG_NS}"><text id="t" x="0" y="0" font-size="6"><tspan font-size="10">Hi</tspan></text></svg>`,
    )
    const out = emitText(findById(root, 't'), ctx(), mockRegistry())
    expect(out).toContain(`/F1 ${f(10 * PT)} Tf`)
    expect(out).not.toContain(`/F1 ${f(6 * PT)} Tf`)
  })
})

describe('emitText — per-character x-array (MuPDF import case)', () => {
  it('emits one Tm + one TJ per character when x-array length > 1', () => {
    const root = build(
      `<svg xmlns="${SVG_NS}"><text id="t" font-size="6"><tspan x="10 20 30" y="50">ABC</tspan></text></svg>`,
    )
    const out = emitText(findById(root, 't'), ctx(), mockRegistry())
    const yPt = PAGE_H - 50 * PT
    expect(out).toContain(`1 0 0 1 ${f(10 * PT)} ${f(yPt)} Tm\n[<${gidHexNoShaping('A')}>] TJ`)
    expect(out).toContain(`1 0 0 1 ${f(20 * PT)} ${f(yPt)} Tm\n[<${gidHexNoShaping('B')}>] TJ`)
    expect(out).toContain(`1 0 0 1 ${f(30 * PT)} ${f(yPt)} Tm\n[<${gidHexNoShaping('C')}>] TJ`)
  })

  it('reuses the last x value when array is shorter than text (matches pdfExport)', () => {
    const root = build(
      `<svg xmlns="${SVG_NS}"><text id="t" font-size="6"><tspan x="10 20" y="50">ABCD</tspan></text></svg>`,
    )
    const out = emitText(findById(root, 't'), ctx(), mockRegistry())
    expect((out.match(new RegExp(`1 0 0 1 ${f(20 * PT)} `, 'g')) || []).length).toBe(3) // B, C, D
  })

  it('emits Tf only once even with many per-char TJ', () => {
    const root = build(
      `<svg xmlns="${SVG_NS}"><text id="t" font-size="6"><tspan x="10 20 30 40">ABCD</tspan></text></svg>`,
    )
    const out = emitText(findById(root, 't'), ctx(), mockRegistry())
    expect((out.match(/ Tf\n/g) || []).length).toBe(1)
  })
})

describe('emitText — Identity-H hex emission', () => {
  it('emits 4-hex-digit GIDs concatenated (no spaces inside the hex string)', () => {
    const root = build(`<svg xmlns="${SVG_NS}"><text id="t" x="0" y="0" font-size="6">Hello</text></svg>`)
    const out = emitText(findById(root, 't'), ctx(), mockRegistry())
    const m = out.match(/\[<([0-9a-f]+)>\] TJ/)
    expect(m).not.toBeNull()
    expect(m![1].length % 4).toBe(0)
    // Each pair of hex bytes is a GID; decode and confirm they map back via cmap.
    const hex = m![1]
    expect(hex.length).toBe('Hello'.length * 4)
  })
})

describe('emitText — GSUB ligatures (vectorfeld-yyj)', () => {
  it('"office" emits a ligature glyph spanning ≥ 2 input code points', () => {
    const root = build(`<svg xmlns="${SVG_NS}"><text id="t" x="0" y="0" font-size="6">office</text></svg>`)
    const out = emitText(findById(root, 't'), ctx(), mockRegistry())
    const m = out.match(/\[<([0-9a-f]+)>\] TJ/)
    expect(m).not.toBeNull()
    const hex = m![1]
    // Ligature collapses 2+ source chars into 1 glyph, so total glyph count
    // is strictly less than source-char count.
    const glyphCount = hex.length / 4
    expect(glyphCount).toBeLessThan('office'.length)

    // Confirm the ligature glyph appears verbatim in the hex stream:
    // shape via fontkit, find a glyph whose codePoints.length >= 2,
    // expect its 4-hex GID to be a substring of the emitted hex.
    const ligaGid = CARLITO.layout('office').glyphs.find((g) => g.codePoints.length >= 2)!.id
    expect(hex).toContain(ligaGid.toString(16).padStart(4, '0'))
  })
})

describe('emitText — GPOS kerning (vectorfeld-yyj)', () => {
  it('"Ta" produces a TJ array with a numeric inline adjustment between two GIDs', () => {
    const root = build(`<svg xmlns="${SVG_NS}"><text id="t" x="0" y="0" font-size="6">Ta</text></svg>`)
    const out = emitText(findById(root, 't'), ctx(), mockRegistry())
    // Two glyphs separated by an inline adjustment number:
    //   [<XXXX> N <YYYY>] TJ   (N may be negative or positive)
    const m = out.match(/\[<([0-9a-f]+)>\s+(-?[\d.]+)\s+<([0-9a-f]+)>\] TJ/)
    expect(m).not.toBeNull()
    const tjNum = parseFloat(m![2])
    expect(tjNum).not.toBe(0)
  })

  it('kerning sign convention: tighter (xAdvance < advanceWidth) → positive TJ adjustment', () => {
    // Verified via fontkit: 'Ta' is a tightening kern pair; positions[0].xAdvance
    // is less than glyphs[0].advanceWidth. By the spec (PDF §9.4.3) positive
    // TJ subtracts from pen position → moves next glyph closer → matches.
    const run = CARLITO.layout('Ta')
    const delta = run.glyphs[0].advanceWidth - run.positions[0].xAdvance
    expect(delta).toBeGreaterThan(0) // 'T' followed by 'a' is tightening in Carlito.
    const root = build(`<svg xmlns="${SVG_NS}"><text id="t" x="0" y="0" font-size="6">Ta</text></svg>`)
    const out = emitText(findById(root, 't'), ctx(), mockRegistry())
    const m = out.match(/\[<[0-9a-f]+>\s+(-?[\d.]+)\s+<[0-9a-f]+>\] TJ/)
    expect(m).not.toBeNull()
    expect(parseFloat(m![1])).toBeGreaterThan(0)
  })
})

describe('emitText — state-change suppression', () => {
  it('only emits Tf on the first run when family + size are constant across tspans', () => {
    const root = build(
      `<svg xmlns="${SVG_NS}"><text id="t" font-family="Carlito" font-size="6"><tspan x="0" y="0">A</tspan><tspan x="10" y="0">B</tspan></text></svg>`,
    )
    const out = emitText(findById(root, 't'), ctx(), mockRegistry())
    expect((out.match(/ Tf\n/g) || []).length).toBe(1)
  })

  it('only emits rg on the first run when fill is constant across tspans', () => {
    const root = build(
      `<svg xmlns="${SVG_NS}"><text id="t" fill="#ff0000"><tspan x="0" y="0">A</tspan><tspan x="10" y="0">B</tspan></text></svg>`,
    )
    const out = emitText(findById(root, 't'), ctx(), mockRegistry())
    expect((out.match(/ rg\n/g) || []).length).toBe(1)
  })

  it('re-emits Tf when font key changes between tspans', () => {
    const root = build(
      `<svg xmlns="${SVG_NS}"><text id="t" font-family="Carlito"><tspan x="0" y="0">A</tspan><tspan x="10" y="0" font-family="Liberation">B</tspan></text></svg>`,
    )
    const reg = mockRegistry({ Carlito: 'F1', Liberation: 'F2' })
    const out = emitText(findById(root, 't'), ctx(), reg)
    expect((out.match(/ Tf\n/g) || []).length).toBe(2)
    expect(out).toContain('/F1 ')
    expect(out).toContain('/F2 ')
  })
})
