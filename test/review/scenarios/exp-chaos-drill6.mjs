import { openApp, dumpLog } from '../_driver.mjs'

const { browser, page, log } = await openApp()
const box = await page.locator('[data-role="canvas-root"]').boundingBox()
async function kids() { return await page.evaluate(() => document.querySelector('g[data-layer-name]')?.children.length ?? -1) }
async function selInfo() {
  return await page.evaluate(() => ({
    sel: document.querySelectorAll('[data-role="selection-box"]').length,
    insp: (document.querySelector('[data-testid="inspector"]')?.innerText || '').replace(/\s+/g, ' ').slice(0, 40),
  }))
}
async function drag(x1, y1, x2, y2) {
  await page.mouse.move(box.x + x1, box.y + y1); await page.mouse.down()
  for (let i = 1; i <= 5; i++) { await page.mouse.move(box.x + x1 + (x2 - x1) * i / 5, box.y + y1 + (y2 - y1) * i / 5); await page.waitForTimeout(8) }
  await page.mouse.up(); await page.waitForTimeout(80)
}
async function reset() {
  await page.keyboard.press('v'); await page.waitForTimeout(60)
  await page.keyboard.press('Control+a'); await page.keyboard.press('Delete'); await page.waitForTimeout(120)
}

const positions = [
  [80, 80, 150, 140], [200, 90, 280, 150], [330, 70, 400, 160], [460, 90, 540, 150],
  [90, 220, 160, 300], [240, 230, 320, 300], [400, 220, 480, 300], [560, 230, 640, 300],
  [120, 360, 200, 430], [320, 360, 420, 440],
]

// TEST: each position drawn in ISOLATION on empty canvas
console.log('=== isolated draws (reset between each) ===')
for (let i = 0; i < positions.length; i++) {
  await reset()
  await page.keyboard.press('r'); await page.waitForTimeout(120)
  const b = await kids()
  await drag(...positions[i])
  console.log(`  pos ${i} ${JSON.stringify(positions[i])}: created ${(await kids()) - b}`)
}

// TEST: in sequence but log selection BEFORE each drag (after pressing R)
await reset()
console.log('\n=== sequence: selection state after pressing R, before drag ===')
for (let i = 0; i < positions.length; i++) {
  await page.keyboard.press('r'); await page.waitForTimeout(120)
  const before = await selInfo()
  const b = await kids()
  await drag(...positions[i])
  const created = (await kids()) - b
  console.log(`  pos ${i}: selBeforeDrag=${before.sel} insp="${before.insp}" -> created ${created} ${created !== 1 ? '<<DROP' : ''}`)
}

dumpLog(log)
await browser.close()
console.log('DRILL6 DONE')
