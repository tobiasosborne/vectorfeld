import { openApp, shot, dumpLog } from '../_driver.mjs'

const { browser, page, log } = await openApp()
const box = await page.locator('[data-role="canvas-root"]').boundingBox()

async function fileMenuItem(name) {
  await page.getByRole('button', { name: 'File', exact: true }).click()
  await page.waitForTimeout(150)
  await page.locator('button', { has: page.locator('span', { hasText: new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')) }) }).last().click()
  await page.waitForTimeout(200)
}
async function snapDims() {
  return await page.evaluate(() => {
    const svg = document.querySelector('[data-role="canvas-root"] svg') || document.querySelector('svg')
    const ab = document.querySelector('[data-role="artboard"]')
    return {
      viewBox: svg ? svg.getAttribute('viewBox') : null,
      svgW: svg ? svg.getAttribute('width') : null,
      svgH: svg ? svg.getAttribute('height') : null,
      artboard: ab ? { w: ab.getAttribute('width'), h: ab.getAttribute('height') } : null,
    }
  })
}

console.log('=== DRILL A: Artboard resize on FRESH doc (no content) ===')
console.log('initial:', JSON.stringify(await snapDims()))
await fileMenuItem('Document Setup')
await page.waitForTimeout(200)
// Set explicit custom size 500 x 400 by typing
const w = page.locator('[data-testid="artboard-width"]')
const h = page.locator('[data-testid="artboard-height"]')
await w.fill('500')
await h.fill('400')
await page.waitForTimeout(80)
await page.locator('[data-testid="artboard-apply"]').click()
await page.waitForTimeout(500)
const after = await snapDims()
console.log('after apply 500x400:', JSON.stringify(after))
console.log('>>> viewBox reflects 500x400?', /500/.test(after.viewBox||'') && /400/.test(after.viewBox||''))
console.log('>>> artboard rect resized to 500x400?', after.artboard && after.artboard.w==='500' && after.artboard.h==='400')
await shot(page, 'exp-save-open-drill-A-resize-fresh')

// Try Square 100 preset too
console.log('\n=== DRILL A2: Square 100 preset ===')
await fileMenuItem('Document Setup')
await page.waitForTimeout(200)
await page.getByRole('button', { name: 'Square 100', exact: true }).click()
await page.waitForTimeout(100)
await page.locator('[data-testid="artboard-apply"]').click()
await page.waitForTimeout(500)
const after2 = await snapDims()
console.log('after Square 100:', JSON.stringify(after2))
await shot(page, 'exp-save-open-drill-A2-square100')

console.log('\n=== DRILL B: Text edit-mode swallows tool shortcuts ===')
// click text tool, click canvas, type, then press a tool key. Does the tool key get typed?
await page.keyboard.press('t')
await page.waitForTimeout(80)
await page.mouse.click(box.x + 200, box.y + 200)
await page.waitForTimeout(150)
await page.keyboard.type('ABC')
await page.waitForTimeout(120)
// now press 'r' (rect tool) WITHOUT escaping edit mode
await page.keyboard.press('r')
await page.waitForTimeout(120)
const activeTool = await page.evaluate(() => {
  const el = document.querySelector('[data-tool-slot][data-active="true"]')
  return el ? el.getAttribute('data-tool-slot') : null
})
const textContent = await page.evaluate(() => {
  const t = Array.from(document.querySelectorAll('g[data-layer-name] text')).map(x=>x.textContent)
  return t
})
console.log('After typing ABC then pressing r: activeTool=', activeTool, ' textRuns=', JSON.stringify(textContent))
console.log('>>> BUG if textContent contains "ABCr" (r swallowed) AND/OR tool did not switch')
await shot(page, 'exp-save-open-drill-B-textedit')

// Now try Escape then a tool key — proper way
await page.keyboard.press('Escape')
await page.waitForTimeout(100)
await page.keyboard.press('r')
await page.waitForTimeout(100)
const activeTool2 = await page.evaluate(() => {
  const el = document.querySelector('[data-tool-slot][data-active="true"]')
  return el ? el.getAttribute('data-tool-slot') : null
})
console.log('After Escape then r: activeTool=', activeTool2, '(should be rect)')

dumpLog(log)
await browser.close()
console.log('DRILL DONE')
