import { describe, it, expect } from 'vitest'
import {
  parseColor,
  emitRect,
  emitLine,
  emitCircle,
  emitEllipse,
  emitPath,
} from './graftCs'
import { identityMatrix, translateMatrix, scaleMatrix, multiplyMatrix, rotateMatrix } from './matrix'

const SVG_NS = 'http://www.w3.org/2000/svg'
const PT = 72 / 25.4
const PAGE_H = 297 * PT // A4 portrait, in pt

function build(svg: string): Element {
  return new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement
}

function findById(root: Element, id: string): Element {
  return root.querySelector(`#${id}`)!
}

function ctx(matrix = identityMatrix(), pageHeightPt = PAGE_H) {
  return { matrix, pageHeightPt }
}

/**
 * Mirror of the production `fmt` numeric formatter. Defined here independently
 * so that a regression in the production formatter is caught (we don't import
 * fmt — that would test it against itself).
 */
function f(n: number): string {
  if (!Number.isFinite(n)) return '0'
  const s = n.toFixed(3)
  return s.replace(/\.?0+$/, '') || '0'
}

// ---------------------------------------------------------------------------
// parseColor
// ---------------------------------------------------------------------------

describe('parseColor', () => {
  it('parses #rrggbb to 0–1 components', () => {
    const c = parseColor('#ff8000')!
    expect(c.r).toBeCloseTo(1, 6)
    expect(c.g).toBeCloseTo(128 / 255, 6)
    expect(c.b).toBeCloseTo(0, 6)
  })

  it('parses #rgb expanding each digit', () => {
    const c = parseColor('#f80')!
    expect(c.r).toBeCloseTo(1, 6)
    expect(c.g).toBeCloseTo(0x88 / 255, 6)
    expect(c.b).toBeCloseTo(0, 6)
  })

  it('hex parsing is case-insensitive', () => {
    expect(parseColor('#abcdef')).toEqual(parseColor('#ABCDEF'))
  })

  it('named "black" → {0,0,0}', () => {
    expect(parseColor('black')).toEqual({ r: 0, g: 0, b: 0 })
  })

  it('named "white" → {1,1,1}', () => {
    expect(parseColor('white')).toEqual({ r: 1, g: 1, b: 1 })
  })

  it('"none" → null', () => {
    expect(parseColor('none')).toBeNull()
  })

  it('null / undefined / "" → null', () => {
    expect(parseColor(null)).toBeNull()
    expect(parseColor(undefined)).toBeNull()
    expect(parseColor('')).toBeNull()
  })

  it('unknown formats → null (matches pdfExport MVP scope)', () => {
    expect(parseColor('rgb(1,2,3)')).toBeNull()
    expect(parseColor('purple')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// emitRect — decomposed to 4-corner path; transforms and Y-flip applied
// ---------------------------------------------------------------------------

describe('emitRect', () => {
  it('returns "" when no fill and no stroke', () => {
    const root = build(`<svg xmlns="${SVG_NS}"><rect id="r" x="0" y="0" width="10" height="10"/></svg>`)
    expect(emitRect(findById(root, 'r'), ctx())).toBe('')
  })

  it('returns "" for zero or negative width/height', () => {
    const root = build(
      `<svg xmlns="${SVG_NS}"><rect id="a" x="0" y="0" width="0" height="10" fill="red"/><rect id="b" x="0" y="0" width="-1" height="10" fill="red"/><rect id="c" x="0" y="0" width="10" height="0" fill="red"/></svg>`,
    )
    expect(emitRect(findById(root, 'a'), ctx())).toBe('')
    expect(emitRect(findById(root, 'b'), ctx())).toBe('')
    expect(emitRect(findById(root, 'c'), ctx())).toBe('')
  })

  it('fill-only: q + rg + 4-corner path + h + f + Q (Y-flipped against page height)', () => {
    const root = build(
      `<svg xmlns="${SVG_NS}"><rect id="r" x="10" y="20" width="30" height="40" fill="#ff0000"/></svg>`,
    )
    const out = emitRect(findById(root, 'r'), ctx())
    const x0 = 10 * PT
    const y0 = PAGE_H - 20 * PT // top-left in PDF (svg-tl Y-flipped)
    const x1 = (10 + 30) * PT
    const y1 = PAGE_H - (20 + 40) * PT // bottom-left in PDF
    expect(out).toBe(
      'q\n' +
        '1 0 0 rg\n' +
        `${f(x0)} ${f(y0)} m\n` +
        `${f(x1)} ${f(y0)} l\n` +
        `${f(x1)} ${f(y1)} l\n` +
        `${f(x0)} ${f(y1)} l\n` +
        'h\n' +
        'f\n' +
        'Q\n',
    )
  })

  it('stroke-only: q + RG + w + path + S + Q (default stroke-width 0)', () => {
    const root = build(
      `<svg xmlns="${SVG_NS}"><rect id="r" x="0" y="0" width="10" height="10" stroke="black"/></svg>`,
    )
    const out = emitRect(findById(root, 'r'), ctx())
    expect(out).toContain('0 0 0 RG')
    expect(out).toContain(' w\n')
    expect(out.trimEnd().endsWith('S\nQ')).toBe(true)
    expect(out).not.toContain('rg')
    expect(out).not.toContain(' f\n')
  })

  it('fill-and-stroke: emits both colors, both ops, B paint operator', () => {
    const root = build(
      `<svg xmlns="${SVG_NS}"><rect id="r" x="0" y="0" width="10" height="10" fill="white" stroke="black" stroke-width="2"/></svg>`,
    )
    const out = emitRect(findById(root, 'r'), ctx())
    expect(out).toContain('1 1 1 rg')
    expect(out).toContain('0 0 0 RG')
    expect(out).toContain(`${f(2 * PT)} w`)
    expect(out.trimEnd().endsWith('B\nQ')).toBe(true)
  })

  it('translate ancestor matrix shifts all 4 corners equally', () => {
    const root = build(
      `<svg xmlns="${SVG_NS}"><rect id="r" x="0" y="0" width="10" height="10" fill="black"/></svg>`,
    )
    const out = emitRect(findById(root, 'r'), ctx(translateMatrix(5, 5)))
    // svg corners now (5,5) → (15,15). PDF: x=5*PT, y=PAGE_H-5*PT, etc.
    const x0 = 5 * PT
    const y0 = PAGE_H - 5 * PT
    const x1 = 15 * PT
    const y1 = PAGE_H - 15 * PT
    expect(out).toContain(`${f(x0)} ${f(y0)} m`)
    expect(out).toContain(`${f(x1)} ${f(y0)} l`)
    expect(out).toContain(`${f(x1)} ${f(y1)} l`)
    expect(out).toContain(`${f(x0)} ${f(y1)} l`)
  })

  it('rotation in ancestor matrix rotates corners correctly (each transformed individually)', () => {
    // 90° rotation around origin: (x, y) → (-y, x)
    const root = build(
      `<svg xmlns="${SVG_NS}"><rect id="r" x="10" y="0" width="20" height="5" fill="black"/></svg>`,
    )
    const out = emitRect(findById(root, 'r'), ctx(rotateMatrix(90)))
    // Corner (10, 0) → (0, 10); (30, 0) → (0, 30); (30, 5) → (-5, 30); (10, 5) → (-5, 10)
    // PDF: x_pdf = mm_x * PT; y_pdf = PAGE_H - mm_y * PT
    const c0 = { x: 0, y: PAGE_H - 10 * PT }
    const c1 = { x: 0, y: PAGE_H - 30 * PT }
    const c2 = { x: -5 * PT, y: PAGE_H - 30 * PT }
    const c3 = { x: -5 * PT, y: PAGE_H - 10 * PT }
    expect(out).toContain(`${f(c0.x)} ${f(c0.y)} m`)
    expect(out).toContain(`${f(c1.x)} ${f(c1.y)} l`)
    expect(out).toContain(`${f(c2.x)} ${f(c2.y)} l`)
    expect(out).toContain(`${f(c3.x)} ${f(c3.y)} l`)
  })

  it('scales stroke-width by extractScale(matrix).sx', () => {
    const root = build(
      `<svg xmlns="${SVG_NS}"><rect id="r" x="0" y="0" width="10" height="10" stroke="black" stroke-width="1"/></svg>`,
    )
    // scale(3) → sx=3, so stroke-width is 1 * 3 * PT
    const out = emitRect(findById(root, 'r'), ctx(scaleMatrix(3, 3)))
    expect(out).toContain(`${f(3 * PT)} w`)
  })
})

// ---------------------------------------------------------------------------
// emitLine — m + l + S; defaults to black, 0.25mm stroke (matches pdfExport)
// ---------------------------------------------------------------------------

describe('emitLine', () => {
  it('default stroke: black at 0.25mm scaled to PDF pt', () => {
    const root = build(
      `<svg xmlns="${SVG_NS}"><line id="l" x1="0" y1="0" x2="10" y2="0"/></svg>`,
    )
    const out = emitLine(findById(root, 'l'), ctx())
    expect(out).toContain('0 0 0 RG')
    expect(out).toContain(`${f(0.25 * PT)} w`)
    expect(out).toContain(`${f(0)} ${f(PAGE_H)} m`)
    expect(out).toContain(`${f(10 * PT)} ${f(PAGE_H)} l`)
    expect(out.trimEnd().endsWith('S\nQ')).toBe(true)
  })

  it('respects custom stroke color and width', () => {
    const root = build(
      `<svg xmlns="${SVG_NS}"><line id="l" x1="0" y1="0" x2="10" y2="0" stroke="#ff0000" stroke-width="2"/></svg>`,
    )
    const out = emitLine(findById(root, 'l'), ctx())
    expect(out).toContain('1 0 0 RG')
    expect(out).toContain(`${f(2 * PT)} w`)
  })

  it('endpoints transformed individually under ancestor rotation', () => {
    // 90° rotation: (10, 0) → (0, 10); (30, 0) → (0, 30)
    const root = build(
      `<svg xmlns="${SVG_NS}"><line id="l" x1="10" y1="0" x2="30" y2="0" stroke="black"/></svg>`,
    )
    const out = emitLine(findById(root, 'l'), ctx(rotateMatrix(90)))
    expect(out).toContain(`${f(0)} ${f(PAGE_H - 10 * PT)} m`)
    expect(out).toContain(`${f(0)} ${f(PAGE_H - 30 * PT)} l`)
  })

  it('does not emit fill ops', () => {
    const root = build(
      `<svg xmlns="${SVG_NS}"><line id="l" x1="0" y1="0" x2="10" y2="10" stroke="black"/></svg>`,
    )
    const out = emitLine(findById(root, 'l'), ctx())
    expect(out).not.toContain(' rg\n')
    expect(out).not.toContain(' f\n')
    expect(out).not.toContain(' B\n')
  })
})

// ---------------------------------------------------------------------------
// emitCircle / emitEllipse — decomposed to 4 cubic Béziers via KAPPA
// ---------------------------------------------------------------------------

describe('emitCircle', () => {
  it('returns "" for zero radius', () => {
    const root = build(`<svg xmlns="${SVG_NS}"><circle id="c" cx="50" cy="50" r="0" fill="red"/></svg>`)
    expect(emitCircle(findById(root, 'c'), ctx())).toBe('')
  })

  it('returns "" with no fill and no stroke', () => {
    const root = build(`<svg xmlns="${SVG_NS}"><circle id="c" cx="50" cy="50" r="10"/></svg>`)
    expect(emitCircle(findById(root, 'c'), ctx())).toBe('')
  })

  it('fill-only: emits q + rg + M + 4×C + h + f + Q (5 path ops total)', () => {
    const root = build(
      `<svg xmlns="${SVG_NS}"><circle id="c" cx="50" cy="50" r="10" fill="black"/></svg>`,
    )
    const out = emitCircle(findById(root, 'c'), ctx())
    expect(out.startsWith('q\n')).toBe(true)
    expect(out).toContain('0 0 0 rg')
    expect((out.match(/ m\n/g) || []).length).toBe(1)
    expect((out.match(/ c\n/g) || []).length).toBe(4)
    expect(out).toContain('h\n')
    expect(out.trimEnd().endsWith('f\nQ')).toBe(true)
  })

  it('first M starts at the top of the circle in PDF coords (cy − r in mm → flipped)', () => {
    const root = build(
      `<svg xmlns="${SVG_NS}"><circle id="c" cx="50" cy="40" r="10" fill="black"/></svg>`,
    )
    const out = emitCircle(findById(root, 'c'), ctx())
    // ellipseToPathD starts at (cx, cy - r) → (50, 30) mm. PDF: (50*PT, PAGE_H - 30*PT).
    expect(out).toContain(`${f(50 * PT)} ${f(PAGE_H - 30 * PT)} m`)
  })
})

describe('emitEllipse', () => {
  it('returns "" for zero rx or ry', () => {
    const root = build(`<svg xmlns="${SVG_NS}"><ellipse id="e" cx="50" cy="50" rx="0" ry="10" fill="red"/></svg>`)
    expect(emitEllipse(findById(root, 'e'), ctx())).toBe('')
  })

  it('rx ≠ ry: 4 cubic Béziers using each radius independently', () => {
    const root = build(
      `<svg xmlns="${SVG_NS}"><ellipse id="e" cx="20" cy="20" rx="10" ry="3" fill="black"/></svg>`,
    )
    const out = emitEllipse(findById(root, 'e'), ctx())
    // Top of ellipse: (cx, cy - ry) = (20, 17) mm
    expect(out).toContain(`${f(20 * PT)} ${f(PAGE_H - 17 * PT)} m`)
    expect((out.match(/ c\n/g) || []).length).toBe(4)
  })
})

// ---------------------------------------------------------------------------
// emitPath — parsePathD → transformed point-by-point → m/l/c/h
// ---------------------------------------------------------------------------

describe('emitPath', () => {
  it('returns "" when no d attribute', () => {
    const root = build(`<svg xmlns="${SVG_NS}"><path id="p" fill="black"/></svg>`)
    expect(emitPath(findById(root, 'p'), ctx())).toBe('')
  })

  it('returns "" with no fill and no stroke (matches other shapes)', () => {
    const root = build(`<svg xmlns="${SVG_NS}"><path id="p" d="M0 0 L10 10"/></svg>`)
    expect(emitPath(findById(root, 'p'), ctx())).toBe('')
  })

  it('M + L → m + l (with Y-flip)', () => {
    const root = build(
      `<svg xmlns="${SVG_NS}"><path id="p" d="M 10 20 L 30 40" stroke="black" stroke-width="1"/></svg>`,
    )
    const out = emitPath(findById(root, 'p'), ctx())
    expect(out).toContain(`${f(10 * PT)} ${f(PAGE_H - 20 * PT)} m`)
    expect(out).toContain(`${f(30 * PT)} ${f(PAGE_H - 40 * PT)} l`)
  })

  it('C → c (3 control points emitted, all Y-flipped)', () => {
    const root = build(
      `<svg xmlns="${SVG_NS}"><path id="p" d="M 0 0 C 10 0 20 10 30 10" fill="black"/></svg>`,
    )
    const out = emitPath(findById(root, 'p'), ctx())
    expect(out).toContain(
      `${f(10 * PT)} ${f(PAGE_H)} ${f(20 * PT)} ${f(PAGE_H - 10 * PT)} ${f(30 * PT)} ${f(PAGE_H - 10 * PT)} c`,
    )
  })

  it('Z → h (close path)', () => {
    const root = build(
      `<svg xmlns="${SVG_NS}"><path id="p" d="M 0 0 L 10 0 L 10 10 Z" fill="black"/></svg>`,
    )
    const out = emitPath(findById(root, 'p'), ctx())
    expect(out).toContain('h\n')
  })

  it('default stroke-width is 1 (mirrors pdfExport drawPath)', () => {
    const root = build(
      `<svg xmlns="${SVG_NS}"><path id="p" d="M 0 0 L 10 0" stroke="black"/></svg>`,
    )
    const out = emitPath(findById(root, 'p'), ctx())
    expect(out).toContain(`${f(1 * PT)} w`)
  })

  it('composes ancestor matrix (translate + scale)', () => {
    const matrix = multiplyMatrix(translateMatrix(5, 5), scaleMatrix(2, 2))
    const root = build(
      `<svg xmlns="${SVG_NS}"><path id="p" d="M 0 0 L 10 0" fill="black"/></svg>`,
    )
    const out = emitPath(findById(root, 'p'), ctx(matrix))
    // (0,0) → (5,5); (10,0) → (25,5)
    expect(out).toContain(`${f(5 * PT)} ${f(PAGE_H - 5 * PT)} m`)
    expect(out).toContain(`${f(25 * PT)} ${f(PAGE_H - 5 * PT)} l`)
  })

  it('handles arc (A) by parsePathD’s line-to-endpoint approximation', () => {
    // parsePathD converts A to L (line to endpoint). Mirror that semantics.
    const root = build(
      `<svg xmlns="${SVG_NS}"><path id="p" d="M 0 0 A 5 5 0 0 1 10 10" stroke="black"/></svg>`,
    )
    const out = emitPath(findById(root, 'p'), ctx())
    expect(out).toContain(`${f(0)} ${f(PAGE_H)} m`)
    expect(out).toContain(`${f(10 * PT)} ${f(PAGE_H - 10 * PT)} l`)
  })
})
