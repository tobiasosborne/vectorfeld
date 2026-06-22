import { openApp, dumpLog } from '../_driver.mjs'
const { browser, page, log } = await openApp()
const svg = await page.evaluate(() => { const s = document.querySelector('[data-testid="canvas-container"] svg'); const r = s.getBoundingClientRect(); return { x: r.x, y: r.y } })
const OX = svg.x, OY = svg.y
async function tool(l) { await page.keyboard.press(l); await page.waitForTimeout(60) }
async function drag(x1, y1, x2, y2) {
  await page.mouse.move(OX + x1, OY + y1); await page.mouse.down()
  for (let i = 1; i <= 5; i++) { await page.mouse.move(OX + x1 + (x2 - x1) * i / 5, OY + y1 + (y2 - y1) * i / 5); await page.waitForTimeout(8) }
  await page.mouse.up(); await page.waitForTimeout(70)
}
async function kids() { return await page.evaluate(() => document.querySelector('g[data-layer-name]')?.children.length ?? -1) }

for (let i = 0; i < 5; i++) { await tool('r'); await drag(40 + i * 60, 60, 90 + i * 60, 110) }
await tool('v')
console.log('drew 5:', await kids())
for (let i = 0; i < 5; i++) { await page.keyboard.press('Control+z'); await page.waitForTimeout(50) }
console.log('after undo x5:', await kids())
console.log('--- redo with Ctrl+Shift+Z ---')
for (let i = 0; i < 6; i++) { await page.keyboard.press('Control+Shift+Z'); await page.waitForTimeout(50); console.log(`  redo ${i + 1}: kids=${await kids()}`) }
console.log('--- and Ctrl+Y (likely no-op) ---')
await page.keyboard.press('Control+z'); await page.waitForTimeout(50)
console.log('one undo:', await kids())
await page.keyboard.press('Control+y'); await page.waitForTimeout(50)
console.log('after Ctrl+Y:', await kids())
dumpLog(log)
await browser.close()
console.log('REDO TEST DONE')
