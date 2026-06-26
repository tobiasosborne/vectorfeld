// vectorfeld-3yu.2 — AUTHORITATIVE acceptance: edit imported PDF text, EXPORT,
// reopen, and confirm the new word renders (in the source font) while the
// original run's text is gone (redacted). This is the literal "open PDF → fix a
// word → export" journey. Run headed:
//   xvfb-run -a node test/review/scenarios/exp-edit-imported-text-export.mjs

import { openApp, shot, dumpLog, FIXTURES } from '../_driver.mjs'
import { resolve } from 'node:path'
import { readFileSync, writeFileSync } from 'node:fs'

const FG = resolve(FIXTURES, 'Flyer Swift Vortragscoaching 15.04.2026 noheader.pdf')
const NEW_WORD = 'Klarheit'
const { browser, page, log } = await openApp()

async function openPdf(file) {
  const fc = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'File', exact: true }).click()
  await page.getByRole('button', { name: 'Open PDF...', exact: true }).last().click()
  ;(await fc).setFiles(file)
  await page.waitForFunction(() => {
    const ls = document.querySelectorAll('g[data-layer-name]')
    return ls.length >= 1 && Array.from(ls).some((l) => l.children.length > 0)
  }, { timeout: 40000 }).catch(() => {})
  await page.waitForTimeout(1000)
}
await openPdf(FG)

// Pick the widest fully-on-screen source run (same heuristic the impl scenario uses).
const targetHandle = await page.evaluateHandle(() => {
  const vw = window.innerWidth, vh = window.innerHeight
  const texts = Array.from(document.querySelectorAll('g[data-layer-name] text'))
  const on = texts.map((t) => ({ t, r: t.getBoundingClientRect() }))
    .filter(({ t, r }) => (t.textContent || '').trim().length >= 6
      && r.width > 8 && r.height > 6 && r.left >= 0 && r.top >= 0 && r.right <= vw && r.bottom <= vh)
  on.sort((a, b) => b.r.width - a.r.width)
  return on.length ? on[0].t : null
})
const meta = await targetHandle.evaluate((el) => el ? ({
  text: el.textContent || '', r: el.getBoundingClientRect(),
  cx: el.getBoundingClientRect().x + el.getBoundingClientRect().width / 2,
  cy: el.getBoundingClientRect().y + el.getBoundingClientRect().height / 2,
}) : null)
if (!meta) { console.log('NO ON-SCREEN TEXT'); dumpLog(log); await browser.close(); process.exit(1) }
const OLD_TEXT = meta.text.trim()
console.log('TARGET run text:', JSON.stringify(OLD_TEXT))

// === edit: dblclick → textarea → select-all → type → blur-commit ===
await page.keyboard.press('v'); await page.waitForTimeout(120)
await page.mouse.dblclick(meta.cx, meta.cy); await page.waitForTimeout(350)
const hasTa = await page.evaluate(() => !!document.querySelector('textarea[data-role="text-edit-overlay"]'))
console.log('textarea mounted:', hasTa)
await page.keyboard.press('Control+a'); await page.waitForTimeout(60)
await page.keyboard.type(NEW_WORD, { delay: 25 }); await page.waitForTimeout(120)
// commit via blur by clicking the inspector chrome (not the canvas)
const inspPt = await page.evaluate(() => {
  const i = document.querySelector('[data-testid="inspector"]'); if (!i) return null
  const r = i.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + 24 }
})
if (inspPt) await page.mouse.click(inspPt.x, inspPt.y)
else await page.evaluate(() => document.activeElement && document.activeElement.blur())
await page.waitForTimeout(300)
const canvasText = await targetHandle.evaluate((el) => el.textContent || '')
console.log('canvas run text after edit:', JSON.stringify(canvasText))
await shot(page, 'exp-edit-export-01-edited')

// === export PDF, capture download ===
const dl = page.waitForEvent('download', { timeout: 60000 })
await page.getByRole('button', { name: 'Export PDF', exact: true }).last().click()
const download = await dl.catch(() => null)
let pass = false
if (!download) {
  console.log('FAIL: no download event')
} else {
  const outPath = resolve(process.cwd(), 'test/review/shots/edit-imported-text-export.pdf')
  await download.saveAs(outPath)
  const bytes = new Uint8Array(readFileSync(outPath))

  // Extract page text from the EXPORTED pdf and render it.
  const mupdf = await import('mupdf')
  const doc = mupdf.PDFDocument.openDocument(bytes, 'application/pdf')
  const stext = doc.loadPage(0).toStructuredText('preserve-whitespace').asText()
  // distinctive chunk of the original run (first ~16 chars) that should be gone
  const oldChunk = OLD_TEXT.replace(/\s+/g, ' ').slice(0, 16)
  const newPresent = stext.includes(NEW_WORD)
  const oldGone = oldChunk.length >= 6 ? !stext.includes(oldChunk) : true
  console.log('exported text contains NEW word:', newPresent, `("${NEW_WORD}")`)
  console.log('exported text DROPPED old run :', oldGone, `("${oldChunk}")`)
  pass = newPresent && oldGone

  // render for visual eyeball
  try {
    const pix = doc.loadPage(0).toPixmap(mupdf.Matrix.scale(1.4, 1.4), mupdf.ColorSpace.DeviceRGB, false)
    writeFileSync(resolve(process.cwd(), 'test/review/shots/edit-imported-text-export.png'), pix.asPNG())
    console.log('rendered exported PDF')
  } catch (e) { console.log('render note:', e.message) }
}

console.log(pass ? 'EDIT-EXPORT ACCEPTANCE: PASS' : 'EDIT-EXPORT ACCEPTANCE: FAIL')
dumpLog(log)
await browser.close()
