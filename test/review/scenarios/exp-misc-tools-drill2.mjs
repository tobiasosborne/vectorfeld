import { openApp, shot, dumpLog } from '../_driver.mjs'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const { browser, page, log } = await openApp()
const b = await page.locator('[data-role="canvas-root"]').boundingBox()
async function drawRect(cx, cy, w, h) {
  await page.mouse.move(b.x + cx, b.y + cy); await page.mouse.down()
  await page.mouse.move(b.x + cx + w, b.y + cy + h, { steps: 8 }); await page.mouse.up()
}
await page.evaluate(() => { import('/src/tools/registry.ts').then(m => { window.__getActiveTool = m.getActiveToolName }) })
await sleep(150)

// draw a couple rects in a known area
await page.keyboard.press('r'); await drawRect(200, 200, 80, 60)
await page.keyboard.press('r'); await drawRect(320, 220, 80, 60)
await sleep(150)
const k = await page.evaluate(() => document.querySelector('g[data-layer-name]')?.children.length)
console.log('rects:', k)

// LASSO that clearly encloses both centers (~240,230 and ~360,250)
await page.locator('[data-role="overflow"]').click(); await sleep(100)
await page.evaluate(() => { const m=document.querySelector('[data-role="overflow-menu"]'); Array.from(m.querySelectorAll('button'))[4].click() }) // lasso idx 4
await sleep(100)
console.log('active:', await page.evaluate(()=>window.__getActiveTool?.()))
await page.mouse.move(b.x + 150, b.y + 150); await page.mouse.down()
await page.mouse.move(b.x + 450, b.y + 150, { steps: 8 })
await page.mouse.move(b.x + 450, b.y + 320, { steps: 8 })
await page.mouse.move(b.x + 150, b.y + 320, { steps: 8 })
await page.mouse.move(b.x + 150, b.y + 150, { steps: 8 })
await page.mouse.up()
await sleep(200)
const selAfterLasso = await page.evaluate(() => ({
  selBoxes: document.querySelectorAll('[data-role="selection-box"]').length,
  inspector: document.querySelector('[data-testid="inspector"]')?.innerText?.split('\n')[0]
}))
console.log('after lasso enclosing both:', JSON.stringify(selAfterLasso))
await shot(page, 'exp-misc-tools-drill2-lasso')

// FREE TRANSFORM with selection present: select one rect first
await page.keyboard.press('v')
await page.mouse.click(b.x + 240, b.y + 230)
await sleep(150)
console.log('selected before FT:', await page.evaluate(()=>document.querySelector('[data-testid="inspector"]')?.innerText?.split('\n')[0]))
await page.locator('[data-role="overflow"]').click(); await sleep(100)
await page.evaluate(() => { const m=document.querySelector('[data-role="overflow-menu"]'); Array.from(m.querySelectorAll('button'))[5].click() }) // FT idx 5
await sleep(150)
console.log('FT active:', await page.evaluate(()=>window.__getActiveTool?.()))
const ftOverlay = await page.evaluate(() => ({
  selBoxes: document.querySelectorAll('[data-role="selection-box"]').length,
  scaleHandles: document.querySelectorAll('[data-role="scale-handle"]').length,
  rotHandle: document.querySelectorAll('[data-role="rotation-handle"]').length,
}))
console.log('FT overlay:', JSON.stringify(ftOverlay))
await shot(page, 'exp-misc-tools-drill2-ft')

dumpLog(log)
await browser.close()
