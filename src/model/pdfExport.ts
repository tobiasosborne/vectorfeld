/**
 * SVG → PDF export engine built on pdf-lib.
 *
 * Replaces svg2pdf.js (vectorfeld-9s9) which re-rendered text with its own
 * bundled font metrics, producing visibly-garbled body text on round-trip.
 * pdf-lib lets us embed actual fonts and have direct control over glyph
 * positioning, so text content survives the round-trip cleanly.
 *
 * MVP scope (this revision): handles <text> elements only. Subsequent
 * revisions extend coverage to path/rect/line/ellipse/image so that the
 * production exportPdf can be wired through here. Until then, production
 * exportPdf continues to use the svg2pdf path; this engine is reachable via
 * exportSvgStringToPdfBytes (test surface).
 *
 * Coordinate model:
 *   - vectorfeld viewBox is in mm. PDF pages are in pt.
 *   - Conversion: 1mm = 72/25.4 pt.
 *   - SVG Y axis is top-down; PDF Y axis is bottom-up. Flip per-element
 *     by computing pdfY = pageHeightPt - svgY * MM_TO_PT.
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib'

const MM_TO_PT = 72 / 25.4

interface Ctx {
  pdf: PDFDocument
  page: ReturnType<PDFDocument['addPage']>
  helvetica: PDFFont
  pageHeightPt: number
}

interface ViewBox {
  x: number
  y: number
  width: number
  height: number
}

function parseViewBox(s: string | null): ViewBox {
  if (!s) return { x: 0, y: 0, width: 210, height: 297 }
  const parts = s.trim().split(/[\s,]+/).map(parseFloat)
  if (parts.length !== 4 || parts.some(Number.isNaN)) {
    return { x: 0, y: 0, width: 210, height: 297 }
  }
  return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] }
}

function parseColor(s: string | null): ReturnType<typeof rgb> | undefined {
  if (!s || s === 'none') return undefined
  // #rgb / #rrggbb only for MVP; named colors and rgb() come later.
  const m3 = s.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i)
  if (m3) {
    const r = parseInt(m3[1] + m3[1], 16) / 255
    const g = parseInt(m3[2] + m3[2], 16) / 255
    const b = parseInt(m3[3] + m3[3], 16) / 255
    return rgb(r, g, b)
  }
  const m6 = s.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
  if (m6) {
    return rgb(parseInt(m6[1], 16) / 255, parseInt(m6[2], 16) / 255, parseInt(m6[3], 16) / 255)
  }
  if (s === 'black') return rgb(0, 0, 0)
  if (s === 'white') return rgb(1, 1, 1)
  return undefined
}

function drawText(el: Element, ctx: Ctx): void {
  const x = parseFloat(el.getAttribute('x') || '0')
  const y = parseFloat(el.getAttribute('y') || '0')
  const fontSize = parseFloat(el.getAttribute('font-size') || '12')
  const text = el.textContent || ''
  if (!text) return

  const fill = parseColor(el.getAttribute('fill')) ?? rgb(0, 0, 0)
  const xPt = x * MM_TO_PT
  // pdf-lib drawText y is the baseline; flip from SVG top-origin to PDF bottom-origin.
  const yPt = ctx.pageHeightPt - y * MM_TO_PT

  ctx.page.drawText(text, {
    x: xPt,
    y: yPt,
    font: ctx.helvetica,
    size: fontSize * MM_TO_PT,
    color: fill,
  })
}

function walk(el: Element, ctx: Ctx): void {
  const tag = el.tagName.toLowerCase()
  if (tag === 'text') {
    drawText(el, ctx)
    return
  }
  // Recurse into containers (<g>, <svg>, layers, etc.).
  for (const child of Array.from(el.children)) {
    walk(child, ctx)
  }
}

export async function svgStringToPdfBytes(svgString: string): Promise<Uint8Array> {
  const parser = new DOMParser()
  const doc = parser.parseFromString(svgString, 'image/svg+xml')
  const svg = doc.documentElement

  const vb = parseViewBox(svg.getAttribute('viewBox'))
  const widthPt = vb.width * MM_TO_PT
  const heightPt = vb.height * MM_TO_PT

  const pdf = await PDFDocument.create()
  const page = pdf.addPage([widthPt, heightPt])
  const helvetica = await pdf.embedFont(StandardFonts.Helvetica)

  const ctx: Ctx = { pdf, page, helvetica, pageHeightPt: heightPt }
  walk(svg, ctx)

  return pdf.save()
}
