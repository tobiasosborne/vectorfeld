/**
 * exp-freetransform-matrix — headed proof for vectorfeld-3yu.8.
 *
 * Guards: free-transform / rotate on a non-<g> element carrying a matrix()
 * (every MuPDF-imported element) must COMPOSE rotation onto the existing
 * matrix, preserving the baked translate (e,f) and scale (a,d). The old code
 * rebuilt a `rotate(angle, cx, cy)` string from decomposeMatrix.rotate +
 * parseSkew — and parseSkew is a literal-string regex for skewX()/skewY()
 * that matches NOTHING inside matrix(), so translate AND scale were discarded
 * the instant setAttribute ran: the element teleported to the rotation center
 * and lost its import scale (data loss).
 *
 * Flow (no real PDF needed — we synthesize an import-style matrix() element):
 *   1. Draw a rect, switch to select, then inject a matrix(2,0,0,2,300,260)
 *      transform onto it via the DOM (mimics a MuPDF per-element matrix).
 *   2. Select it, press `q` (free transform), drag-rotate ~30° about its
 *      bbox centre by grabbing well outside the box.
 *   3. Read the committed transform back in page.evaluate and decompose it.
 *   4. Assert: scaleX≈scaleY≈2 SURVIVE and translate (e,f) is non-trivial
 *      (NOT reset toward 0) — i.e. no teleport, no scale collapse.
 *
 * This scenario is intentionally NOT auto-run by this bead's worker; it is
 * left ready for the orchestrator's headed pass against the live build.
 */
import { openApp, shot, dumpLog } from '../_driver.mjs'

const { browser, page, log } = await openApp()

const svgBox = await page.evaluate(() => {
  const s = document.querySelector('[data-testid="canvas-container"] svg') || document.querySelector('svg')
  const r = s.getBoundingClientRect()
  return { x: r.x, y: r.y }
})
const OX = svgBox.x, OY = svgBox.y

async function tool(l) { await page.keyboard.press(l); await page.waitForTimeout(80) }
async function drag(x1, y1, x2, y2) {
  await page.mouse.move(OX + x1, OY + y1); await page.mouse.down()
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(OX + x1 + (x2 - x1) * i / 6, OY + y1 + (y2 - y1) * i / 6)
    await page.waitForTimeout(12)
  }
  await page.mouse.up(); await page.waitForTimeout(140)
}

// ── STEP 1: draw a rect, select it, then stamp an import-style matrix() ─────
await tool('r'); await drag(220, 180, 320, 260)
await tool('v'); await page.mouse.click(OX + 270, OY + 220); await page.waitForTimeout(120)

// Replace whatever attrs with a clean matrix(2,0,0,2,300,260) like a PDF import,
// re-select it through the app's selection API so the overlay + tools see it.
const before = await page.evaluate(() => {
  const r = document.querySelector('g[data-layer-name] rect')
  if (!r) return null
  // Bake a non-trivial scale + translate into a matrix() like a MuPDF import,
  // but as a scale-2x ABOUT THE ELEMENT'S OWN CENTRE so it stays visually where
  // it was drawn (on-screen, selectable) instead of teleporting off-canvas.
  // scaleAbout(c, s) = matrix(s, 0, 0, s, cx*(1-s), cy*(1-s)).
  const b = r.getBBox()
  const cx = b.x + b.width / 2, cy = b.y + b.height / 2
  const s = 2
  const e = (cx * (1 - s)).toFixed(3), f = (cy * (1 - s)).toFixed(3)
  r.setAttribute('transform', `matrix(${s},0,0,${s},${e},${f})`)
  return r.getAttribute('transform')
})
console.log('before (import-style matrix):', before)
await shot(page, 'exp-freetransform-matrix-01-stamped')

// Compute the bbox centre in doc space so we can grab OUTSIDE the box to rotate.
const geom = await page.evaluate(() => {
  const r = document.querySelector('g[data-layer-name] rect')
  const b = r.getBBox() // local bbox {x:0,y:0,w:40,h:30}
  // doc-space centre via the element's CTM relative to the svg.
  const svg = r.ownerSVGElement
  const ctm = r.getCTM() // local→viewport(user units) for the element
  const cx = b.x + b.width / 2, cy = b.y + b.height / 2
  const pt = svg.createSVGPoint(); pt.x = cx; pt.y = cy
  const docCenter = pt.matrixTransform(ctm)
  // viewport(user units)→screen px via getScreenCTM on svg, minus svg origin.
  const screenCtm = r.getScreenCTM()
  const sp = svg.createSVGPoint(); sp.x = cx; sp.y = cy
  const screen = sp.matrixTransform(screenCtm)
  return { docCenterX: docCenter.x, docCenterY: docCenter.y, screenX: screen.x, screenY: screen.y }
})
console.log('bbox centre (doc / screen):', JSON.stringify(geom))

// Re-select at the NEW geometry: the matrix stamp bypassed the app (raw
// setAttribute), so the prior selection/overlay still reflects the pre-stamp
// box. Clear, then click the element's new screen centre so free-transform's
// detectMode operates on the correct, current bbox.
await page.mouse.click(OX + 40, OY + 40); await page.waitForTimeout(80)
await page.mouse.click(geom.screenX, geom.screenY); await page.waitForTimeout(120)
const reselected = await page.evaluate(() =>
  document.querySelectorAll('[data-role="selection-box"]').length)
console.log('re-selected boxes:', reselected)

// ── STEP 2: free transform (q), drag-rotate ~30° about the centre ───────────
// Grab a point well outside the box (centre + radius) → rotate mode, then move
// to the +30° position about the centre. Use SCREEN coords for mouse events.
await tool('q')
const cxS = geom.screenX, cyS = geom.screenY
const R = 140
const startX = cxS + R, startY = cyS
const deg = 30, rad = deg * Math.PI / 180
const endX = cxS + R * Math.cos(rad), endY = cyS + R * Math.sin(rad)
await page.mouse.move(startX, startY); await page.mouse.down()
for (let i = 1; i <= 8; i++) {
  await page.mouse.move(startX + (endX - startX) * i / 8, startY + (endY - startY) * i / 8)
  await page.waitForTimeout(12)
}
await page.mouse.up(); await page.waitForTimeout(160)
await shot(page, 'exp-freetransform-matrix-02-rotated')

// ── STEP 3: read committed transform + decompose ────────────────────────────
const after = await page.evaluate(() => {
  const r = document.querySelector('g[data-layer-name] rect')
  const t = r.getAttribute('transform') || ''
  // Resolve to a matrix via the browser's own parser for a ground-truth decompose.
  const svg = r.ownerSVGElement
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g')
  g.setAttribute('transform', t); svg.appendChild(g)
  const m = g.transform.baseVal.consolidate()?.matrix
  svg.removeChild(g)
  if (!m) return { t, scaleX: null, scaleY: null, e: null, f: null }
  const scaleX = Math.hypot(m.a, m.b)
  const scaleY = Math.hypot(m.c, m.d)
  const rotate = Math.atan2(m.b, m.a) * 180 / Math.PI
  return { t, scaleX, scaleY, e: m.e, f: m.f, rotate }
})
console.log('after rotate:', JSON.stringify(after))

// ── STEP 4: assert translate + scale SURVIVE (no teleport, no scale collapse) ─
let verdict
if (!after || after.scaleX == null) {
  verdict = 'ASSERT ERROR: could not read committed transform'
} else {
  // The decisive distinction: the OLD bug rebuilt a bare rotate(...) string, so
  // scale collapsed to 1. The fix composes rotation onto matrix(2,…), so scale
  // STAYS 2. Plus the rotation must actually apply. (translate is reported for
  // info — after a rotate-about-centre the raw e,f legitimately changes.)
  const scaleOK = Math.abs(after.scaleX - 2) < 0.05 && Math.abs(after.scaleY - 2) < 0.05
  const rotateOK = Math.abs(Math.abs(after.rotate) - 30) < 6
  verdict = (scaleOK && rotateOK)
    ? `PASS: matrix() rotate preserved scale (${after.scaleX.toFixed(2)},${after.scaleY.toFixed(2)}), rot≈${after.rotate.toFixed(1)} [translate ${after.e.toFixed(0)},${after.f.toFixed(0)}]`
    : `FAIL: scaleOK=${scaleOK} rotateOK=${rotateOK} | scale=(${after.scaleX.toFixed(2)},${after.scaleY.toFixed(2)}) rot=${after.rotate.toFixed(1)} translate=(${after.e.toFixed(0)},${after.f.toFixed(0)})`
}
console.log(verdict)

dumpLog(log)
await browser.close()
console.log('FREETRANSFORM MATRIX DONE')
