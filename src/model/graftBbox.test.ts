import { describe, it, expect } from 'vitest'
import { elementBboxMm, mmBboxToPdfPt, elementBboxPdfPt } from './graftBbox'

const SVG_NS = 'http://www.w3.org/2000/svg'

function build(svg: string): Element {
  // Use DOMParser for proper SVG namespace handling.
  const dom = new DOMParser().parseFromString(svg, 'image/svg+xml')
  return dom.documentElement
}

function findById(root: Element, id: string): Element {
  return root.querySelector(`#${id}`)!
}

describe('elementBboxMm — local bbox per element type', () => {
  it('rect: { x, y, width, height }', () => {
    const root = build(`<svg xmlns="${SVG_NS}"><g><rect id="r" x="10" y="20" width="30" height="40"/></g></svg>`)
    expect(elementBboxMm(findById(root, 'r'))).toEqual({ x: 10, y: 20, width: 30, height: 40 })
  })

  it('circle: 2r square centered on (cx, cy)', () => {
    const root = build(`<svg xmlns="${SVG_NS}"><g><circle id="c" cx="50" cy="40" r="5"/></g></svg>`)
    expect(elementBboxMm(findById(root, 'c'))).toEqual({ x: 45, y: 35, width: 10, height: 10 })
  })

  it('ellipse: 2rx × 2ry rect centered on (cx, cy)', () => {
    const root = build(`<svg xmlns="${SVG_NS}"><g><ellipse id="e" cx="20" cy="20" rx="10" ry="3"/></g></svg>`)
    expect(elementBboxMm(findById(root, 'e'))).toEqual({ x: 10, y: 17, width: 20, height: 6 })
  })

  it('line: AABB across both endpoints', () => {
    const root = build(`<svg xmlns="${SVG_NS}"><g><line id="l" x1="5" y1="30" x2="25" y2="10"/></g></svg>`)
    expect(elementBboxMm(findById(root, 'l'))).toEqual({ x: 5, y: 10, width: 20, height: 20 })
  })

  it('path: walks d command points to find AABB', () => {
    const root = build(`<svg xmlns="${SVG_NS}"><g><path id="p" d="M 10 10 L 30 25 L 5 40 Z"/></g></svg>`)
    expect(elementBboxMm(findById(root, 'p'))).toEqual({ x: 5, y: 10, width: 25, height: 30 })
  })

  it('image: rect with x/y/width/height', () => {
    const root = build(`<svg xmlns="${SVG_NS}"><g><image id="i" x="0" y="0" width="50" height="40"/></g></svg>`)
    expect(elementBboxMm(findById(root, 'i'))).toEqual({ x: 0, y: 0, width: 50, height: 40 })
  })

  it('text: conservative box around the baseline (overshoot is safe for masking)', () => {
    // Text baselines sit at y; glyphs extend upward by ~font-size * (ascent ratio).
    // We use a conservative approximation: box top is y - fontSize, bottom is
    // y + fontSize * 0.3 (descender). Width: char-count * fontSize * 0.55.
    const root = build(
      `<svg xmlns="${SVG_NS}"><g><text id="t" x="10" y="20" font-size="6">Hi</text></g></svg>`,
    )
    const b = elementBboxMm(findById(root, 't'))!
    expect(b.x).toBeCloseTo(10)
    expect(b.y).toBeCloseTo(20 - 6) // top of glyph above baseline
    expect(b.width).toBeGreaterThan(0)
    expect(b.height).toBeGreaterThan(0)
    // Box should at minimum span the font-size in height (glyph + descender)
    expect(b.height).toBeGreaterThanOrEqual(6)
  })

  it('returns null for container <g>', () => {
    const root = build(`<svg xmlns="${SVG_NS}"><g id="g"/></svg>`)
    expect(elementBboxMm(findById(root, 'g'))).toBeNull()
  })

  describe('tspan-wrapped text (MuPDF import shape) — vectorfeld-38q', () => {
    it('honours tspan y over element y when computing bbox top', () => {
      // MuPDF emits text with no element-level y/font-size and instead
      // puts everything on the tspan. Element-level y defaults to 0.
      const root = build(
        `<svg xmlns="${SVG_NS}"><g><text id="t"><tspan x="20" y="50" font-size="6">Hi</tspan></text></g></svg>`,
      )
      const b = elementBboxMm(findById(root, 't'))!
      // Baseline at 50, fontSize 6 → top at 44 (NOT 0 - 12 = -12).
      expect(b.y).toBeCloseTo(50 - 6)
      expect(b.height).toBeCloseTo(6 * 1.3)
    })

    it('honours tspan font-size over element font-size', () => {
      const root = build(
        `<svg xmlns="${SVG_NS}"><g><text id="t" font-size="100"><tspan x="20" y="50" font-size="6">Hi</tspan></text></g></svg>`,
      )
      const b = elementBboxMm(findById(root, 't'))!
      // Bbox should follow the tspan (size 6), NOT the element (size 100).
      expect(b.height).toBeCloseTo(6 * 1.3)
    })

    it('multiple tspans at different y positions: bbox spans top of highest to bottom of lowest', () => {
      const root = build(
        `<svg xmlns="${SVG_NS}"><g><text id="t"><tspan x="0" y="20" font-size="4">A</tspan><tspan x="10" y="50" font-size="6">B</tspan></text></g></svg>`,
      )
      const b = elementBboxMm(findById(root, 't'))!
      // Top: min(20-4, 50-6) = 16. Bottom: max(20+4*0.3, 50+6*0.3) = 51.8.
      // y = 16, height = 51.8 - 16 = 35.8.
      expect(b.y).toBeCloseTo(16)
      expect(b.height).toBeCloseTo(35.8)
    })

    it('tspan y-array: takes min for top and max for bottom', () => {
      const root = build(
        `<svg xmlns="${SVG_NS}"><g><text id="t"><tspan x="0 5 10" y="10 15 20" font-size="4">ABC</tspan></text></g></svg>`,
      )
      const b = elementBboxMm(findById(root, 't'))!
      // Highest baseline 10 → top 6. Lowest baseline 20 → bottom 21.2.
      expect(b.y).toBeCloseTo(6)
      expect(b.height).toBeCloseTo(15.2)
    })

    it('tspan inherits y from element when not set', () => {
      const root = build(
        `<svg xmlns="${SVG_NS}"><g><text id="t" y="40"><tspan x="20" font-size="6">Hi</tspan></text></g></svg>`,
      )
      const b = elementBboxMm(findById(root, 't'))!
      expect(b.y).toBeCloseTo(40 - 6)
    })

    it('tspan inherits font-size from element when not set', () => {
      const root = build(
        `<svg xmlns="${SVG_NS}"><g><text id="t" font-size="8"><tspan x="20" y="40">Hi</tspan></text></g></svg>`,
      )
      const b = elementBboxMm(findById(root, 't'))!
      expect(b.height).toBeCloseTo(8 * 1.3)
    })
  })
})

describe('elementBboxMm — composed ancestor transforms', () => {
  it('translate(5, 10) on parent shifts the bbox', () => {
    const root = build(
      `<svg xmlns="${SVG_NS}"><g transform="translate(5 10)"><rect id="r" x="10" y="20" width="30" height="40"/></g></svg>`,
    )
    expect(elementBboxMm(findById(root, 'r'))).toEqual({ x: 15, y: 30, width: 30, height: 40 })
  })

  it('scale(2) on parent multiplies width/height/origin', () => {
    const root = build(
      `<svg xmlns="${SVG_NS}"><g transform="scale(2)"><rect id="r" x="5" y="10" width="3" height="4"/></g></svg>`,
    )
    expect(elementBboxMm(findById(root, 'r'))).toEqual({ x: 10, y: 20, width: 6, height: 8 })
  })

  it('honours element-own transform AND ancestor transforms (composed)', () => {
    const root = build(
      `<svg xmlns="${SVG_NS}"><g transform="translate(100 0)"><rect id="r" transform="translate(0 50)" x="0" y="0" width="10" height="10"/></g></svg>`,
    )
    expect(elementBboxMm(findById(root, 'r'))).toEqual({ x: 100, y: 50, width: 10, height: 10 })
  })
})

describe('mmBboxToPdfPt', () => {
  // 1 mm = 72/25.4 pt ≈ 2.83465 pt
  const PT = 72 / 25.4

  it('flips Y relative to pageHeightPt and converts mm→pt', () => {
    const pageHpt = 297 * PT // A4 portrait
    const r = mmBboxToPdfPt({ x: 10, y: 20, width: 50, height: 40 }, pageHpt)
    expect(r.x).toBeCloseTo(10 * PT, 4)
    // Top-left mm corner (x=10, y=20) → bottom-left pdf corner.
    // In PDF coords: y_pdf_bottom = pageHpt - (mmY+mmH) * PT
    expect(r.y).toBeCloseTo(pageHpt - (20 + 40) * PT, 4)
    expect(r.w).toBeCloseTo(50 * PT, 4)
    expect(r.h).toBeCloseTo(40 * PT, 4)
  })
})

describe('elementBboxPdfPt — composition', () => {
  const PT = 72 / 25.4

  it('returns the mm bbox transformed to PDF coords with Y-flip', () => {
    const root = build(`<svg xmlns="${SVG_NS}"><g><rect id="r" x="0" y="0" width="10" height="10"/></g></svg>`)
    const r = elementBboxPdfPt(findById(root, 'r'), 100 * PT)!
    expect(r.x).toBeCloseTo(0, 4)
    expect(r.y).toBeCloseTo((100 - 10) * PT, 4)
    expect(r.w).toBeCloseTo(10 * PT, 4)
    expect(r.h).toBeCloseTo(10 * PT, 4)
  })

  it('returns null for non-graphical elements', () => {
    const root = build(`<svg xmlns="${SVG_NS}"><g id="g"><defs id="d"/></g></svg>`)
    expect(elementBboxPdfPt(findById(root, 'g'), 100)).toBeNull()
    expect(elementBboxPdfPt(findById(root, 'd'), 100)).toBeNull()
  })
})
