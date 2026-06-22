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

// Draw ONE rect, then inspect its fill + DOM rect screen bbox
await tool('r'); await drag(200, 200, 360, 320); await tool('v')
const info = await page.evaluate(() => {
  const layer = document.querySelector('g[data-layer-name]')
  const r = layer.querySelector('rect')
  if (!r) return { none: true }
  const b = r.getBoundingClientRect()
  const cs = getComputedStyle(r)
  return {
    fillAttr: r.getAttribute('fill'), fillCSS: cs.fill,
    strokeAttr: r.getAttribute('stroke'), strokeWidth: r.getAttribute('stroke-width'),
    pointerEvents: cs.pointerEvents,
    screen: { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), cx: Math.round(b.x + b.width / 2), cy: Math.round(b.y + b.height / 2) },
  }
})
console.log('RECT info:', JSON.stringify(info))

// Try clicking the INTERIOR center
await click(700, 700) // deselect first (empty area)
await click(280, 260)
console.log('click interior center:', JSON.stringify(await st()))

// Try clicking on the STROKE edge (left edge x=200)
await click(700, 700)
await click(200, 260)
console.log('click left stroke edge:', JSON.stringify(await st()))

// Try clicking on top stroke edge
await click(700, 700)
await click(280, 200)
console.log('click top stroke edge:', JSON.stringify(await st()))

// What is at screen center per elementFromPoint?
const hit = await page.evaluate(({ bx, by }) => {
  function probe(cx, cy) {
    const el = document.elementFromPoint(cx, cy)
    return el ? `${el.tagName}.${el.getAttribute('data-role') || el.getAttribute('class') || ''}` : 'null'
  }
  return {
    interior: probe(bx + 280, by + 260),
    leftEdge: probe(bx + 200, by + 260),
    topEdge: probe(bx + 280, by + 200),
  }
}, { bx: box.x, by: box.y })
console.log('elementFromPoint:', JSON.stringify(hit))

await shot(page, 'exp-chaos-drill2-fill')
dumpLog(log)
await browser.close()
console.log('DRILL2 DONE')
