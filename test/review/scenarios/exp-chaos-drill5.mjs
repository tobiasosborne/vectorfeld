import { openApp, dumpLog } from '../_driver.mjs'

const { browser, page, log } = await openApp()
const box = await page.locator('[data-role="canvas-root"]').boundingBox()
async function kids() { return await page.evaluate(() => document.querySelector('g[data-layer-name]')?.children.length ?? -1) }
async function dragRaw(x1, y1, x2, y2, steps = 5, settleMove = false) {
  await page.mouse.move(box.x + x1, box.y + y1); await page.mouse.down()
  for (let i = 1; i <= steps; i++) { await page.mouse.move(box.x + x1 + (x2 - x1) * i / steps, box.y + y1 + (y2 - y1) * i / steps); await page.waitForTimeout(8) }
  if (settleMove) { await page.mouse.move(box.x + x2, box.y + y2); await page.waitForTimeout(40) } // extra settle move
  await page.mouse.up(); await page.waitForTimeout(80)
}

// TEST 1: very first draw on fresh load
await page.keyboard.press('r'); await page.waitForTimeout(150)
const k0 = await kids()
await dragRaw(100, 100, 200, 180)
console.log('TEST1 first-ever draw: created', (await kids()) - k0, '(should be 1)')

// reset
await page.keyboard.press('v'); await page.keyboard.press('Control+a'); await page.keyboard.press('Delete'); await page.waitForTimeout(150)

// TEST 2: draw, then draw again WITHOUT settle move
console.log('\nTEST2: consecutive draws, NO settle move')
for (let i = 0; i < 6; i++) {
  await page.keyboard.press('r'); await page.waitForTimeout(120)
  const b = await kids()
  await dragRaw(100 + i * 30, 100, 160 + i * 30, 160, 5, false)
  console.log(`  draw ${i}: created ${(await kids()) - b}`)
}

// reset
await page.keyboard.press('v'); await page.keyboard.press('Control+a'); await page.keyboard.press('Delete'); await page.waitForTimeout(150)

// TEST 3: same but WITH a settle move before mouseup
console.log('\nTEST3: consecutive draws, WITH settle move before up')
for (let i = 0; i < 6; i++) {
  await page.keyboard.press('r'); await page.waitForTimeout(120)
  const b = await kids()
  await dragRaw(100 + i * 30, 250, 160 + i * 30, 310, 5, true)
  console.log(`  draw ${i}: created ${(await kids()) - b}`)
}

// reset
await page.keyboard.press('v'); await page.keyboard.press('Control+a'); await page.keyboard.press('Delete'); await page.waitForTimeout(150)

// TEST 4: more move steps (10) to ensure RAF flush
console.log('\nTEST4: consecutive draws, 10 move steps')
for (let i = 0; i < 6; i++) {
  await page.keyboard.press('r'); await page.waitForTimeout(120)
  const b = await kids()
  await dragRaw(100 + i * 30, 400, 160 + i * 30, 460, 10, false)
  console.log(`  draw ${i}: created ${(await kids()) - b}`)
}

dumpLog(log)
await browser.close()
console.log('DRILL5 DONE')
