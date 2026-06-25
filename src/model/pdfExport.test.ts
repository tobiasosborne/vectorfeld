/// <reference types="node" />
/**
 * Tests for the pdf-lib fallback export engine's rotation/skew handling on
 * non-text primitives (vectorfeld-3yu.16).
 *
 * Root cause being guarded against: rect/ellipse/circle used to be drawn via
 * pdf-lib's axis-aligned drawRectangle/drawEllipse/drawCircle, transforming a
 * SINGLE anchor through ctx.matrix and sizing the body with extractScale
 * (sqrt(a²+b²)/sqrt(c²+d²)) — which DISCARDS the off-diagonal rotation/skew
 * terms (matrix b, c). A rotated rect therefore exported axis-aligned.
 *
 * The fix routes those primitives through the SAME per-point path emission
 * that <path> already used (transformPathD → drawSvgPath), so EVERY point is
 * pushed through ctx.matrix and rotation survives.
 *
 * The pure tests below assert the geometric invariant directly: pushing the
 * shape's path corners/anchors through a rotation matrix yields points that
 * are NOT axis-aligned (the two top corners no longer share a Y, and the top
 * edge's endpoints no longer share an X). This is exactly the property the
 * old single-anchor + extractScale approach destroyed.
 *
 * The integration test parses the actual exported PDF content stream and
 * confirms it contains non-axis-aligned m/l/c path ops (not an `re`
 * rectangle op nor axis-aligned segments).
 */

import { describe, it, expect } from 'vitest'
import { PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib'
import { rectToPathD, ellipseToPathD, circleToPathD } from './shapeToPath'
import { parsePathD } from './pathOps'
import { applyMatrixToPoint, rotateMatrix, type Matrix } from './matrix'
import { svgStringToPdfBytes } from './pdfExport'

const EPS = 1e-6
const SVG_NS = 'http://www.w3.org/2000/svg'

/** Replicates pdfExport.transformPathD's per-point mapping (matrix → mm).
 *  The mm→pt scale is uniform and irrelevant to axis-alignment, so the pure
 *  tests work in matrix-space (pre-scale) for clarity. */
function pointsThroughMatrix(d: string, m: Matrix): Array<{ x: number; y: number }> {
  return parsePathD(d).flatMap((c) =>
    c.points.map((p) => applyMatrixToPoint(m, p.x, p.y)),
  )
}

describe('pdfExport rotation — pure per-point transform (vectorfeld-3yu.16)', () => {
  it('rotated rect: corners match applyMatrixToPoint and are NOT axis-aligned', () => {
    // A 10×10 rect at (20,20). Its first two path points (M then first L) are
    // the top-left and top-right corners.
    const x = 20, y = 20, w = 10, h = 10
    const m = rotateMatrix(30)
    const d = rectToPathD(x, y, w, h)
    const cmds = parsePathD(d)
    // rectToPathD (no rx/ry) → M tl, L tr, L br, L bl, Z
    const tl = cmds[0].points[0]
    const tr = cmds[1].points[0]
    const br = cmds[2].points[0]
    const bl = cmds[3].points[0]
    expect(tl).toEqual({ x, y })
    expect(tr).toEqual({ x: x + w, y })
    expect(br).toEqual({ x: x + w, y: y + h })
    expect(bl).toEqual({ x, y: y + h })

    const Tl = applyMatrixToPoint(m, tl.x, tl.y)
    const Tr = applyMatrixToPoint(m, tr.x, tr.y)
    const Bl = applyMatrixToPoint(m, bl.x, bl.y)

    // The transformed top edge (Tl→Tr) is no longer horizontal: its endpoints
    // differ in Y. Axis-aligned export would have kept Tl.y === Tr.y.
    expect(Math.abs(Tl.y - Tr.y)).toBeGreaterThan(0.1)
    // The transformed left edge (Tl→Bl) is no longer vertical: endpoints differ in X.
    expect(Math.abs(Tl.x - Bl.x)).toBeGreaterThan(0.1)

    // Sanity: a 30° rotation of a unit-axis offset. Top edge direction
    // (w,0) rotated → (w cos, w sin). So Tr - Tl == (w cos30, w sin30).
    const rad = (30 * Math.PI) / 180
    expect(Tr.x - Tl.x).toBeCloseTo(w * Math.cos(rad), 6)
    expect(Tr.y - Tl.y).toBeCloseTo(w * Math.sin(rad), 6)
  })

  it('rotated ellipse: bezier anchor/handle points rotate (not axis-aligned)', () => {
    const cx = 40, cy = 30, rx = 15, ry = 8
    const m = rotateMatrix(45)
    const d = ellipseToPathD(cx, cy, rx, ry)
    const before = pointsThroughMatrix(d, [1, 0, 0, 1, 0, 0]) // identity
    const after = pointsThroughMatrix(d, m)
    expect(after.length).toBe(before.length)

    // The ellipse's top anchor M(cx, cy-ry) and right anchor (cx+rx, cy) lie
    // on a horizontal/vertical pair pre-rotation; after a 45° rotation no two
    // distinct anchors share an axis with their pre-image. Concretely: the
    // top anchor (cx, cy-ry) and the bottom anchor (cx, cy+ry) shared an X
    // before rotation; after they must NOT.
    const topBefore = { x: cx, y: cy - ry }
    const botBefore = { x: cx, y: cy + ry }
    expect(topBefore.x).toBe(botBefore.x) // axis-aligned before
    const topAfter = applyMatrixToPoint(m, topBefore.x, topBefore.y)
    const botAfter = applyMatrixToPoint(m, botBefore.x, botBefore.y)
    expect(Math.abs(topAfter.x - botAfter.x)).toBeGreaterThan(0.1) // not after

    // And at least one transformed point genuinely moved off its identity image.
    const moved = after.some((p, i) =>
      Math.abs(p.x - before[i].x) > EPS || Math.abs(p.y - before[i].y) > EPS,
    )
    expect(moved).toBe(true)
  })

  it('rotated circle: top/bottom anchors no longer share an X after rotation', () => {
    const cx = 25, cy = 25, r = 12
    const m = rotateMatrix(30)
    const d = circleToPathD(cx, cy, r)
    // circleToPathD === ellipseToPathD(cx,cy,r,r): first point is top anchor.
    const cmds = parsePathD(d)
    const top = cmds[0].points[0]
    expect(top).toEqual({ x: cx, y: cy - r })

    const Top = applyMatrixToPoint(m, cx, cy - r)
    const Bot = applyMatrixToPoint(m, cx, cy + r)
    // Before rotation both anchors had x === cx. After a 30° rotation they
    // must differ in x — proving the off-diagonal terms are honoured.
    expect(Math.abs(Top.x - Bot.x)).toBeGreaterThan(0.1)
  })
})

describe('pdfExport rotation — integration via svgStringToPdfBytes', () => {
  it('rotate(30) rect exports as non-axis-aligned m/l/c path ops (no re, no axis-aligned edges)', async () => {
    const svg =
      `<svg xmlns="${SVG_NS}" viewBox="0 0 100 100">` +
      `<rect x="20" y="20" width="30" height="30" fill="#ff0000" transform="rotate(30 35 35)"/>` +
      `</svg>`
    const bytes = await svgStringToPdfBytes(svg)
    const pdf = await PDFDocument.load(bytes)
    // Pull the raw, decoded content stream text across all stream objects.
    const content = decodeAllContentStreams(pdf)

    // It must NOT use the axis-aligned rectangle operator.
    expect(content).not.toMatch(/\bre\b/)

    // It MUST contain path-construction ops (m / l). drawSvgPath emits these.
    expect(content).toMatch(/\bm\b/)
    expect(content).toMatch(/\bl\b/)

    // Collect (x,y) operands immediately preceding m/l ops and prove the
    // polygon is NOT an axis-aligned rectangle: a rotated rect's four corners
    // have four DISTINCT x-values and four DISTINCT y-values (an axis-aligned
    // rect would collapse to two of each).
    const pts = extractLineToPoints(content)
    expect(pts.length).toBeGreaterThanOrEqual(4)
    const xs = new Set(pts.slice(0, 4).map((p) => p.x.toFixed(2)))
    const ys = new Set(pts.slice(0, 4).map((p) => p.y.toFixed(2)))
    expect(xs.size).toBeGreaterThanOrEqual(3)
    expect(ys.size).toBeGreaterThanOrEqual(3)
  })
})

/** Decode every (possibly Flate-compressed) raw stream in the document into a
 *  single Latin-1 text blob. The exported rect's drawSvgPath ops live in the
 *  page content stream; scanning all streams avoids depending on pdf-lib's
 *  Contents indirection details. */
function decodeAllContentStreams(pdf: PDFDocument): string {
  let text = ''
  for (const [, obj] of pdf.context.enumerateIndirectObjects()) {
    if (obj instanceof PDFRawStream) {
      // decodePDFRawStream applies the stream's /Filter (Flate, etc.) and
      // returns the plain bytes; .decode() yields the Uint8Array.
      const decoded = decodePDFRawStream(obj).decode()
      text += latin1(decoded) + '\n'
    }
  }
  return text
}

function latin1(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return s
}

/** Extract the operand pair preceding each `m` or `l` operator. */
function extractLineToPoints(content: string): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = []
  const re = /(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+([ml])\b/g
  let mm: RegExpExecArray | null
  while ((mm = re.exec(content)) !== null) {
    out.push({ x: parseFloat(mm[1]), y: parseFloat(mm[2]) })
  }
  return out
}
