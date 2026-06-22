import { openApp, shot, dumpLog } from '../_driver.mjs'

const { browser, page, log } = await openApp()
const bb = await page.locator('[data-role="canvas-root"]').boundingBox()

// Instrument: record whether mousemove events during the drag carry altKey
await page.evaluate(() => {
  window.__altSeen = []
  const root = document.querySelector('[data-role="canvas-root"]')
  root.addEventListener('mousemove', (e) => { if (window.__recording) window.__altSeen.push(e.altKey) }, true)
})

await page.keyboard.press('p')
// First anchor (plain)
await page.mouse.move(bb.x + 300, bb.y + 300); await page.mouse.down(); await page.mouse.up()

// Second anchor with ALT held during the handle drag
await page.evaluate(() => { window.__recording = true })
await page.mouse.move(bb.x + 450, bb.y + 350)
await page.mouse.down()
await page.keyboard.down('Alt')
await page.mouse.move(bb.x + 510, bb.y + 350, { steps: 10 })  // drag handle straight right
await page.mouse.up()
await page.keyboard.up('Alt')
await page.evaluate(() => { window.__recording = false })

const altSeen = await page.evaluate(() => window.__altSeen)
console.log('altKey on drag moves:', JSON.stringify(altSeen))

const d = await page.evaluate(() =>
  document.querySelector('path[data-role="preview"]')?.getAttribute('d'))
console.log('PREVIEW D after alt-held handle drag:', d)
await shot(page, 'exp-pen-bezier-alt-confirm')

dumpLog(log)
await browser.close()
