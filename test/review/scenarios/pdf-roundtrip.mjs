import { openApp, shot, dumpLog, FIXTURES } from '../_driver.mjs'
import { resolve } from 'node:path'
import { readFileSync, writeFileSync } from 'node:fs'

const FG = resolve(FIXTURES, 'Flyer Swift Vortragscoaching 15.04.2026 noheader.pdf')
const { browser, page, log } = await openApp()

async function openPdf(menuItem, file) {
  const fc = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'File', exact: true }).click()
  await page.getByRole('button', { name: menuItem, exact: true }).last().click()
  const chooser = await fc
  await chooser.setFiles(file)
  await page.waitForFunction(() => {
    const ls = document.querySelectorAll('g[data-layer-name]')
    return ls.length >= 1 && Array.from(ls).some(l => l.children.length > 0)
  }, { timeout: 40000 }).catch(() => console.log('  import wait timed out'))
  await page.waitForTimeout(800)
}

console.log('IMPORT foreground flyer...')
await openPdf('Open PDF...', FG)
await shot(page, 'pdf-01-imported')

const stats = await page.evaluate(() => {
  const layers = Array.from(document.querySelectorAll('g[data-layer-name]'))
  const allEls = document.querySelectorAll('g[data-layer-name] *')
  const texts = document.querySelectorAll('g[data-layer-name] text')
  const tspans = document.querySelectorAll('g[data-layer-name] tspan')
  const images = document.querySelectorAll('g[data-layer-name] image')
  const paths = document.querySelectorAll('g[data-layer-name] path')
  const badge = document.querySelector('[data-role="mostly-outlined-badge"]')
  return {
    layers: layers.map(l => ({ name: l.getAttribute('data-layer-name'), kids: l.children.length,
      textChars: l.getAttribute('data-text-chars'), pathCount: l.getAttribute('data-path-count'),
      mostlyOutlined: l.getAttribute('data-mostly-outlined') })),
    totalEls: allEls.length, texts: texts.length, tspans: tspans.length, images: images.length, paths: paths.length,
    mostlyOutlinedBadgeVisible: !!badge, badgeText: badge ? badge.textContent : null,
  }
})
console.log('IMPORT STATS:', JSON.stringify(stats, null, 2))

// Try clicking on the document to select a text run
console.log('Try selecting content by clicking center...')
const box = await page.locator('[data-role="canvas-root"]').boundingBox()
await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.4)
await page.waitForTimeout(300)
await shot(page, 'pdf-02-click-select')
const selInfo = await page.evaluate(() => {
  const inspector = document.querySelector('[data-testid="inspector"]')
  return { inspectorText: inspector ? inspector.innerText.slice(0, 300) : null,
           selBoxes: document.querySelectorAll('[data-role="selection-box"]').length }
})
console.log('AFTER CLICK:', JSON.stringify(selInfo))

// Export PDF and render it
console.log('EXPORT PDF...')
const dl = page.waitForEvent('download', { timeout: 60000 })
await page.getByRole('button', { name: 'Export PDF', exact: true }).last().click()
const download = await dl.catch(() => null)
if (download) {
  const out = resolve(process.cwd(), 'test/review/shots/pdf-export.pdf')
  await download.saveAs(out)
  const sz = readFileSync(out).length
  console.log('EXPORTED', out, sz, 'bytes')
  try {
    const { renderPdfPageToPng } = await import('../../roundtrip/helpers/renderPdf.ts')
    const png = await renderPdfPageToPng(new Uint8Array(readFileSync(out)), { page: 1, scale: 2 })
    writeFileSync(resolve(process.cwd(), 'test/review/shots/pdf-03-exported-render.png'), png)
    console.log('RENDERED exported PDF to png')
  } catch (e) { console.log('render failed:', e.message) }
} else {
  console.log('EXPORT: no download event')
}

dumpLog(log)
await browser.close()
console.log('PDF-ROUNDTRIP DONE')
