import { openApp, shot, dumpLog } from '../_driver.mjs'

const { browser, page, log } = await openApp()
const box = await page.locator('[data-role="canvas-root"]').boundingBox()
const C = (x, y) => ({ x: box.x + x, y: box.y + y })

async function count() {
  return await page.evaluate(() => {
    const layer = document.querySelector('g[data-layer-name]')
    const kids = layer ? layer.children.length : -1
    const sel = document.querySelectorAll('[data-role="selection-box"]').length
    return { layerKids: kids, selectionBoxes: sel }
  })
}
async function step(name, fn) {
  try {
    await fn()
    await page.waitForTimeout(150)
    const c = await count()
    await shot(page, `core-${name}`)
    console.log(`STEP ${name}: layerKids=${c.layerKids} selBoxes=${c.selectionBoxes}`)
  } catch (e) {
    await shot(page, `core-${name}-ERR`)
    console.log(`STEP ${name}: THREW ${e.message}`)
  }
}
async function tool(letter) {
  // rail tools respond to single-letter keyboard shortcuts
  await page.keyboard.press(letter)
  await page.waitForTimeout(80)
}
async function drag(x1, y1, x2, y2) {
  await page.mouse.move(box.x + x1, box.y + y1)
  await page.mouse.down()
  for (let i = 1; i <= 5; i++) {
    await page.mouse.move(box.x + x1 + (x2 - x1) * i / 5, box.y + y1 + (y2 - y1) * i / 5)
    await page.waitForTimeout(12)
  }
  await page.mouse.up()
  await page.waitForTimeout(80)
}

// Enumerate available tools
const tools = await page.evaluate(() => {
  const rail = Array.from(document.querySelectorAll('[data-tool-slot]')).map(e => ({
    slot: e.getAttribute('data-tool-slot'), title: e.getAttribute('title') || e.getAttribute('aria-label') || ''
  }))
  return { rail }
})
console.log('TOOLS:', JSON.stringify(tools))

await step('00-boot', async () => {})
await step('01-rect', async () => { await tool('r'); await drag(120, 120, 320, 240) })
await step('02-select-rect', async () => { await tool('v'); await page.mouse.click(box.x + 220, box.y + 180) })
await step('03-ellipse', async () => { await tool('o'); await drag(380, 120, 560, 260) })
await step('04-line', async () => { await tool('l'); await drag(140, 320, 420, 420) })
await step('05-text', async () => { await tool('t'); await page.mouse.click(box.x + 150, box.y + 480); await page.keyboard.type('Hello vectorfeld', { delay: 15 }) })
await step('06-escape-text', async () => { await page.keyboard.press('Escape') })
await step('07-selectall', async () => { await tool('v'); await page.keyboard.press('Control+a') })
await step('08-group', async () => { await page.keyboard.press('Control+g') })
await step('09-ungroup', async () => { await page.keyboard.press('Control+Shift+g') })
await step('10-rotate-drag', async () => {
  // select the rect again then try the rotation handle
  await page.mouse.click(box.x + 220, box.y + 180)
  const rh = await page.locator('[data-role="rotation-handle"]').first().boundingBox().catch(() => null)
  if (rh) { await page.mouse.move(rh.x + rh.width/2, rh.y + rh.height/2); await page.mouse.down(); await page.mouse.move(rh.x + 60, rh.y + 30); await page.mouse.move(rh.x + 90, rh.y + 80); await page.mouse.up() }
  else console.log('  no rotation-handle visible')
})
await step('11-undo-storm', async () => { for (let i = 0; i < 8; i++) { await page.keyboard.press('Control+z'); await page.waitForTimeout(60) } })
await step('12-redo-storm', async () => { for (let i = 0; i < 8; i++) { await page.keyboard.press('Control+Shift+z'); await page.waitForTimeout(60) } })

dumpLog(log)
await browser.close()
console.log('CORE-EDIT DONE')
