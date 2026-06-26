/**
 * In-place text-content editor for a single `<text>` run (vectorfeld-3yu.2).
 *
 * Mounts a transparent native `<textarea>` over the on-screen bounding box of a
 * `<text>` element, seeded with its current content. Committing (blur or Enter)
 * funnels the change through `EditTextCommand`; Escape discards. The real
 * `<text>` is only hidden (never removed) while editing, so its element
 * identity, selection membership, and import-time snapshot survive the edit.
 *
 * COORDINATE MAPPING (the load-bearing part): imported PDF text is
 * doubly-transformed — the run-wrapper `<g>` carries `scale(s)` and the inner
 * `<text>` carries MuPDF's y-flip `matrix(...)`. `textEl.getScreenCTM()` returns
 * the composed element-local → client-space matrix (wrapper scale ∘ MuPDF
 * matrix ∘ the SVG viewBox→viewport mapping), so we map the element's
 * `getBBox()` corners straight through it. Because the y-flip / any rotation
 * makes a naive top-left + width/height wrong, we transform ALL FOUR corners
 * and take the axis-aligned client bounds. The textarea is positioned with
 * `position: fixed` in those client coordinates (matching `getScreenCTM`'s
 * frame, so no scroll math is needed).
 */

import type { CommandHistory } from '../model/commands'
import { EditTextCommand } from '../model/commands'
import type { DocumentModel } from '../model/document'
import { refreshOverlaySync } from '../model/selection'

interface MatrixLike { a: number; b: number; c: number; d: number; e: number; f: number }

/** Map a local-space point through an SVG screen CTM to client coordinates. */
function applyMatrix(m: MatrixLike, x: number, y: number): { x: number; y: number } {
  return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f }
}

/** Screen-space client rect + font size for the run, or a default fallback
 *  (used under jsdom / before layout, where getScreenCTM/getBBox are inert). */
function screenRect(textEl: Element): { left: number; top: number; width: number; height: number; fontPx: number } {
  let left = 0, top = 0, width = 120, height = 20, fontPx = 0
  try {
    const gel = textEl as SVGGraphicsElement
    const bbox = gel.getBBox()
    const ctm = gel.getScreenCTM()
    if (ctm && bbox.width > 0 && bbox.height > 0) {
      const corners = [
        applyMatrix(ctm, bbox.x, bbox.y),
        applyMatrix(ctm, bbox.x + bbox.width, bbox.y),
        applyMatrix(ctm, bbox.x + bbox.width, bbox.y + bbox.height),
        applyMatrix(ctm, bbox.x, bbox.y + bbox.height),
      ]
      const xs = corners.map((c) => c.x)
      const ys = corners.map((c) => c.y)
      left = Math.min(...xs)
      top = Math.min(...ys)
      width = Math.max(...xs) - left
      height = Math.max(...ys) - top
      // On-screen font size = local font-size × the CTM's vertical scale.
      const localFs = parseFloat(textEl.getAttribute('font-size') || '0')
      if (localFs > 0) fontPx = localFs * Math.hypot(ctm.b, ctm.d)
    }
  } catch {
    /* no layout (jsdom): keep the default rect so the textarea still mounts. */
  }
  if (fontPx <= 0) fontPx = Math.max(height * 0.8, 8)
  return { left, top, width, height, fontPx }
}

/**
 * Enter in-place editing for `textEl`. Returns the mounted `<textarea>` (handy
 * for tests/callers). The caller is responsible for having `textEl` selected
 * if a tracking selection box is desired after commit.
 */
export function enterTextEdit(
  textEl: Element,
  _svg: SVGSVGElement,
  _doc: DocumentModel | null,
  history: CommandHistory,
): HTMLTextAreaElement {
  const original = textEl.textContent ?? ''
  const { left, top, width, height, fontPx } = screenRect(textEl)

  const cs = typeof getComputedStyle === 'function' ? getComputedStyle(textEl) : null
  const fontFamily = textEl.getAttribute('font-family') || cs?.fontFamily || 'sans-serif'
  const fill = textEl.getAttribute('fill') || cs?.fill || '#000000'

  const ta = document.createElement('textarea')
  ta.value = original
  ta.spellcheck = false
  ta.wrap = 'off'
  ta.setAttribute('data-role', 'text-edit-overlay')
  const s = ta.style
  s.position = 'fixed'
  s.left = `${left}px`
  s.top = `${top}px`
  s.width = `${Math.max(width, 8)}px`
  s.height = `${Math.max(height, 12)}px`
  s.margin = '0'
  s.padding = '0'
  s.border = 'none'
  s.outline = 'none'
  s.resize = 'none'
  s.overflow = 'hidden'
  s.background = 'transparent'
  s.boxSizing = 'border-box'
  s.whiteSpace = 'pre'
  s.zIndex = '1000'
  s.fontFamily = fontFamily
  s.fontSize = `${fontPx}px`
  s.lineHeight = `${Math.max(height, 12)}px`
  s.color = fill
  const weight = textEl.getAttribute('font-weight')
  if (weight) s.fontWeight = weight
  const fontStyle = textEl.getAttribute('font-style')
  if (fontStyle) s.fontStyle = fontStyle

  // Hide the real <text> but keep it in the DOM (identity/selection/snapshot
  // survive). Capture the prior inline visibility so we restore it exactly.
  const svgStyle = (textEl as SVGElement).style
  const prevVisibility = svgStyle.visibility
  svgStyle.visibility = 'hidden'

  document.body.appendChild(ta)
  ta.focus()
  ta.select()

  let done = false
  const restoreVisibility = () => { svgStyle.visibility = prevVisibility }
  const teardown = () => {
    ta.removeEventListener('blur', onBlur)
    ta.removeEventListener('keydown', onKeyDown)
    ta.remove()
  }
  const commit = () => {
    if (done) return
    done = true
    const next = ta.value
    teardown()
    restoreVisibility()
    if (next === original) return            // unchanged → push nothing
    if (next.trim().length === 0) return     // v1: empty edit REVERTS (original kept)
    history.execute(new EditTextCommand(textEl, next))
    refreshOverlaySync()                      // bbox changed → retrack selection box
  }
  const cancel = () => {
    if (done) return
    done = true
    teardown()
    restoreVisibility()
  }
  function onBlur() { commit() }
  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()                      // v1: Enter commits, never inserts a newline
      commit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancel()
    }
  }
  ta.addEventListener('blur', onBlur)
  ta.addEventListener('keydown', onKeyDown)

  return ta
}
