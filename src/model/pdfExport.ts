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
import fontkit from '@pdf-lib/fontkit'
import { parsePathD, commandsToD, type PathCommand } from './pathOps'
import {
  applyMatrixToPoint,
  identityMatrix,
  multiplyMatrix,
  parseTransform,
  type Matrix,
} from './matrix'

const MM_TO_PT = 72 / 25.4

/**
 * Raw font-file bytes supplied by the caller. pdf-lib needs these because
 * StandardFonts.Helvetica doesn't match source PDF fonts (Calibri, Playfair
 * Display, …) in either glyph shape or metrics, which was the root cause of
 * visibly-wrong composites. The caller loads these in the appropriate
 * environment (fetch+?url in the browser; fs.readFileSync in tests).
 *
 * Missing entries fall back to the sans family; missing sans falls back to
 * StandardFonts.Helvetica so existing callers keep working unchanged.
 */
export interface FontBytes {
  sansRegular?: Uint8Array
  sansItalic?: Uint8Array
  sansBold?: Uint8Array
  serifRegular?: Uint8Array
  serifItalic?: Uint8Array
}

interface EmbeddedFonts {
  sansRegular: PDFFont
  sansItalic: PDFFont
  sansBold: PDFFont
  serifRegular: PDFFont
  serifItalic: PDFFont
}

interface Ctx {
  pdf: PDFDocument
  page: ReturnType<PDFDocument['addPage']>
  /** Source-font-aware font set. All five slots are filled (falling back
   *  through sansRegular → helvetica) so the drawer never has to branch. */
  fonts: EmbeddedFonts
  pageHeightPt: number
  /** Cumulative SVG-space transform from ancestor <g> elements. */
  matrix: Matrix
}

/**
 * Pick the best embedded font for the given font-family attribute. Source
 * PDFs commonly name fonts that aren't on the host machine (Calibri from
 * Word-generated PDFs, Playfair Display from designer tools). Since we
 * can't embed the actual subset, we map by family TYPE (serif/sans) and
 * STYLE (italic/bold) to a close-metric open alternative.
 */
function pickFont(
  fonts: EmbeddedFonts,
  fontFamily: string | null,
  fontStyle: string | null,
  fontWeight: string | null
): PDFFont {
  const family = (fontFamily || '').toLowerCase()
  const italic = (fontStyle || '').toLowerCase().includes('italic')
    || /italic|oblique/.test(family)
  const bold = (fontWeight || '').toLowerCase().includes('bold')
    || /bold/.test(family)
    || parseInt(fontWeight || '0', 10) >= 600
  // Rough serif detector: covers Playfair, Times, Georgia, Cambria, Garamond,
  // and anything that literally contains "serif".
  const isSerif = /serif|playfair|times|georgia|cambria|garamond|minion|book ?antiqua/.test(family)

  if (isSerif && italic) return fonts.serifItalic
  if (isSerif) return fonts.serifRegular
  if (italic) return fonts.sansItalic
  if (bold) return fonts.sansBold
  return fonts.sansRegular
}

/** Map an SVG-space (x, y) (in mm) through ctx.matrix and convert to PDF pt
 *  with Y-axis flip. */
function svgPtToPdf(x: number, y: number, ctx: Ctx): { x: number; y: number } {
  const t = applyMatrixToPoint(ctx.matrix, x, y)
  return {
    x: t.x * MM_TO_PT,
    y: ctx.pageHeightPt - t.y * MM_TO_PT,
  }
}

/** Extract uniform-ish x/y scale factors from an affine matrix. Useful for
 *  scaling element dimensions (width/height, font-size, stroke-width) under
 *  a parent <g transform>. For rotation-only transforms returns {1, 1}. */
function extractScale(m: Matrix): { sx: number; sy: number } {
  return {
    sx: Math.sqrt(m[0] * m[0] + m[1] * m[1]),
    sy: Math.sqrt(m[2] * m[2] + m[3] * m[3]),
  }
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
 * Transform a path d-string from SVG-space (mm, top-left origin, possibly
 * under ctx.matrix) to PDF-space pt with top-left origin — i.e. x and y both
 * scaled mm→pt, but NO Y-axis flip. pdf-lib's drawSvgPath applies its own
 * internal Y-flip (it takes SVG-convention input and flips), so if we
 * pre-flip here the content lands off-page at negative Y.
 */
function transformPathD(d: string, ctx: Ctx): string {
  const cmds = parsePathD(d)
  const out: PathCommand[] = cmds.map((c) => ({
    type: c.type,
    points: c.points.map((p) => {
      const t = applyMatrixToPoint(ctx.matrix, p.x, p.y)
      return { x: t.x * MM_TO_PT, y: t.y * MM_TO_PT }
    }),
  }))
  return commandsToD(out)
}

function drawPath(el: Element, ctx: Ctx): void {
  const d = el.getAttribute('d')
  if (!d) return
  const transformedD = transformPathD(d, ctx)
  const fill = parseColor(el.getAttribute('fill'))
  const stroke = parseColor(el.getAttribute('stroke'))
  const strokeWidthAttr = el.getAttribute('stroke-width')
  const { sx } = extractScale(ctx.matrix)
  const strokeWidth = strokeWidthAttr ? parseFloat(strokeWidthAttr) * sx * MM_TO_PT : 1

  // drawSvgPath expects SVG-convention coords (y-down from the anchor point).
  // We pass (x=0, y=pageHeightPt) so that SVG origin lands at the PDF page's
  // top-left, and drawSvgPath's internal y-flip makes content fill downward
  // across the page.
  ctx.page.drawSvgPath(transformedD, {
    x: 0,
    y: ctx.pageHeightPt,
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
  const { sx, sy } = extractScale(ctx.matrix)
  const strokeWidth = parseFloat(el.getAttribute('stroke-width') || '0') * sx * MM_TO_PT
  const wPt = w * sx * MM_TO_PT
  const hPt = h * sy * MM_TO_PT
  // pdf-lib drawRectangle: x,y is BOTTOM-LEFT in PDF coords. SVG x,y is TOP-LEFT.
  // Apply matrix to top-left corner; then convert to PDF and subtract scaled height.
  const tl = svgPtToPdf(x, y, ctx)
  ctx.page.drawRectangle({
    x: tl.x,
    y: tl.y - hPt,
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
  const { sx } = extractScale(ctx.matrix)
  const strokeWidth = parseFloat(el.getAttribute('stroke-width') || '0.25') * sx * MM_TO_PT
  const a = svgPtToPdf(x1, y1, ctx)
  const b = svgPtToPdf(x2, y2, ctx)
  ctx.page.drawLine({
    start: { x: a.x, y: a.y },
    end: { x: b.x, y: b.y },
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
  const { sx, sy } = extractScale(ctx.matrix)
  const strokeWidth = parseFloat(el.getAttribute('stroke-width') || '0') * sx * MM_TO_PT
  const c = svgPtToPdf(cx, cy, ctx)
  ctx.page.drawEllipse({
    x: c.x,
    y: c.y,
    xScale: rx * sx * MM_TO_PT,
    yScale: ry * sy * MM_TO_PT,
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
  const { sx } = extractScale(ctx.matrix)
  const strokeWidth = parseFloat(el.getAttribute('stroke-width') || '0') * sx * MM_TO_PT
  const c = svgPtToPdf(cx, cy, ctx)
  ctx.page.drawCircle({
    x: c.x,
    y: c.y,
    size: r * sx * MM_TO_PT,
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
  const { sx, sy } = extractScale(ctx.matrix)
  const wPt = w * sx * MM_TO_PT
  const hPt = h * sy * MM_TO_PT
  const tl = svgPtToPdf(x, y, ctx)
  ctx.page.drawImage(img, {
    x: tl.x,
    y: tl.y - hPt,
    width: wPt,
    height: hPt,
  })
}

/**
 * Drop characters the given font cannot encode (vectorfeld-ape).
 *
 * pdf-lib's StandardFonts.Helvetica uses WinAnsi encoding, which cannot
 * represent characters outside Latin-1 plus a few extras. Word-generated
 * PDFs commonly include U+25CA (◊) bullets, em-dashes, fancy quotes, etc.
 * Naïve drawText throws on the first unencodable char and the entire
 * Export PDF call fails. Per-element sanitization keeps the rest of the
 * document exporting cleanly.
 *
 * Until we embed a Unicode TTF font (separate bead), we accept the loss
 * and warn the user about which characters were dropped.
 */
function safeEncode(text: string, font: PDFFont, sourceLabel: string): string {
  try {
    font.encodeText(text)
    return text
  } catch {
    let out = ''
    const dropped: string[] = []
    for (const ch of text) {
      try {
        font.encodeText(ch)
        out += ch
      } catch {
        dropped.push(ch)
      }
    }
    if (dropped.length > 0) {
      const codepoints = dropped.map((c) => `U+${c.codePointAt(0)?.toString(16).toUpperCase().padStart(4, '0')}`).join(', ')
      console.warn(
        `[vectorfeld] Export PDF: dropped ${dropped.length} non-WinAnsi char(s) from "${sourceLabel}" (${codepoints}). ` +
        `Embed a Unicode font to preserve these.`
      )
    }
    return out
  }
}

/** Draw a single text run at the given SVG-space position. Used for both
 *  the direct-text-content path and the per-tspan path. */
function drawTextRun(
  text: string,
  x: number,
  y: number,
  fontSize: number,
  fill: ReturnType<typeof rgb> | undefined,
  font: PDFFont,
  ctx: Ctx
): void {
  const safe = safeEncode(text, font, text.slice(0, 40))
  if (!safe) return
  const { sx } = extractScale(ctx.matrix)
  const baseline = svgPtToPdf(x, y, ctx)
  ctx.page.drawText(safe, {
    x: baseline.x,
    y: baseline.y,
    font,
    size: fontSize * sx * MM_TO_PT,
    color: fill ?? rgb(0, 0, 0),
  })
}

function drawText(el: Element, ctx: Ctx): void {
  // SVG text positioning has two equivalent forms:
  //   (a) <text x=".." y="..">content</text>
  //   (b) <text><tspan x=".." y="..">content</tspan>...</text>
  // Form (b) is what MuPDF emits for every imported PDF — the position is
  // on the tspan, not on the <text>. Without tspan-aware drawing every
  // imported PDF collapses every text element to (0, 0).
  const fontSize = parseFloat(el.getAttribute('font-size') || '12')
  const fill = parseColor(el.getAttribute('fill'))
  const elX = parseFloat(el.getAttribute('x') || '0')
  const elY = parseFloat(el.getAttribute('y') || '0')
  const elFamily = el.getAttribute('font-family')
  const elStyle = el.getAttribute('font-style')
  const elWeight = el.getAttribute('font-weight')

  const tspans = Array.from(el.children).filter((c) => c.tagName.toLowerCase() === 'tspan')
  if (tspans.length === 0) {
    const content = el.textContent || ''
    if (content) {
      const font = pickFont(ctx.fonts, elFamily, elStyle, elWeight)
      drawTextRun(content, elX, elY, fontSize, fill, font, ctx)
    }
    return
  }

  for (const tspan of tspans) {
    const content = tspan.textContent || ''
    if (!content) continue
    // x/y on a <tspan> may be a single number OR a space-separated per-
    // character list (SVG 1.1 §10.4). MuPDF's text=text mode emits the
    // per-char form for ~40% of tspans to preserve the source font's
    // glyph spacing — critical because our embedded fonts (Carlito etc.)
    // can't perfectly match the source font's advances (vectorfeld-dcx).
    const xAttr = tspan.getAttribute('x') ?? String(elX)
    const yAttr = tspan.getAttribute('y') ?? String(elY)
    const xArr = xAttr.trim().split(/\s+/).map(parseFloat)
    const yArr = yAttr.trim().split(/\s+/).map(parseFloat)
    const tspanSize = parseFloat(tspan.getAttribute('font-size') || String(fontSize))
    const tspanFill = parseColor(tspan.getAttribute('fill')) ?? fill
    // font-family can be set on <text> OR <tspan> (MuPDF puts it on <text>).
    // Inherit and override at tspan level.
    const family = tspan.getAttribute('font-family') ?? elFamily
    const style = tspan.getAttribute('font-style') ?? elStyle
    const weight = tspan.getAttribute('font-weight') ?? elWeight
    const font = pickFont(ctx.fonts, family, style, weight)

    if (xArr.length <= 1 && yArr.length <= 1) {
      drawTextRun(content, xArr[0], yArr[0], tspanSize, tspanFill, font, ctx)
      continue
    }

    // Per-character path: walk the content as code points so surrogate
    // pairs stay together. When the array is shorter than the text, reuse
    // the last array value for the remaining chars (pragmatic choice; the
    // SVG-spec alternative is font-advance layout, but that's exactly
    // what re-introduces the wrong-metric problem we're fixing).
    const chars = Array.from(content)
    const lastX = xArr[xArr.length - 1]
    const lastY = yArr[yArr.length - 1]
    for (let i = 0; i < chars.length; i++) {
      const cx = i < xArr.length ? xArr[i] : lastX
      const cy = i < yArr.length ? yArr[i] : lastY
      drawTextRun(chars[i], cx, cy, tspanSize, tspanFill, font, ctx)
    }
  }
}

async function walk(el: Element, ctx: Ctx): Promise<void> {
  // Apply this element's own transform attribute BEFORE drawing or recursing.
  // This must happen for leaves too (text/path/rect/…) — MuPDF's flatten step
  // puts transform="scale(pt→mm)" directly on each leaf rather than wrapping
  // them in a group, so leaf-transform handling is load-bearing for any
  // imported PDF.
  const transformAttr = el.getAttribute('transform')
  const localCtx: Ctx = transformAttr
    ? { ...ctx, matrix: multiplyMatrix(ctx.matrix, parseTransform(transformAttr)) }
    : ctx

  const tag = el.tagName.toLowerCase()
  switch (tag) {
    case 'text':
      drawText(el, localCtx)
      return
    case 'path':
      drawPath(el, localCtx)
      return
    case 'rect':
      drawRect(el, localCtx)
      return
    case 'line':
      drawLine(el, localCtx)
      return
    case 'ellipse':
      drawEllipseEl(el, localCtx)
      return
    case 'circle':
      drawCircleEl(el, localCtx)
      return
    case 'image':
      await drawImage(el, localCtx)
      return
  }
  // Containers (svg, g, …): recurse with the composed matrix.
  for (const child of Array.from(el.children)) {
    await walk(child, localCtx)
  }
}

/**
 * Embed the caller-provided font bytes (if any) and fall back to
 * StandardFonts.Helvetica for missing slots. All five slots in the returned
 * EmbeddedFonts are filled so draw code never has to null-check.
 */
async function embedFonts(pdf: PDFDocument, fonts?: FontBytes): Promise<EmbeddedFonts> {
  const anyBytes = fonts && Object.values(fonts).some((b) => b instanceof Uint8Array)
  if (anyBytes) {
    pdf.registerFontkit(fontkit)
  }
  const helvetica = await pdf.embedFont(StandardFonts.Helvetica)
  const embed = async (bytes?: Uint8Array): Promise<PDFFont> => {
    if (!bytes) return helvetica
    try {
      // subset=false so every glyph is embedded — we issue many per-char
      // drawText calls for MuPDF tspans with per-char x-arrays, and the
      // subset machinery doesn't always pick up the glyphs cleanly across
      // those separate runs.
      return await pdf.embedFont(bytes, { subset: false })
    } catch (err) {
      console.warn('[vectorfeld] failed to embed custom font; falling back to Helvetica', err)
      return helvetica
    }
  }
  const sansRegular = await embed(fonts?.sansRegular)
  return {
    sansRegular,
    sansItalic: await embed(fonts?.sansItalic ?? fonts?.sansRegular),
    sansBold: await embed(fonts?.sansBold ?? fonts?.sansRegular),
    serifRegular: await embed(fonts?.serifRegular ?? fonts?.sansRegular),
    serifItalic: await embed(fonts?.serifItalic ?? fonts?.serifRegular ?? fonts?.sansItalic ?? fonts?.sansRegular),
  }
}

export interface SvgToPdfOptions {
  fonts?: FontBytes
}

export async function svgStringToPdfBytes(
  svgString: string,
  opts: SvgToPdfOptions = {}
): Promise<Uint8Array> {
  const parser = new DOMParser()
  const doc = parser.parseFromString(svgString, 'image/svg+xml')
  const svg = doc.documentElement

  const vb = parseViewBox(svg.getAttribute('viewBox'))
  const widthPt = vb.width * MM_TO_PT
  const heightPt = vb.height * MM_TO_PT

  const pdf = await PDFDocument.create()
  const page = pdf.addPage([widthPt, heightPt])
  const fonts = await embedFonts(pdf, opts.fonts)

  const ctx: Ctx = { pdf, page, fonts, pageHeightPt: heightPt, matrix: identityMatrix() }
  await walk(svg, ctx)

  return pdf.save()
}
