import { openApp, shot, dumpLog } from '../_driver.mjs'
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
async function undo() { await page.keyboard.press('Control+z'); await page.waitForTimeout(50) }
async function redo() { await page.keyboard.press('Control+Shift+Z'); await page.waitForTimeout(50) }

// 5 rects, copy/paste-storm to ~35, then delete-all, then undo step by step
for (let i = 0; i < 5; i++) { await tool('r'); await drag(40 + i * 70, 60, 100 + i * 70, 120) }
await tool('v'); await page.keyboard.press('Control+a'); await page.waitForTimeout(50)
console.log('seed all selected:', await kids())
for (let n = 0; n < 4; n++) { await page.keyboard.press('Control+c'); await page.waitForTimeout(40); await page.keyboard.press('Control+v'); await page.waitForTimeout(80); console.log(`  paste ${n}: kids=${await kids()}`) }
const peak = await kids()
console.log('peak kids:', peak)
// delete all
await page.keyboard.press('Control+a'); await page.waitForTimeout(40)
await page.keyboard.press('Delete'); await page.waitForTimeout(80)
console.log('after delete-all:', await kids())
// undo step by step, log each
console.log('--- undo steps ---')
for (let n = 0; n < 12; n++) { await undo(); console.log(`  undo ${n + 1}: kids=${await kids()}`) }
await shot(page, 'exp-chaos-undo2-final')
console.log('--- redo steps ---')
for (let n = 0; n < 12; n++) { await redo(); console.log(`  redo ${n + 1}: kids=${await kids()}`) }
dumpLog(log)
await browser.close()
console.log('UNDO2 DONE')
