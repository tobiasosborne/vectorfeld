import { openApp, dumpLog } from '../_driver.mjs'

const { browser, page, log } = await openApp()
const box = await page.locator('[data-role="canvas-root"]').boundingBox()
console.log('canvas-root box:', JSON.stringify(box))

async function kids() { return await page.evaluate(() => document.querySelector('g[data-layer-name]')?.children.length ?? -1) }
async function reset() {
  await page.keyboard.press('v'); await page.waitForTimeout(50)
  await page.keyboard.press('Control+a'); await page.keyboard.press('Delete'); await page.waitForTimeout(120)
}

const probes = [
  [80, 80], [200, 90], [330, 70], [90, 220], [240, 230],
]
console.log('\n=== elementFromPoint at each start point (canvas-rel) ===')
for (const [x, y] of probes) {
  const info = await page.evaluate(({ sx, sy }) => {
    const el = document.elementFromPoint(sx, sy)
    if (!el) return 'null'
    return `${el.tagName} role=${el.getAttribute('data-role')} cls="${el.getAttribute('class') || ''}" id=${el.id || ''}`
  }, { sx: box.x + x, sy: box.y + y })
  console.log(`  (${x},${y}) screen(${box.x + x},${box.y + y}): ${info}`)
}

// Now hook into the rect tool by drawing and capturing what doc coords result.
// We'll monkeypatch nothing; instead draw pos0 (drops) and pos with same size shifted down, compare.
async function drag(x1, y1, x2, y2) {
  await page.mouse.move(box.x + x1, box.y + y1); await page.mouse.down()
  for (let i = 1; i <= 5; i++) { await page.mouse.move(box.x + x1 + (x2 - x1) * i / 5, box.y + y1 + (y2 - y1) * i / 5); await page.waitForTimeout(8) }
  await page.mouse.up(); await page.waitForTimeout(80)
}

// sweep start-y from 60 to 120 with fixed size 70x60, x=80, find threshold
console.log('\n=== sweep start-y at x=80, size 70x60 ===')
for (let sy = 55; sy <= 130; sy += 5) {
  await reset()
  await page.keyboard.press('r'); await page.waitForTimeout(100)
  const b = await kids()
  await drag(80, sy, 150, sy + 60)
  console.log(`  start-y=${sy}: created ${(await kids()) - b}`)
}

dumpLog(log)
await browser.close()
console.log('DRILL7 DONE')
