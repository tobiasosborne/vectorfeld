/**
 * Element bounding-box computation in document mm-space and in PDF points.
 *
 * The graft engine (`vectorfeld-wjj`) uses these for the mask-rect side of
 * the "mask + re-render" path: when a source element has been edited since
 * import, we need a rectangle in PDF coords that covers the original
 * rendering so the overlay content stream can paint it out before drawing
 * the edited state on top.
 *
 * Pure: no DOM mutation, no I/O. Conservative bias for text — overshoot is
 * safe for masking; undershoot would let the original glyphs poke through.
 */

import { parsePathD } from './pathOps'
import {
  parseTransform,
  multiplyMatrix,
  applyMatrixToPoint,
  identityMatrix,
  type Matrix,
} from './matrix'
import type { BBox } from './geometry'

const MM_TO_PT = 72 / 25.4

/** PDF rectangle in points, with the Y-axis already flipped (PDF origin
 *  is bottom-left). */
export interface PdfRect {
  x: number
  y: number
  w: number
  h: number
}

/**
 * Local-space bbox per element type. Returns null for elements that don't
 * have a meaningful AABB (containers, defs, missing geometry attrs).
 */
function localBbox(el: Element): BBox | null {
  const tag = el.tagName.toLowerCase()
  switch (tag) {
    case 'rect':
    case 'image':
      return rectBox(el)
    case 'circle':
      return circleBox(el)
    case 'ellipse':
      return ellipseBox(el)
    case 'line':
      return lineBox(el)
    case 'polygon':
    case 'polyline':
      return polyBox(el)
    case 'path':
      return pathBox(el)
    case 'text':
      return textBox(el)
  }
  return null
}

function num(el: Element, name: string, fallback = 0): number {
  const v = el.getAttribute(name)
  return v === null ? fallback : parseFloat(v)
}

function rectBox(el: Element): BBox | null {
  const w = num(el, 'width')
  const h = num(el, 'height')
  if (w <= 0 || h <= 0) return null
  return { x: num(el, 'x'), y: num(el, 'y'), width: w, height: h }
}

function circleBox(el: Element): BBox | null {
  const r = num(el, 'r')
  if (r <= 0) return null
  return { x: num(el, 'cx') - r, y: num(el, 'cy') - r, width: 2 * r, height: 2 * r }
}

function ellipseBox(el: Element): BBox | null {
  const rx = num(el, 'rx')
  const ry = num(el, 'ry')
  if (rx <= 0 || ry <= 0) return null
  return { x: num(el, 'cx') - rx, y: num(el, 'cy') - ry, width: 2 * rx, height: 2 * ry }
}

function lineBox(el: Element): BBox {
  const x1 = num(el, 'x1')
  const y1 = num(el, 'y1')
  const x2 = num(el, 'x2')
  const y2 = num(el, 'y2')
  const minX = Math.min(x1, x2)
  const minY = Math.min(y1, y2)
  return { x: minX, y: minY, width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) }
}

function polyBox(el: Element): BBox | null {
  const pts = (el.getAttribute('points') || '').trim()
  if (!pts) return null
  const nums = pts.split(/[\s,]+/).map(parseFloat).filter((n) => !Number.isNaN(n))
  if (nums.length < 2) return null
  return aabbFromPoints(nums)
}

function pathBox(el: Element): BBox | null {
  const d = el.getAttribute('d')
  if (!d) return null
  const cmds = parsePathD(d)
  const xs: number[] = []
  for (const c of cmds) {
    for (const p of c.points) {
      xs.push(p.x, p.y)
    }
  }
  if (xs.length < 2) return null
  return aabbFromPoints(xs)
}

function aabbFromPoints(flat: number[]): BBox {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (let i = 0; i + 1 < flat.length; i += 2) {
    const x = flat[i]
    const y = flat[i + 1]
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/**
 * Conservative text bbox.
 * - Top of glyph: baseline_y - fontSize (ascender approx).
 * - Bottom of glyph: baseline_y + fontSize * 0.3 (descender approx).
 * - Width: count chars × fontSize × 0.55 (approximate Latin glyph advance).
 * - When the element has tspan children, EACH tspan contributes its own
 *   y / font-size / x-array; the bbox is the union of per-tspan boxes.
 *   This matters for MuPDF-imported text where the parent <text> often
 *   has default y=0 / font-size=12 and all the real values live on the
 *   tspans (vectorfeld-38q).
 *
 * Real font metrics would shave off a few percent, but for masking we
 * want over-coverage so source glyphs don't poke through.
 */
function textBox(el: Element): BBox | null {
  const elFontSize = num(el, 'font-size', 12)
  const elX = num(el, 'x')
  const elY = num(el, 'y')

  const tspans = Array.from(el.children).filter((c) => c.tagName.toLowerCase() === 'tspan')

  if (tspans.length === 0) {
    const txt = el.textContent || ''
    if (!txt) return null
    return {
      x: elX,
      y: elY - elFontSize,
      width: txt.length * elFontSize * 0.55,
      height: elFontSize * 1.3,
    }
  }

  let minX = Infinity
  let maxX = -Infinity
  let minTop = Infinity
  let maxBottom = -Infinity
  let charCount = 0

  for (const tspan of tspans) {
    const txt = tspan.textContent || ''
    const tspanCount = txt.length
    if (tspanCount === 0) continue

    const xAttr = tspan.getAttribute('x') ?? String(elX)
    const yAttr = tspan.getAttribute('y') ?? String(elY)
    const xs = xAttr.trim().split(/\s+/).map(parseFloat).filter((n) => !Number.isNaN(n))
    const ys = yAttr.trim().split(/\s+/).map(parseFloat).filter((n) => !Number.isNaN(n))
    if (xs.length === 0 || ys.length === 0) continue
    const tspanFontSize = parseFloat(tspan.getAttribute('font-size') ?? String(elFontSize))

    const localMinX = Math.min(...xs)
    const localMaxX = Math.max(...xs)
    const advance = tspanCount * tspanFontSize * 0.55
    const tspanMaxX = xs.length >= tspanCount ? localMaxX : localMaxX + advance
    if (localMinX < minX) minX = localMinX
    if (tspanMaxX > maxX) maxX = tspanMaxX

    const minBaseline = Math.min(...ys)
    const maxBaseline = Math.max(...ys)
    const top = minBaseline - tspanFontSize
    const bottom = maxBaseline + tspanFontSize * 0.3
    if (top < minTop) minTop = top
    if (bottom > maxBottom) maxBottom = bottom

    charCount += tspanCount
  }

  if (charCount === 0) return null

  return {
    x: minX,
    y: minTop,
    width: maxX - minX,
    height: maxBottom - minTop,
  }
}

/** Walk up `el`'s ancestor chain accumulating `transform` attributes into a
 *  composed mm-space matrix. Stops at the document root. */
function ancestorMatrix(el: Element): Matrix {
  let m = identityMatrix()
  for (let cur: Element | null = el; cur !== null; cur = cur.parentElement) {
    const t = cur.getAttribute('transform')
    if (t) {
      // Parent transforms apply OUTSIDE the local frame, so they multiply
      // on the LEFT of the cumulative matrix. We walk leaf → root, so each
      // step prepends.
      m = multiplyMatrix(parseTransform(t), m)
    }
  }
  return m
}

/**
 * AABB of `el` after composing the element's own transform AND every
 * ancestor's transform. Returns null for non-graphical elements.
 */
export function elementBboxMm(el: Element): BBox | null {
  const local = localBbox(el)
  if (!local) return null
  const m = ancestorMatrix(el)
  if (isIdentity(m)) return local

  const corners = [
    applyMatrixToPoint(m, local.x, local.y),
    applyMatrixToPoint(m, local.x + local.width, local.y),
    applyMatrixToPoint(m, local.x + local.width, local.y + local.height),
    applyMatrixToPoint(m, local.x, local.y + local.height),
  ]
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const c of corners) {
    if (c.x < minX) minX = c.x
    if (c.x > maxX) maxX = c.x
    if (c.y < minY) minY = c.y
    if (c.y > maxY) maxY = c.y
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

function isIdentity(m: Matrix): boolean {
  return m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1 && m[4] === 0 && m[5] === 0
}

/** mm bbox → PDF pt rect with Y-axis flipped against pageHeightPt. */
export function mmBboxToPdfPt(b: BBox, pageHeightPt: number): PdfRect {
  return {
    x: b.x * MM_TO_PT,
    y: pageHeightPt - (b.y + b.height) * MM_TO_PT,
    w: b.width * MM_TO_PT,
    h: b.height * MM_TO_PT,
  }
}

/** Convenience: elementBboxMm composed with mmBboxToPdfPt. */
export function elementBboxPdfPt(el: Element, pageHeightPt: number): PdfRect | null {
  const b = elementBboxMm(el)
  return b ? mmBboxToPdfPt(b, pageHeightPt) : null
}
