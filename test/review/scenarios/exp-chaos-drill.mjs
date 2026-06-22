import { openApp, shot, dumpLog } from '../_driver.mjs'

const { browser, page, log } = await openApp()
const box = await page.locator('[data-role="canvas-root"]').boundingBox()

async function tool(letter, wait = 120) { await page.keyboard.press(letter); await page.waitForTimeout(wait) }
async function drag(x1, y1, x2, y2) {
  await page.mouse.move(box.x + x1, box.y + y1)
  await page.mouse.down()
  for (let i = 1; i <= 5; i++) { await page.mouse.move(box.x + x1 + (x2 - x1) * i / 5, box.y + y1 + (y2 - y1) * i / 5); await page.waitForTimeout(8) }
  await page.mouse.up()
  await page.waitForTimeout(80)
}
async function click(x, y, opts = {}) {
  if (opts.shift) await page.keyboard.down('Shift')
  await page.mouse.click(box.x + x, box.y + y)
  if (opts.shift) await page.keyboard.up('Shift')
  await page.waitForTimeout(80)
}
async function st() {
  return await page.evaluate(() => ({
    layerKids: document.querySelector('g[data-layer-name]')?.children.length ?? -1,
    selBoxes: document.querySelectorAll('[data-role="selection-box"]').length,
    inspector: (document.querySelector('[data-testid="inspector"]')?.innerText || '').replace(/\s+/g, ' ').slice(0, 60),
  }))
}

// ---- DRILL A: rapid R-then-drag vs slow. Count shapes created. ----
console.log('=== DRILL A: rapid draw, count shapes per iteration ===')
const positions = [
  [80, 80, 150, 140], [200, 90, 280, 150], [330, 70, 400, 160], [460, 90, 540, 150],
  [90, 220, 160, 300], [240, 230, 320, 300], [400, 220, 480, 300], [560, 230, 640, 300],
  [120, 360, 200, 430], [320, 360, 420, 440],
]
let i = 0
for (const [a, b, c, d] of positions) {
  await tool('r', 40)       // fast: 40ms after pressing R
  await drag(a, b, c, d)
  const s = await st()
  console.log(`  draw ${i++}: expected kids=${i}, actual layerKids=${s.layerKids}  (inspector: ${s.inspector})`)
}
await tool('v')
console.log('FINAL after 10 fast draws:', JSON.stringify(await st()))
await shot(page, 'exp-chaos-drill-A-fast')

// reset
await tool('v'); await page.keyboard.press('Control+a'); await page.keyboard.press('Delete'); await page.waitForTimeout(120)

// slow version
console.log('\n=== DRILL A2: SLOW draw (250ms gap), count ===')
i = 0
for (const [a, b, c, d] of positions) {
  await tool('r', 250)
  await drag(a, b, c, d)
  const s = await st()
  console.log(`  draw ${i++}: expected kids=${i}, actual layerKids=${s.layerKids}`)
}
await tool('v')
console.log('FINAL after 10 SLOW draws:', JSON.stringify(await st()))
await shot(page, 'exp-chaos-drill-A2-slow')

// ---- DRILL B: shift-click multi-select on existing shapes ----
console.log('\n=== DRILL B: shift-click multi-select ===')
await tool('v')
// click first shape
await click(115, 110)
console.log('  after click shape1:', JSON.stringify(await st()))
await click(360, 115, { shift: true })
console.log('  after shift-click shape2:', JSON.stringify(await st()))
await click(125, 260, { shift: true })
console.log('  after shift-click shape3:', JSON.stringify(await st()))
await shot(page, 'exp-chaos-drill-B-multiselect')

// Try plain (non-shift) sequential clicks to compare
console.log('\n  -- non-shift sequential clicks --')
await click(115, 110)
console.log('  plain click shape1:', JSON.stringify(await st()))
await click(360, 115)
console.log('  plain click shape2 (should replace):', JSON.stringify(await st()))

// Try marquee/rubber-band select (drag on empty area over shapes)
console.log('\n=== DRILL C: marquee rubber-band select ===')
await click(700, 600) // deselect
await page.mouse.move(box.x + 60, box.y + 60)
await page.mouse.down()
await page.mouse.move(box.x + 560, box.y + 320, { steps: 10 })
await page.mouse.up()
await page.waitForTimeout(150)
console.log('  after marquee:', JSON.stringify(await st()))
await shot(page, 'exp-chaos-drill-C-marquee')

// ---- DRILL D: copy/paste single shape, verify count increases ----
console.log('\n=== DRILL D: copy/paste behavior ===')
await click(700, 600) // deselect
await click(115, 110) // select one
const before = await st()
console.log('  selected one:', JSON.stringify(before))
await page.keyboard.press('Control+c'); await page.waitForTimeout(100)
console.log('  after Ctrl+C:', JSON.stringify(await st()))
await page.keyboard.press('Control+v'); await page.waitForTimeout(150)
const afterPaste = await st()
console.log('  after Ctrl+V:', JSON.stringify(afterPaste))
console.log('  >> paste added shape?', afterPaste.layerKids > before.layerKids)
await shot(page, 'exp-chaos-drill-D-paste')
// paste again
await page.keyboard.press('Control+v'); await page.waitForTimeout(150)
console.log('  after 2nd Ctrl+V:', JSON.stringify(await st()))

dumpLog(log)
await browser.close()
console.log('DRILL DONE')
