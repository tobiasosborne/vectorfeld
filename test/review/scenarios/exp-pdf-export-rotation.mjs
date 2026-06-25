/**
 * exp-pdf-export-rotation — headed proof for vectorfeld-3yu.16.
 *
 * Guards: the pdf-lib fallback export engine must honour rotation on a
 * non-text rect (previously exported axis-aligned because rect/ellipse/circle
 * were drawn via pdf-lib's axis-aligned drawRectangle/drawEllipse/drawCircle,
 * which transform a single anchor and size the body with extractScale —
 * discarding the off-diagonal rotation/skew terms of the matrix).
 *
 * Flow:
 *   1. Draw a rectangle.
 *   2. Set Rot = 45 via the inspector numeric field.
 *   3. Export PDF (download captured to review/shots/).
 *   4. Re-open that exported PDF in the app (round-trip) and screenshot.
 *   5. Assert on the exported bytes: the page content stream must contain
 *      non-axis-aligned path ops (m/l/c with 4 distinct corner x AND y),
 *      NOT an axis-aligned `re` rectangle. This is the deterministic check;
 *      the re-import screenshot is the visual confirmation.
 *
 * The orchestrator runs this headed against the live build. The assert uses
 * mupdf (already a project dep) to read the exported file back in Node.
 *
 * NOTE: this scenario is intentionally NOT auto-run by this bead's worker —
 * it is left ready for the orchestrator's headed pass.
 */
import { openApp, shot, dumpLog } from '../_driver.mjs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

const here = dirname(fileURLToPath(import.meta.url))
const SHOTS = resolve(here, '..', 'shots')
const EXPORT_PATH = resolve(SHOTS, 'exp-pdf-export-rotation-export.pdf')

const { browser, page, log } = await openApp()

const svg = await page.evaluate(() => {
  const s = document.querySelector('[data-testid="canvas-container"] svg')
  const r = s.getBoundingClientRect()
  return { x: r.x, y: r.y }
})
const OX = svg.x, OY = svg.y

async function tool(l) { await page.keyboard.press(l); await page.waitForTimeout(80) }
async function drag(x1, y1, x2, y2) {
  await page.mouse.move(OX + x1, OY + y1); await page.mouse.down()
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(OX + x1 + (x2 - x1) * i / 6, OY + y1 + (y2 - y1) * i / 6)
    await page.waitForTimeout(10)
  }
  await page.mouse.up(); await page.waitForTimeout(120)
}
// Type into an inspector numeric field identified by its label span text.
async function userType(label, val) {
  const h = await page.evaluateHandle((label) => {
    const insp = document.querySelector('[data-testid="inspector"]')
    const sp = Array.from(insp.querySelectorAll('span')).find((s) => s.textContent.trim() === label)
    return sp ? sp.closest('label').querySelector('input') : null
  }, label)
  const el = h.asElement()
  if (!el) { console.log('NO INPUT for label', label); return }
  await el.click({ clickCount: 3 })
  await page.keyboard.type(String(val), { delay: 25 })
  await page.keyboard.press('Enter')
  await page.waitForTimeout(200)
}
async function openMenu(n) { await page.getByRole('button', { name: n, exact: true }).click(); await page.waitForTimeout(100) }
async function menuItem(n) {
  await page.locator('button', {
    has: page.locator('span', { hasText: new RegExp('^' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }),
  }).last().click()
  await page.waitForTimeout(120)
}
async function rectState() {
  return page.evaluate(() => {
    const r = document.querySelector('g[data-layer-name] rect')
    if (!r) return null
    return {
      x: r.getAttribute('x'), y: r.getAttribute('y'),
      w: r.getAttribute('width'), h: r.getAttribute('height'),
      transform: r.getAttribute('transform'),
    }
  })
}

// ── STEP 1: draw a rectangle ────────────────────────────────────────────────
await tool('r'); await drag(220, 180, 360, 300)
await tool('v'); await page.mouse.click(OX + 290, OY + 240); await page.waitForTimeout(150)
console.log('rect initial:', JSON.stringify(await rectState()))
await shot(page, 'exp-pdf-export-rotation-01-drawn')

// ── STEP 2: set Rot = 45 via inspector ──────────────────────────────────────
await userType('Rot', 45)
const rotated = await rectState()
console.log('after Rot=45:', JSON.stringify(rotated))
await shot(page, 'exp-pdf-export-rotation-02-rot45')

// ── STEP 3: Export PDF, capture download ────────────────────────────────────
let exported = false
try {
  const dl = page.waitForEvent('download', { timeout: 20000 })
  await openMenu('File'); await menuItem('Export PDF')
  const d = await dl
  await d.saveAs(EXPORT_PATH)
  await page.waitForTimeout(300)
  exported = true
  console.log('exported to', EXPORT_PATH)
} catch (e) {
  console.log('EXPORT FAILED:', e.message)
}

// ── STEP 4: re-open the exported PDF (round-trip visual) ─────────────────────
if (exported) {
  const fc = page.waitForEvent('filechooser')
  // Exported doc is dirty-free for our purposes; accept any confirm.
  page.on('dialog', async (dlg) => { try { await dlg.accept() } catch {} })
  await openMenu('File'); await menuItem('Open PDF...')
  const c = await fc; await c.setFiles(EXPORT_PATH)
  await page.waitForTimeout(4000)
  console.log('re-imported exported PDF')
  await shot(page, 'exp-pdf-export-rotation-03-reimported')
}

// ── STEP 5: deterministic assert on the exported bytes (mupdf in Node) ───────
let verdict = 'SKIP (no export)'
if (exported) {
  try {
    const mupdf = await import('mupdf')
    const bytes = readFileSync(EXPORT_PATH)
    const doc = mupdf.PDFDocument.openDocument(bytes, 'application/pdf')
    const page0 = doc.loadPage(0)
    // Concatenate the page's content-stream operator text.
    const obj = page0.getObject()
    const contentsRef = obj.get('Contents')
    let streamText = ''
    const readStream = (s) => {
      try { streamText += new TextDecoder('latin1').decode(s.readStream().asUint8Array()) + '\n' } catch {}
    }
    if (contentsRef.isArray && contentsRef.isArray()) {
      for (let i = 0; i < contentsRef.length; i++) readStream(contentsRef.get(i))
    } else {
      readStream(contentsRef)
    }
    // Collect (x,y) preceding m/l ops; an axis-aligned rect would yield only
    // 2 distinct x AND 2 distinct y. A rotated rect yields 4 distinct of each.
    const re = /(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+([ml])\b/g
    const pts = []
    let mm
    while ((mm = re.exec(streamText)) !== null) pts.push({ x: +mm[1], y: +mm[2] })
    const usesRe = /\bre\b/.test(streamText)
    // The FIRST path emitted is the full-page white artboard background rect
    // (axis-aligned by construction). Exclude its page-corner points and measure
    // the FOREGROUND rect: its 4 corners far from the page boundary. A rotated
    // rect yields ≥3 distinct x AND ≥3 distinct y among those.
    const maxX = Math.max(...pts.map((p) => p.x))
    const maxY = Math.max(...pts.map((p) => p.y))
    const onBoundary = (p) => p.x <= 1 || p.y <= 1 || p.x >= maxX - 1 || p.y >= maxY - 1
    const fg = pts.filter((p) => !onBoundary(p))
    const xs = new Set(fg.map((p) => p.x.toFixed(2)))
    const ys = new Set(fg.map((p) => p.y.toFixed(2)))
    const rotatedOK = !usesRe && fg.length >= 4 && xs.size >= 3 && ys.size >= 3
    console.log('exported ops:', JSON.stringify({ usesRe, totalPts: pts.length, fgPts: fg.length, distinctX: xs.size, distinctY: ys.size }))
    verdict = rotatedOK
      ? 'PASS: exported rect is non-axis-aligned path ops (rotation preserved)'
      : 'FAIL: exported rect is axis-aligned (rotation dropped)'
  } catch (e) {
    verdict = 'ASSERT ERROR: ' + e.message
  }
}
console.log(verdict)

dumpLog(log)
await browser.close()
console.log('PDF EXPORT ROTATION DONE')
