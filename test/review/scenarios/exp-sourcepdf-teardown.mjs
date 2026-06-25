// vectorfeld-3yu.15 + .14 (SVG side): Open-SVG tears down a stale SourcePdfStore
// and is undoable, with no phantom Layers-panel rows.
//
// Scenario: Open the PDF fixture (primary import, pins ~10MB + a primary entry),
// then Open an SVG fixture. Assert:
//   (a) the Open-SVG confirm fired (dirty doc → replace prompt),
//   (b) the Layers panel row count matches the NEW (SVG) document — no phantom
//       rows left over from the PDF document,
//   (c) Ctrl+Z restores the prior PDF document,
//   (d) zero page errors.
//
// Built on _driver.mjs; reuses the menuFileItem / layerStats patterns from
// exp-pdf-import.mjs.

import { openApp, shot, dumpLog, FIXTURES } from '../_driver.mjs'
import { resolve } from 'node:path'

const PDF_FIXTURE = resolve(FIXTURES, 'Flyer Swift Vortragscoaching 15.04.2026 noheader.pdf')
const SVG_FIXTURE = resolve(FIXTURES, '..', '..', 'golden', 'milestones', 'fixtures', '02-filled-circle.svg')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// DOM-level layer/viewBox stats.
async function docStats(page) {
  return page.evaluate(() => {
    const layers = Array.from(document.querySelectorAll('g[data-layer-name]'))
    const svg = document.querySelector('svg[viewBox]')
    return {
      viewBox: svg?.getAttribute('viewBox') || null,
      layerCount: layers.length,
      layerNames: layers.map((l) => l.getAttribute('data-layer-name')),
    }
  })
}

// Count the Layers-panel rows actually rendered in the inspector (each row has
// the layer-control buttons + a thumb svg). This is the "phantom rows" check —
// it reads the React-rendered panel, NOT the SVG DOM.
async function panelRowCount(page) {
  return page.evaluate(() => {
    const panel = document.querySelector('[data-testid="inspector"]')
    if (!panel) return -1
    const rows = Array.from(panel.querySelectorAll('div')).filter(
      (d) => d.querySelectorAll(':scope > button').length >= 4 && d.querySelector('svg'),
    )
    return rows.length
  })
}

async function menuFileItem(page, itemLabel, filePath) {
  const fc = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'File', exact: true }).click()
  await page.getByText(itemLabel, { exact: false }).last().click()
  const chooser = await fc
  await chooser.setFiles(filePath)
}

const { browser, page, log } = await openApp()

console.log('\n##### STEP 1: Open PDF (primary import) — pins SourcePdfStore.primary')
await menuFileItem(page, 'Open PDF...', PDF_FIXTURE)
await sleep(4500)
const afterPdf = await docStats(page)
const pdfPanelRows = await panelRowCount(page)
console.log('after PDF:', JSON.stringify({ ...afterPdf, panelRows: pdfPanelRows }))
await shot(page, 'exp-sourcepdf-teardown-01-pdf')

console.log('\n##### STEP 2: Open SVG — must confirm (dirty), then REPLACE')
let confirmSeen = false
let confirmMsg = null
const onDialog = async (d) => { confirmSeen = true; confirmMsg = d.message(); console.log('  dialog:', JSON.stringify(d.message())); await d.accept() }
page.on('dialog', onDialog)
await menuFileItem(page, 'Open SVG...', SVG_FIXTURE)
await sleep(2500)
page.off('dialog', onDialog)
const afterSvg = await docStats(page)
const svgPanelRows = await panelRowCount(page)
console.log('after SVG:', JSON.stringify({ ...afterSvg, panelRows: svgPanelRows }))
await shot(page, 'exp-sourcepdf-teardown-02-svg')

// (a) confirm fired
const confirmOk = confirmSeen && /SVG/i.test(confirmMsg || '')
console.log(confirmOk ? 'PASS (a): Open-SVG confirm fired' : 'FAIL (a): confirm did NOT fire')

// (b) no phantom rows: panel row count == NEW document's layer count
const noPhantom = svgPanelRows === afterSvg.layerCount && afterSvg.layerCount > 0
console.log(noPhantom
  ? `PASS (b): panel rows (${svgPanelRows}) match NEW doc layers (${afterSvg.layerCount}) — no phantom rows`
  : `FAIL (b): panel rows ${svgPanelRows} vs NEW doc layers ${afterSvg.layerCount}`)

console.log('\n##### STEP 3: Ctrl+Z restores the prior PDF document')
await page.keyboard.press('Control+z')
await sleep(1500)
const afterUndo = await docStats(page)
const undoPanelRows = await panelRowCount(page)
console.log('after Ctrl+Z:', JSON.stringify({ ...afterUndo, panelRows: undoPanelRows }))
await shot(page, 'exp-sourcepdf-teardown-03-undo')

// (c) undo restored the PDF doc (viewBox + layer names match the post-PDF state)
const undoOk =
  afterUndo.viewBox === afterPdf.viewBox &&
  JSON.stringify(afterUndo.layerNames) === JSON.stringify(afterPdf.layerNames)
console.log(undoOk
  ? 'PASS (c): Ctrl+Z restored the prior PDF document'
  : 'FAIL (c): Ctrl+Z did NOT restore the prior PDF document')

dumpLog(log)

// (d) zero page errors
const pageErrors = log.pageerrors.length
console.log((pageErrors === 0)
  ? 'PASS (d): 0 page errors'
  : `FAIL (d): ${pageErrors} page errors`)

const allPass = confirmOk && noPhantom && undoOk && pageErrors === 0
console.log(`\nRESULT: ${allPass ? 'PASS' : 'FAIL'} — confirm=${confirmOk} phantom-free=${noPhantom} undo=${undoOk} pageErrors=${pageErrors}`)

await browser.close()
console.log('\nDONE')
