/**
 * PDF content-stream operator emitters for SVG primitives.
 *
 * Pure module: takes an SVG element + a transform context, returns a
 * self-contained `q\n...\nQ\n` PDF op-string fragment ready to be appended
 * to a page's content stream by `graftMupdf.appendContentStream`.
 *
 * Used by the graft engine (`vectorfeld-wjj`) to emit per-element overlays
 * onto pages whose original bytes were preserved via `graftSourcePageInto`.
 *
 * Coordinate model — mirrors `pdfExport.ts`:
 *   - Input element coords are in document mm-space (top-left origin, Y down).
 *   - `ctx.matrix` is the composed ancestor SVG transform (mm-space).
 *   - Output is PDF points (bottom-left origin, Y up).
 *   - Y-flip: `pdfY = pageHeightPt - svgMmY * MM_TO_PT` after the matrix is
 *     applied to each point individually. Done per-point so that rotation in
 *     the matrix is honoured (rect/ellipse/etc. rotate correctly, unlike
 *     pdfExport where pdf-lib's primitives axis-align after a single corner
 *     transform).
 *
 * Style scope (fill / stroke / stroke-width only) matches pdfExport's MVP.
 * Opacity, dash, linecap, linejoin are deliberately out of scope until
 * separate beads request them.
 */

import { applyMatrixToPoint, type Matrix } from './matrix'
import { parsePathD, type PathCommand } from './pathOps'
import { ellipseToPathD, rectToPathD, lineToPathD } from './shapeToPath'

const MM_TO_PT = 72 / 25.4

export interface RGB {
  r: number
  g: number
  b: number
}

export interface Ctx {
  /** Composed ancestor SVG transform. mm-space in, mm-space out. */
  matrix: Matrix
  /** Page height in PDF points. Used for Y-axis flip. */
  pageHeightPt: number
}

// ---------------------------------------------------------------------------
// Internal numeric formatting — 3-decimal precision with trailing-zero strip.
// Determinism is load-bearing: the graft engine produces byte-stable PDFs that
// will be golden-mastered, so any change here invalidates committed masters.
// ---------------------------------------------------------------------------

function fmt(n: number): string {
  if (!Number.isFinite(n)) return '0'
  const s = n.toFixed(3)
  const stripped = s.replace(/\.?0+$/, '')
  return stripped === '' || stripped === '-' || stripped === '-0' ? '0' : stripped
}

// ---------------------------------------------------------------------------
// Color
// ---------------------------------------------------------------------------

export function parseColor(s: string | null | undefined): RGB | null {
  if (s == null || s === '' || s === 'none') return null
  const m3 = s.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i)
  if (m3) {
    return {
      r: parseInt(m3[1] + m3[1], 16) / 255,
      g: parseInt(m3[2] + m3[2], 16) / 255,
      b: parseInt(m3[3] + m3[3], 16) / 255,
    }
  }
  const m6 = s.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
  if (m6) {
    return {
      r: parseInt(m6[1], 16) / 255,
      g: parseInt(m6[2], 16) / 255,
      b: parseInt(m6[3], 16) / 255,
    }
  }
  if (s === 'black') return { r: 0, g: 0, b: 0 }
  if (s === 'white') return { r: 1, g: 1, b: 1 }
  return null
}

// ---------------------------------------------------------------------------
// Coordinate transform (ctx.matrix → PDF points with Y-flip)
// ---------------------------------------------------------------------------

function svgMmToPdfPt(x: number, y: number, ctx: Ctx): { x: number; y: number } {
  const t = applyMatrixToPoint(ctx.matrix, x, y)
  return {
    x: t.x * MM_TO_PT,
    y: ctx.pageHeightPt - t.y * MM_TO_PT,
  }
}

/** Polar-decomposition scale factors. Matches pdfExport.extractScale. */
function extractScale(m: Matrix): { sx: number; sy: number } {
  return {
    sx: Math.sqrt(m[0] * m[0] + m[1] * m[1]),
    sy: Math.sqrt(m[2] * m[2] + m[3] * m[3]),
  }
}

// ---------------------------------------------------------------------------
// Path-op emission (shared by all shape emitters)
// ---------------------------------------------------------------------------

/** Emit M/L/C/Z command list as PDF path ops in PDF-pt coords. */
function emitPathOps(commands: PathCommand[], ctx: Ctx): string {
  const lines: string[] = []
  for (const cmd of commands) {
    if (cmd.type === 'M') {
      const p = svgMmToPdfPt(cmd.points[0].x, cmd.points[0].y, ctx)
      lines.push(`${fmt(p.x)} ${fmt(p.y)} m`)
    } else if (cmd.type === 'L') {
      const p = svgMmToPdfPt(cmd.points[0].x, cmd.points[0].y, ctx)
      lines.push(`${fmt(p.x)} ${fmt(p.y)} l`)
    } else if (cmd.type === 'C') {
      const p1 = svgMmToPdfPt(cmd.points[0].x, cmd.points[0].y, ctx)
      const p2 = svgMmToPdfPt(cmd.points[1].x, cmd.points[1].y, ctx)
      const p3 = svgMmToPdfPt(cmd.points[2].x, cmd.points[2].y, ctx)
      lines.push(
        `${fmt(p1.x)} ${fmt(p1.y)} ${fmt(p2.x)} ${fmt(p2.y)} ${fmt(p3.x)} ${fmt(p3.y)} c`,
      )
    } else {
      lines.push('h')
    }
  }
  return lines.join('\n')
}

/**
 * Wrap a path body with state save/restore + color setup + paint operator.
 * Returns "" when neither fill nor stroke is set (invisible element).
 */
function styleAndPaint(
  fill: RGB | null,
  stroke: RGB | null,
  strokeWidthPt: number,
  pathBody: string,
): string {
  if (!fill && !stroke) return ''
  const lines: string[] = ['q']
  if (fill) lines.push(`${fmt(fill.r)} ${fmt(fill.g)} ${fmt(fill.b)} rg`)
  if (stroke) {
    lines.push(`${fmt(stroke.r)} ${fmt(stroke.g)} ${fmt(stroke.b)} RG`)
    lines.push(`${fmt(strokeWidthPt)} w`)
  }
  lines.push(pathBody)
  if (fill && stroke) lines.push('B')
  else if (fill) lines.push('f')
  else lines.push('S')
  lines.push('Q')
  return lines.join('\n') + '\n'
}

// ---------------------------------------------------------------------------
// Public emitters
// ---------------------------------------------------------------------------

function num(el: Element, name: string, fallback = 0): number {
  const v = el.getAttribute(name)
  return v === null ? fallback : parseFloat(v)
}

/** Default stroke-width (mm) per shape — mirrors pdfExport per-shape defaults. */
function strokeWidthMm(el: Element, defaultMm: number): number {
  const a = el.getAttribute('stroke-width')
  return a === null ? defaultMm : parseFloat(a)
}

export function emitRect(el: Element, ctx: Ctx): string {
  const w = num(el, 'width')
  const h = num(el, 'height')
  if (w <= 0 || h <= 0) return ''
  const fill = parseColor(el.getAttribute('fill'))
  const stroke = parseColor(el.getAttribute('stroke'))
  if (!fill && !stroke) return ''
  const { sx } = extractScale(ctx.matrix)
  const strokeWidthPt = strokeWidthMm(el, 0) * sx * MM_TO_PT
  const x = num(el, 'x')
  const y = num(el, 'y')
  // 4-corner closed path. Each corner transformed individually so that
  // rotation in ctx.matrix is preserved (unlike pdfExport's drawRectangle).
  const d = rectToPathD(x, y, w, h)
  const body = emitPathOps(parsePathD(d), ctx)
  return styleAndPaint(fill, stroke, strokeWidthPt, body)
}

export function emitLine(el: Element, ctx: Ctx): string {
  const stroke = parseColor(el.getAttribute('stroke')) ?? { r: 0, g: 0, b: 0 }
  const { sx } = extractScale(ctx.matrix)
  const strokeWidthPt = strokeWidthMm(el, 0.25) * sx * MM_TO_PT
  const x1 = num(el, 'x1')
  const y1 = num(el, 'y1')
  const x2 = num(el, 'x2')
  const y2 = num(el, 'y2')
  const d = lineToPathD(x1, y1, x2, y2)
  const body = emitPathOps(parsePathD(d), ctx)
  return styleAndPaint(null, stroke, strokeWidthPt, body)
}

export function emitCircle(el: Element, ctx: Ctx): string {
  const r = num(el, 'r')
  if (r <= 0) return ''
  return emitEllipseLike(el, ctx, num(el, 'cx'), num(el, 'cy'), r, r)
}

export function emitEllipse(el: Element, ctx: Ctx): string {
  const rx = num(el, 'rx')
  const ry = num(el, 'ry')
  if (rx <= 0 || ry <= 0) return ''
  return emitEllipseLike(el, ctx, num(el, 'cx'), num(el, 'cy'), rx, ry)
}

function emitEllipseLike(
  el: Element,
  ctx: Ctx,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): string {
  const fill = parseColor(el.getAttribute('fill'))
  const stroke = parseColor(el.getAttribute('stroke'))
  if (!fill && !stroke) return ''
  const { sx } = extractScale(ctx.matrix)
  const strokeWidthPt = strokeWidthMm(el, 0) * sx * MM_TO_PT
  const d = ellipseToPathD(cx, cy, rx, ry)
  const body = emitPathOps(parsePathD(d), ctx)
  return styleAndPaint(fill, stroke, strokeWidthPt, body)
}

export function emitPath(el: Element, ctx: Ctx): string {
  const d = el.getAttribute('d')
  if (!d) return ''
  const fill = parseColor(el.getAttribute('fill'))
  const stroke = parseColor(el.getAttribute('stroke'))
  if (!fill && !stroke) return ''
  const { sx } = extractScale(ctx.matrix)
  const strokeWidthPt = strokeWidthMm(el, 1) * sx * MM_TO_PT
  const body = emitPathOps(parsePathD(d), ctx)
  return styleAndPaint(fill, stroke, strokeWidthPt, body)
}

// ---------------------------------------------------------------------------
// Text emission
// ---------------------------------------------------------------------------

/**
 * Resolves an SVG (font-family, font-style, font-weight) tuple to the page-
 * registered font key the text run should reference. The graft engine builds
 * the registry by registering one or more fonts on the page (via
 * `graftMupdf.registerOverlayFont`) and exposes a registry that maps SVG
 * font attributes to those keys.
 *
 * `emitText` is intentionally agnostic to how the registry is populated
 * (single Carlito-only registry; full pickFont-style 5-slot registry; or a
 * registry that picks an existing source font key for back-compat) — its
 * only contract is "give me a key for this triple, and I'll emit `/key Tf`".
 */
export interface FontRegistry {
  resolveFontKey(
    fontFamily: string | null,
    fontStyle: string | null,
    fontWeight: string | null,
  ): string
}

interface TextRun {
  /** PDF-pt baseline position (already through ctx.matrix and Y-flipped). */
  pos: { x: number; y: number }
  /** Single character or multi-char run; rendered as one `(text) Tj`. */
  text: string
  fontKey: string
  /** Font size in PDF points (already scaled by ctx.matrix sx). */
  sizePt: number
  fill: RGB
}

/** Escape `\\`, `(`, `)` for a PDF literal string `(...)`. Caller is
 *  responsible for ensuring the input is encodable in the resolved font;
 *  this helper does not validate codepoint coverage. */
function escapePdfString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

function collectTextRuns(el: Element, ctx: Ctx, registry: FontRegistry): TextRun[] {
  const elX = num(el, 'x')
  const elY = num(el, 'y')
  const elFontSize = num(el, 'font-size', 12)
  const elFill = parseColor(el.getAttribute('fill')) ?? { r: 0, g: 0, b: 0 }
  const elFamily = el.getAttribute('font-family')
  const elStyle = el.getAttribute('font-style')
  const elWeight = el.getAttribute('font-weight')
  const { sx } = extractScale(ctx.matrix)

  const tspans = Array.from(el.children).filter(
    (c) => c.tagName.toLowerCase() === 'tspan',
  )

  if (tspans.length === 0) {
    const text = el.textContent ?? ''
    if (!text) return []
    const fontKey = registry.resolveFontKey(elFamily, elStyle, elWeight)
    const pos = svgMmToPdfPt(elX, elY, ctx)
    return [{ pos, text, fontKey, sizePt: elFontSize * sx * MM_TO_PT, fill: elFill }]
  }

  const runs: TextRun[] = []
  for (const tspan of tspans) {
    const text = tspan.textContent ?? ''
    if (!text) continue
    // x/y on tspan may be a single number or a per-character space-separated
    // list (SVG 1.1 §10.4). MuPDF's text=text mode emits the per-char form
    // for ~40% of tspans to preserve glyph spacing.
    const xAttr = tspan.getAttribute('x') ?? String(elX)
    const yAttr = tspan.getAttribute('y') ?? String(elY)
    const xs = xAttr.trim().split(/\s+/).map(parseFloat)
    const ys = yAttr.trim().split(/\s+/).map(parseFloat)
    const tspanSize = parseFloat(tspan.getAttribute('font-size') ?? String(elFontSize))
    const tspanFillStr = tspan.getAttribute('fill')
    const fill = tspanFillStr != null ? (parseColor(tspanFillStr) ?? elFill) : elFill
    const family = tspan.getAttribute('font-family') ?? elFamily
    const style = tspan.getAttribute('font-style') ?? elStyle
    const weight = tspan.getAttribute('font-weight') ?? elWeight
    const fontKey = registry.resolveFontKey(family, style, weight)
    const sizePt = tspanSize * sx * MM_TO_PT

    if (xs.length <= 1 && ys.length <= 1) {
      const pos = svgMmToPdfPt(xs[0], ys[0], ctx)
      runs.push({ pos, text, fontKey, sizePt, fill })
      continue
    }

    // Per-char path: walk by code point so surrogate pairs stay together.
    // When the array is shorter than the text, reuse the last array value
    // for the remaining chars (matches pdfExport — SVG-spec font-advance
    // fallback would re-introduce the wrong-metric problem we're solving).
    const chars = Array.from(text)
    const lastX = xs[xs.length - 1]
    const lastY = ys[ys.length - 1]
    for (let i = 0; i < chars.length; i++) {
      const cx = i < xs.length ? xs[i] : lastX
      const cy = i < ys.length ? ys[i] : lastY
      const pos = svgMmToPdfPt(cx, cy, ctx)
      runs.push({ pos, text: chars[i], fontKey, sizePt, fill })
    }
  }
  return runs
}

/**
 * Emit a `<text>` element as a self-contained `q ... BT ... ET ... Q` block
 * of PDF text-positioning + show ops. Mirrors pdfExport.drawText (line 388):
 * tspan attribute inheritance, single vs per-char position, default black
 * fill, font-size scaled by ctx.matrix.sx. State-change ops (Tf, rg) are
 * suppressed when consecutive runs share the same value.
 *
 * Position uses absolute Tm (text matrix) — `1 0 0 1 x y Tm` — for each
 * run. Tm is simpler than tracking Td deltas under per-char arrays and
 * matches drawText's "every drawText call resets position" semantics.
 *
 * Returns "" for empty/all-whitespace content.
 */
export function emitText(el: Element, ctx: Ctx, registry: FontRegistry): string {
  const runs = collectTextRuns(el, ctx, registry)
  if (runs.length === 0) return ''

  const lines: string[] = ['q', 'BT']
  let curFontKey: string | null = null
  let curSize: number | null = null
  let curFill: string | null = null

  for (const run of runs) {
    if (run.fontKey !== curFontKey || run.sizePt !== curSize) {
      lines.push(`/${run.fontKey} ${fmt(run.sizePt)} Tf`)
      curFontKey = run.fontKey
      curSize = run.sizePt
    }
    const fillStr = `${fmt(run.fill.r)} ${fmt(run.fill.g)} ${fmt(run.fill.b)}`
    if (fillStr !== curFill) {
      lines.push(`${fillStr} rg`)
      curFill = fillStr
    }
    lines.push(`1 0 0 1 ${fmt(run.pos.x)} ${fmt(run.pos.y)} Tm`)
    lines.push(`(${escapePdfString(run.text)}) Tj`)
  }

  lines.push('ET', 'Q')
  return lines.join('\n') + '\n'
}
