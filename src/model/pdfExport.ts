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
import { parsePathD, commandsToD, type PathCommand } from './pathOps'

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

/**
 * Transform a path d-string from SVG (mm, top-left origin) to PDF (pt,
 * bottom-left origin). Applies x' = x*MM_TO_PT, y' = pageHeightPt - y*MM_TO_PT
 * to every coordinate point in every M/L/C/Z command. Z has no points so
 * passes through unchanged.
 */
function transformPathD(d: string, pageHeightPt: number): string {
  const cmds = parsePathD(d)
  const out: PathCommand[] = cmds.map((c) => ({
    type: c.type,
    points: c.points.map((p) => ({
      x: p.x * MM_TO_PT,
      y: pageHeightPt - p.y * MM_TO_PT,
    })),
  }))
  return commandsToD(out)
}

function drawPath(el: Element, ctx: Ctx): void {
  const d = el.getAttribute('d')
  if (!d) return
  const transformedD = transformPathD(d, ctx.pageHeightPt)
  const fill = parseColor(el.getAttribute('fill'))
  const stroke = parseColor(el.getAttribute('stroke'))
  const strokeWidthAttr = el.getAttribute('stroke-width')
  const strokeWidth = strokeWidthAttr ? parseFloat(strokeWidthAttr) * MM_TO_PT : 1

  ctx.page.drawSvgPath(transformedD, {
    x: 0,
    y: 0,
    color: fill,
    borderColor: stroke,
    borderWidth: stroke ? strokeWidth : 0,
  })
}

function drawRect(el: Element, ctx: Ctx): void {
  const x = parseFloat(el.getAttribute('x') || '0')
  const y = parseFloat(el.getAttribute('y') || '0')
  const w = parseFloat(el.getAttribute('width') || '0')
  const h = parseFloat(el.getAttribute('height') || '0')
  if (w <= 0 || h <= 0) return
  const fill = parseColor(el.getAttribute('fill'))
  const stroke = parseColor(el.getAttribute('stroke'))
  const strokeWidth = parseFloat(el.getAttribute('stroke-width') || '0') * MM_TO_PT
  const wPt = w * MM_TO_PT
  const hPt = h * MM_TO_PT
  // pdf-lib drawRectangle: x,y is BOTTOM-LEFT in PDF coords. SVG x,y is TOP-LEFT.
  ctx.page.drawRectangle({
    x: x * MM_TO_PT,
    y: ctx.pageHeightPt - y * MM_TO_PT - hPt,
    width: wPt,
    height: hPt,
    color: fill,
    borderColor: stroke,
    borderWidth: stroke ? strokeWidth : 0,
  })
}

function drawLine(el: Element, ctx: Ctx): void {
  const x1 = parseFloat(el.getAttribute('x1') || '0')
  const y1 = parseFloat(el.getAttribute('y1') || '0')
  const x2 = parseFloat(el.getAttribute('x2') || '0')
  const y2 = parseFloat(el.getAttribute('y2') || '0')
  const stroke = parseColor(el.getAttribute('stroke')) ?? rgb(0, 0, 0)
  const strokeWidth = parseFloat(el.getAttribute('stroke-width') || '0.25') * MM_TO_PT
  ctx.page.drawLine({
    start: { x: x1 * MM_TO_PT, y: ctx.pageHeightPt - y1 * MM_TO_PT },
    end: { x: x2 * MM_TO_PT, y: ctx.pageHeightPt - y2 * MM_TO_PT },
    color: stroke,
    thickness: strokeWidth,
  })
}

function drawEllipseEl(el: Element, ctx: Ctx): void {
  const cx = parseFloat(el.getAttribute('cx') || '0')
  const cy = parseFloat(el.getAttribute('cy') || '0')
  const rx = parseFloat(el.getAttribute('rx') || '0')
  const ry = parseFloat(el.getAttribute('ry') || '0')
  if (rx <= 0 || ry <= 0) return
  const fill = parseColor(el.getAttribute('fill'))
  const stroke = parseColor(el.getAttribute('stroke'))
  const strokeWidth = parseFloat(el.getAttribute('stroke-width') || '0') * MM_TO_PT
  ctx.page.drawEllipse({
    x: cx * MM_TO_PT,
    y: ctx.pageHeightPt - cy * MM_TO_PT,
    xScale: rx * MM_TO_PT,
    yScale: ry * MM_TO_PT,
    color: fill,
    borderColor: stroke,
    borderWidth: stroke ? strokeWidth : 0,
  })
}

function drawCircleEl(el: Element, ctx: Ctx): void {
  const cx = parseFloat(el.getAttribute('cx') || '0')
  const cy = parseFloat(el.getAttribute('cy') || '0')
  const r = parseFloat(el.getAttribute('r') || '0')
  if (r <= 0) return
  const fill = parseColor(el.getAttribute('fill'))
  const stroke = parseColor(el.getAttribute('stroke'))
  const strokeWidth = parseFloat(el.getAttribute('stroke-width') || '0') * MM_TO_PT
  ctx.page.drawCircle({
    x: cx * MM_TO_PT,
    y: ctx.pageHeightPt - cy * MM_TO_PT,
    size: r * MM_TO_PT,
    color: fill,
    borderColor: stroke,
    borderWidth: stroke ? strokeWidth : 0,
  })
}

function decodeDataUrl(href: string): { mime: string; bytes: Uint8Array } | null {
  const m = href.match(/^data:([^;]+);base64,(.+)$/)
  if (!m) return null
  const mime = m[1].toLowerCase()
  // atob is available in browser + jsdom + Node 16+.
  const binary = atob(m[2])
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return { mime, bytes }
}

async function drawImage(el: Element, ctx: Ctx): Promise<void> {
  const x = parseFloat(el.getAttribute('x') || '0')
  const y = parseFloat(el.getAttribute('y') || '0')
  const w = parseFloat(el.getAttribute('width') || '0')
  const h = parseFloat(el.getAttribute('height') || '0')
  const href = el.getAttribute('href') || el.getAttribute('xlink:href')
  if (!href || w <= 0 || h <= 0) return
  const decoded = decodeDataUrl(href)
  if (!decoded) return // remote URLs not supported in this MVP — they would require network access
  let img
  try {
    img = decoded.mime === 'image/jpeg' || decoded.mime === 'image/jpg'
      ? await ctx.pdf.embedJpg(decoded.bytes)
      : await ctx.pdf.embedPng(decoded.bytes)
  } catch {
    return
  }
  const wPt = w * MM_TO_PT
  const hPt = h * MM_TO_PT
  ctx.page.drawImage(img, {
    x: x * MM_TO_PT,
    y: ctx.pageHeightPt - y * MM_TO_PT - hPt,
    width: wPt,
    height: hPt,
  })
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

async function walk(el: Element, ctx: Ctx): Promise<void> {
  const tag = el.tagName.toLowerCase()
  switch (tag) {
    case 'text':
      drawText(el, ctx)
      return
    case 'path':
      drawPath(el, ctx)
      return
    case 'rect':
      drawRect(el, ctx)
      return
    case 'line':
      drawLine(el, ctx)
      return
    case 'ellipse':
      drawEllipseEl(el, ctx)
      return
    case 'circle':
      drawCircleEl(el, ctx)
      return
    case 'image':
      await drawImage(el, ctx)
      return
  }
  // Recurse into containers (<g>, <svg>, layers, etc.).
  for (const child of Array.from(el.children)) {
    await walk(child, ctx)
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
  await walk(svg, ctx)

  return pdf.save()
}
