import { openApp, shot, dumpLog } from '../_driver.mjs'

// vectorfeld-3yu.4 — Ungroup must NOT discard the group's transform.
// Scenario: 2 rects -> group -> drag the group -> capture a child's screen
// bbox -> ungroup -> assert the child's screen bbox is unchanged (<= 0.5px).
// If the group transform were dropped on ungroup, the child would snap back by
// the inverse of the group transform (large drift), which this asserts against.

const { browser, page, log } = await openApp()
const box = await page.locator('[data-role="canvas-root"]').boundingBox()

async function tool(letter) { await page.keyboard.press(letter); await page.waitForTimeout(80) }
async function drag(x1, y1, x2, y2) {
  await page.mouse.move(box.x + x1, box.y + y1)
  await page.mouse.down()
  for (let i = 1; i <= 5; i++) {
    await page.mouse.move(box.x + x1 + (x2 - x1) * i / 5, box.y + y1 + (y2 - y1) * i / 5)
    await page.waitForTimeout(10)
  }
  await page.mouse.up()
  await page.waitForTimeout(80)
}
async function clickAt(cx, cy, opts = {}) {
  await page.mouse.click(box.x + cx, box.y + cy, opts)
  await page.waitForTimeout(80)
}
async function openObjectMenu() {
  await page.getByRole('button', { name: 'Object', exact: true }).click()
  await page.waitForTimeout(120)
}
async function clickMenuItem(name) {
  await page.locator('button', { has: page.locator('span', { hasText: new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }) }).last().click()
  await page.waitForTimeout(150)
}
async function objectAction(name) { await openObjectMenu(); await clickMenuItem(name) }

// Screen bbox (getBoundingClientRect) for each non-layer child of the layer.
async function childScreenBoxes() {
  return await page.evaluate(() => {
    const layer = document.querySelector('g[data-layer-name]')
    if (!layer) return []
    const out = []
    const walk = (el) => {
      for (const c of Array.from(el.children)) {
        if (c.tagName === 'rect') {
          const r = c.getBoundingClientRect()
          out.push({ id: c.getAttribute('id'), x: r.x, y: r.y, w: r.width, h: r.height })
        } else if (c.tagName === 'g') {
          walk(c)
        }
      }
    }
    walk(layer)
    return out
  })
}

console.log('=== SETUP: two rects ===')
await tool('r'); await drag(120, 120, 200, 200)   // rect A
await tool('r'); await drag(260, 160, 360, 260)   // rect B
await tool('v')
await shot(page, 'exp-ungroup-transform-01-two-rects')

console.log('=== GROUP both rects ===')
await page.keyboard.press('Control+a'); await page.waitForTimeout(120)
await objectAction('Group')
await shot(page, 'exp-ungroup-transform-02-grouped')

console.log('=== DRAG the group (selectTool writes transform onto the <g>) ===')
// The group is selected after Group; drag it from inside its bounds.
await drag(160, 160, 320, 280)   // move the whole group by ~ (160,120) screen px
await shot(page, 'exp-ungroup-transform-03-moved')

// Capture each child's screen bbox WITH the group transform applied.
const before = await childScreenBoxes()
console.log('Child screen boxes BEFORE ungroup:', JSON.stringify(before))

console.log('=== UNGROUP ===')
// Group should still be selected after the drag; if not, click on it.
let pre = await page.evaluate(() => document.querySelectorAll('[data-role="selection-box"]').length)
if (!pre) { await clickAt(320, 280) }
await objectAction('Ungroup')
await shot(page, 'exp-ungroup-transform-04-ungrouped')

const after = await childScreenBoxes()
console.log('Child screen boxes AFTER ungroup:', JSON.stringify(after))

let ok = true
for (const b of before) {
  const a = after.find((c) => c.id === b.id)
  if (!a) { console.log(`  MISSING child ${b.id} after ungroup`); ok = false; continue }
  const dx = Math.abs(a.x - b.x), dy = Math.abs(a.y - b.y)
  const dw = Math.abs(a.w - b.w), dh = Math.abs(a.h - b.h)
  const drift = Math.max(dx, dy, dw, dh)
  console.log(`  child ${b.id}: drift dx=${dx.toFixed(2)} dy=${dy.toFixed(2)} dw=${dw.toFixed(2)} dh=${dh.toFixed(2)}  (must be <= 0.5px)`)
  if (drift > 0.5) ok = false
}
console.log(ok ? 'PASS: child screen bbox unchanged after ungroup (transform baked)' : 'FAIL: child screen bbox drifted — group transform was dropped')

dumpLog(log)
await browser.close()
console.log('EXP-UNGROUP-TRANSFORM DONE')
