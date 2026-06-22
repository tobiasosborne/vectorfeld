import { openApp, shot, dumpLog } from '../_driver.mjs'

const { browser, page, log } = await openApp()
const box = await page.locator('[data-role="canvas-root"]').boundingBox()

async function tool(letter, wait = 150) { await page.keyboard.press(letter); await page.waitForTimeout(wait) }
async function drag(x1, y1, x2, y2) {
  await page.mouse.move(box.x + x1, box.y + y1); await page.mouse.down()
  for (let i = 1; i <= 5; i++) { await page.mouse.move(box.x + x1 + (x2 - x1) * i / 5, box.y + y1 + (y2 - y1) * i / 5); await page.waitForTimeout(8) }
  await page.mouse.up(); await page.waitForTimeout(80)
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
    inspector: (document.querySelector('[data-testid="inspector"]')?.innerText || '').replace(/\s+/g, ' ').slice(0, 50),
  }))
}
// dump each rect's actual screen bbox so we click on real centers
async function rectCenters() {
  return await page.evaluate(({ bx, by }) => {
    const layer = document.querySelector('g[data-layer-name]')
    return Array.from(layer.querySelectorAll('rect')).map(r => {
      const b = r.getBoundingClientRect()
      return { id: r.getAttribute('id'), cx: Math.round(b.x + b.width / 2 - bx), cy: Math.round(b.y + b.height / 2 - by), w: Math.round(b.width), h: Math.round(b.height) }
    })
  }, { bx: box.x, by: box.y })
}

const positions = [
  [80, 80, 150, 140], [200, 90, 280, 150], [330, 70, 400, 160], [460, 90, 540, 150],
  [90, 220, 160, 300], [240, 230, 320, 300], [400, 220, 480, 300], [560, 230, 640, 300],
  [120, 360, 200, 430], [320, 360, 420, 440],
]

// Replicate the EXACT failing sequence: draw 10, select-all+delete, draw 10 again, then select
console.log('=== round 1 draw ===')
for (const [a, b, c, d] of positions) { await tool('r', 60); await drag(a, b, c, d) }
await tool('v')
console.log('round1:', JSON.stringify(await st()))

console.log('=== delete all ===')
await page.keyboard.press('Control+a'); await page.keyboard.press('Delete'); await page.waitForTimeout(150)
console.log('after del:', JSON.stringify(await st()))

console.log('=== round 2 draw ===')
for (const [a, b, c, d] of positions) { await tool('r', 60); await drag(a, b, c, d) }
await tool('v')
console.log('round2:', JSON.stringify(await st()))
await shot(page, 'exp-chaos-drill3-round2')

const centers = await rectCenters()
console.log('REAL rect centers (canvas-rel):', JSON.stringify(centers))

// click on REAL center of first rect
if (centers[0]) {
  await click(700, 700)
  await click(centers[0].cx, centers[0].cy)
  console.log(`click real center of ${centers[0].id} (${centers[0].cx},${centers[0].cy}):`, JSON.stringify(await st()))
  // probe what's under that point
  const probe = await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y)
    return el ? `${el.tagName} role=${el.getAttribute('data-role')} cls=${el.getAttribute('class')}` : 'null'
  }, { x: box.x + centers[0].cx, y: box.y + centers[0].cy })
  console.log('  under point:', probe)
}

// Try the canvas-relative coords I used originally (115,110)
await click(700, 700)
await click(115, 110)
console.log('click (115,110):', JSON.stringify(await st()))

dumpLog(log)
await browser.close()
console.log('DRILL3 DONE')
