/**
 * Tests for emitText — graft engine text-emission primitive.
 *
 * Mirrors pdfExport.drawText semantics: tspan inheritance, per-char x-arrays,
 * default black fill, font-size scaling by ctx.matrix sx. Diverges only in
 * that it emits raw PDF text ops instead of calling pdf-lib's drawText.
 */

import { describe, it, expect } from 'vitest'
import { emitText, type FontRegistry } from './graftCs'
import { identityMatrix, translateMatrix, scaleMatrix } from './matrix'

const SVG_NS = 'http://www.w3.org/2000/svg'
const PT = 72 / 25.4
const PAGE_H = 297 * PT

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
  }
}

function f(n: number): string {
  if (!Number.isFinite(n)) return '0'
  const s = n.toFixed(3)
  const stripped = s.replace(/\.?0+$/, '')
  return stripped === '' || stripped === '-' || stripped === '-0' ? '0' : stripped
}

// ---------------------------------------------------------------------------

describe('emitText — plain text (no tspans)', () => {
  it('returns "" for empty/whitespace-only text', () => {
    const root = build(`<svg xmlns="${SVG_NS}"><text id="t" x="0" y="0" font-size="6"></text></svg>`)
    expect(emitText(findById(root, 't'), ctx(), mockRegistry())).toBe('')
  })

  it('emits q + BT + Tf + rg + Tm + Tj + ET + Q with element-level x/y', () => {
    const root = build(`<svg xmlns="${SVG_NS}"><text id="t" x="10" y="20" font-size="6" fill="#ff0000">Hi</text></svg>`)
    const out = emitText(findById(root, 't'), ctx(), mockRegistry({}, 'F1'))
    const xPt = 10 * PT
    const yPt = PAGE_H - 20 * PT
    const sizePt = 6 * PT
    expect(out).toBe(
      'q\n' +
        'BT\n' +
        `/F1 ${f(sizePt)} Tf\n` +
        '1 0 0 rg\n' +
        `1 0 0 1 ${f(xPt)} ${f(yPt)} Tm\n` +
        '(Hi) Tj\n' +
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
    // sx = 2; font size = 6 * 2 * PT
    expect(out).toContain(`/F1 ${f(12 * PT)} Tf`)
  })

  it('translate ancestor matrix shifts the baseline position', () => {
    const root = build(`<svg xmlns="${SVG_NS}"><text id="t" x="10" y="20" font-size="6">x</text></svg>`)
    const out = emitText(findById(root, 't'), ctx(translateMatrix(5, 5)), mockRegistry())
    const xPt = 15 * PT // 10 + 5
    const yPt = PAGE_H - 25 * PT // 20 + 5, then Y-flipped
    expect(out).toContain(`1 0 0 1 ${f(xPt)} ${f(yPt)} Tm`)
  })

  it('passes element-level font attributes to the registry', () => {
    const root = build(
      `<svg xmlns="${SVG_NS}"><text id="t" x="0" y="0" font-family="Carlito" font-style="italic" font-weight="bold">x</text></svg>`,
    )
    const reg = mockRegistry({ Carlito: 'CarRegKey' })
    emitText(findById(root, 't'), ctx(), reg)
    expect(reg.calls).toHaveLength(1)
    expect(reg.calls[0]).toEqual({ family: 'Carlito', style: 'italic', weight: 'bold' })
  })
})

describe('emitText — tspan with single x/y', () => {
  it('uses tspan x/y when present (overrides element x/y)', () => {
    const root = build(
      `<svg xmlns="${SVG_NS}"><text id="t" x="0" y="0" font-size="6"><tspan x="10" y="20">Hi</tspan></text></svg>`,
    )
    const out = emitText(findById(root, 't'), ctx(), mockRegistry())
    expect(out).toContain(`1 0 0 1 ${f(10 * PT)} ${f(PAGE_H - 20 * PT)} Tm`)
    expect(out).toContain('(Hi) Tj')
  })

  it('falls back to element x/y when tspan lacks them', () => {
    const root = build(
      `<svg xmlns="${SVG_NS}"><text id="t" x="10" y="20" font-size="6"><tspan>Hi</tspan></text></svg>`,
    )
    const out = emitText(findById(root, 't'), ctx(), mockRegistry())
    expect(out).toContain(`1 0 0 1 ${f(10 * PT)} ${f(PAGE_H - 20 * PT)} Tm`)
  })

  it('multiple tspans each emit their own Tm + Tj', () => {
    const root = build(
      `<svg xmlns="${SVG_NS}"><text id="t" x="0" y="0" font-size="6"><tspan x="10" y="10">A</tspan><tspan x="20" y="20">B</tspan></text></svg>`,
    )
    const out = emitText(findById(root, 't'), ctx(), mockRegistry())
    expect(out).toContain(`1 0 0 1 ${f(10 * PT)} ${f(PAGE_H - 10 * PT)} Tm\n(A) Tj`)
    expect(out).toContain(`1 0 0 1 ${f(20 * PT)} ${f(PAGE_H - 20 * PT)} Tm\n(B) Tj`)
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
  it('emits one Tm + one Tj per character when x-array length > 1', () => {
    const root = build(
      `<svg xmlns="${SVG_NS}"><text id="t" font-size="6"><tspan x="10 20 30" y="50">ABC</tspan></text></svg>`,
    )
    const out = emitText(findById(root, 't'), ctx(), mockRegistry())
    const yPt = PAGE_H - 50 * PT
    expect(out).toContain(`1 0 0 1 ${f(10 * PT)} ${f(yPt)} Tm\n(A) Tj`)
    expect(out).toContain(`1 0 0 1 ${f(20 * PT)} ${f(yPt)} Tm\n(B) Tj`)
    expect(out).toContain(`1 0 0 1 ${f(30 * PT)} ${f(yPt)} Tm\n(C) Tj`)
  })

  it('reuses the last x value when array is shorter than text (matches pdfExport)', () => {
    const root = build(
      `<svg xmlns="${SVG_NS}"><text id="t" font-size="6"><tspan x="10 20" y="50">ABCD</tspan></text></svg>`,
    )
    const out = emitText(findById(root, 't'), ctx(), mockRegistry())
    // C and D both at x=20 (last array value)
    expect((out.match(new RegExp(`1 0 0 1 ${f(20 * PT)} `, 'g')) || []).length).toBe(3) // B, C, D
  })

  it('emits Tf only once even with many per-char Tj', () => {
    const root = build(
      `<svg xmlns="${SVG_NS}"><text id="t" font-size="6"><tspan x="10 20 30 40">ABCD</tspan></text></svg>`,
    )
    const out = emitText(findById(root, 't'), ctx(), mockRegistry())
    expect((out.match(/ Tf\n/g) || []).length).toBe(1)
  })
})

describe('emitText — string escaping', () => {
  it('escapes parentheses and backslash in text content', () => {
    const root = build(
      `<svg xmlns="${SVG_NS}"><text id="t" x="0" y="0">f(x)\\g</text></svg>`,
    )
    const out = emitText(findById(root, 't'), ctx(), mockRegistry())
    expect(out).toContain('(f\\(x\\)\\\\g) Tj')
  })

  it('does not escape other characters', () => {
    const root = build(
      `<svg xmlns="${SVG_NS}"><text id="t" x="0" y="0">Hello World!</text></svg>`,
    )
    const out = emitText(findById(root, 't'), ctx(), mockRegistry())
    expect(out).toContain('(Hello World!) Tj')
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
