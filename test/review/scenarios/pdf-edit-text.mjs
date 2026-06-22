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
  }, { timeout: 40000 }).catch(() => {})
  await page.waitForTimeout(800)
}

await openPdf('Open PDF...', FG)

// Find the heading text element and its on-screen rect
const target = await page.evaluate(() => {
  const texts = Array.from(document.querySelectorAll('g[data-layer-name] text'))
  // find the text whose content includes 'Kurzfristige'
  let el = texts.find(t => (t.textContent || '').includes('Kurzfristige')) || texts[0]
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { found: !!el, text: (el.textContent || '').slice(0, 40), x: r.x + r.width/2, y: r.y + r.height/2, w: r.width, h: r.height }
})
console.log('TARGET TEXT:', JSON.stringify(target))
if (!target) { console.log('no text found'); await browser.close(); process.exit(0) }

// Make sure select tool is active
await page.keyboard.press('v'); await page.waitForTimeout(100)

// Single click exactly on the heading
await page.mouse.click(target.x, target.y)
await page.waitForTimeout(300)
await shot(page, 'edit-01-single-click')
let sel = await page.evaluate(() => ({
  selBoxes: document.querySelectorAll('[data-role="selection-box"]').length,
  inspector: (document.querySelector('[data-testid="inspector"]')?.innerText || '').slice(0, 200),
}))
console.log('AFTER SINGLE CLICK:', JSON.stringify(sel))

// Double click to enter text editing
await page.mouse.dblclick(target.x, target.y)
await page.waitForTimeout(400)
await shot(page, 'edit-02-double-click')
sel = await page.evaluate(() => ({
  selBoxes: document.querySelectorAll('[data-role="selection-box"]').length,
  editing: !!document.querySelector('[contenteditable="true"], textarea, input:focus'),
  activeTag: document.activeElement?.tagName,
  inspector: (document.querySelector('[data-testid="inspector"]')?.innerText || '').slice(0, 200),
}))
console.log('AFTER DOUBLE CLICK:', JSON.stringify(sel))

// Try selecting all + retyping (if an editor is active)
await page.keyboard.press('Control+a')
await page.keyboard.type('EDITED HEADLINE', { delay: 20 })
await page.waitForTimeout(200)
await page.keyboard.press('Escape')
await page.waitForTimeout(300)
await shot(page, 'edit-03-after-retype')
const afterEdit = await page.evaluate(() => {
  const texts = Array.from(document.querySelectorAll('g[data-layer-name] text')).map(t => (t.textContent||'').slice(0,40))
  return { firstTexts: texts.slice(0, 6) }
})
console.log('TEXTS AFTER EDIT:', JSON.stringify(afterEdit))

// Export and render to see if edit persisted
const dl = page.waitForEvent('download', { timeout: 60000 })
await page.getByRole('button', { name: 'Export PDF', exact: true }).last().click()
const download = await dl.catch(() => null)
if (download) {
  const out = resolve(process.cwd(), 'test/review/shots/edit-export.pdf')
  await download.saveAs(out)
  try {
    const { renderPdfPageToPng } = await import('../../roundtrip/helpers/renderPdf.ts')
    const png = await renderPdfPageToPng(new Uint8Array(readFileSync(out)), { page: 1, scale: 2 })
    writeFileSync(resolve(process.cwd(), 'test/review/shots/edit-04-export-render.png'), png)
    console.log('rendered edited export')
  } catch (e) { console.log('render failed', e.message) }
}

dumpLog(log)
await browser.close()
console.log('EDIT-TEXT DONE')
