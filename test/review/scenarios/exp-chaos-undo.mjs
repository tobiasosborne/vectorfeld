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
async function undo() { await page.keyboard.press('Control+z'); await page.waitForTimeout(60) }
async function redo() { await page.keyboard.press('Control+y'); await page.waitForTimeout(60) }

// TEST 1: simple draw N, undo N -> should go back to 0 one at a time
console.log('=== TEST1: draw 5, undo each ===')
for (let i = 0; i < 5; i++) { await tool('r'); await drag(40 + i * 60, 60, 90 + i * 60, 110) }
await tool('v')
console.log('after draw 5:', await kids())
for (let i = 0; i < 6; i++) { await undo(); console.log(`  undo ${i + 1}: kids=${await kids()}`) }
console.log('--- now redo ---')
for (let i = 0; i < 6; i++) { await redo(); console.log(`  redo ${i + 1}: kids=${await kids()}`) }

// reset
await tool('v'); await page.keyboard.press('Control+a'); await page.keyboard.press('Delete'); await page.waitForTimeout(120)
let i = 0; while ((await kids()) > 0 && i++ < 30) await undo()  // clear history-ish

// TEST 2: draw 3, SELECT-ALL + DELETE, then undo -> should restore all 3 at once
console.log('\n=== TEST2: draw 3, delete-all, undo restores? ===')
// fresh reload to clear history
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(500)
for (let n = 0; n < 3; n++) { await tool('r'); await drag(40 + n * 80, 60, 100 + n * 80, 120) }
await tool('v')
console.log('after draw 3:', await kids())
await page.keyboard.press('Control+a'); await page.waitForTimeout(40)
await page.keyboard.press('Delete'); await page.waitForTimeout(80)
console.log('after select-all+delete:', await kids())
await undo()
console.log('after 1 undo (expect 3 restored):', await kids())
await undo()
console.log('after 2 undo:', await kids())
await undo()
console.log('after 3 undo:', await kids())
await undo()
console.log('after 4 undo:', await kids())
await shot(page, 'exp-chaos-undo-test2')

// TEST 3: copy/paste then undo each paste
console.log('\n=== TEST3: paste storm undo ===')
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(500)
await tool('r'); await drag(100, 100, 180, 180); await tool('v')
await page.mouse.click(OX + 140, OY + 140); await page.waitForTimeout(60)
console.log('seed:', await kids())
for (let n = 0; n < 4; n++) { await page.keyboard.press('Control+c'); await page.waitForTimeout(40); await page.keyboard.press('Control+v'); await page.waitForTimeout(80); console.log(`  paste ${n}: kids=${await kids()}`) }
console.log('--- undo each paste ---')
for (let n = 0; n < 6; n++) { await undo(); console.log(`  undo ${n + 1}: kids=${await kids()}`) }

dumpLog(log)
await browser.close()
console.log('UNDO TEST DONE')
