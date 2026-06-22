import { openApp, dumpLog } from '../_driver.mjs'

const { browser, page, log } = await openApp()
const box = await page.locator('[data-role="canvas-root"]').boundingBox()

async function pressR(wait) { await page.keyboard.press('r'); await page.waitForTimeout(wait) }
async function activeSlot() {
  return await page.evaluate(() => {
    const a = document.querySelector('[data-tool-slot][data-active="true"]')
    return a ? a.getAttribute('data-tool-slot') : 'none'
  })
}
async function kids() { return await page.evaluate(() => document.querySelector('g[data-layer-name]')?.children.length ?? -1) }
async function drag(x1, y1, x2, y2) {
  await page.mouse.move(box.x + x1, box.y + y1); await page.mouse.down()
  for (let i = 1; i <= 5; i++) { await page.mouse.move(box.x + x1 + (x2 - x1) * i / 5, box.y + y1 + (y2 - y1) * i / 5); await page.waitForTimeout(8) }
  await page.mouse.up(); await page.waitForTimeout(80)
}

const positions = [
  [80, 80, 150, 140], [200, 90, 280, 150], [330, 70, 400, 160], [460, 90, 540, 150],
  [90, 220, 160, 300], [240, 230, 320, 300], [400, 220, 480, 300], [560, 230, 640, 300],
  [120, 360, 200, 430], [320, 360, 420, 440],
]

// Test with varying wait after pressing R to find the threshold
for (const waitMs of [40, 100, 300]) {
  // reset
  await page.keyboard.press('v'); await page.waitForTimeout(100)
  await page.keyboard.press('Control+a'); await page.keyboard.press('Delete'); await page.waitForTimeout(150)
  console.log(`\n===== wait after R = ${waitMs}ms =====`)
  let i = 0
  for (const [a, b, c, d] of positions) {
    await pressR(waitMs)
    const slotBefore = await activeSlot()
    const kBefore = await kids()
    await drag(a, b, c, d)
    const kAfter = await kids()
    const created = kAfter - kBefore
    console.log(`  draw ${i}: slot-before-drag=${slotBefore}  created=${created}  ${created !== 1 ? '<<< DROPPED' : ''}`)
    i++
  }
  console.log(`  total kids: ${await kids()} (expected 10)`)
}

dumpLog(log)
await browser.close()
console.log('DRILL4 DONE')
