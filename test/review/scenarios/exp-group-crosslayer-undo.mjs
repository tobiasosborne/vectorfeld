// exp-group-crosslayer-undo.mjs — bead vectorfeld-3yu.11
//
// GroupCommand.undo() used to dump ALL grouped children into sel[0]'s layer,
// silently emptying any other layer the selection spanned. The fix captures
// per-child provenance and restores each child to its ORIGINAL layer.
//
// We inject two layers, each with one on-screen rect (mapped into layer-local
// coords so they render on-canvas), marquee-select across both, Ctrl+G to group,
// Ctrl+Z to undo, and assert each layer gets its OWN rect back (1 and 1), not
// 2-and-0. Drives the real Group/undo command path via keyboard shortcuts.
//
// Verified via the headed dogfood harness:
//   xvfb-run -a node test/review/scenarios/exp-group-crosslayer-undo.mjs

import { openApp, shot, dumpLog } from '../_driver.mjs'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const { browser, page, log } = await openApp()

// ── STEP 1: inject Layer 1 rect + a new Layer 2 with its own rect, on-screen ──
const setup = await page.evaluate(() => {
  const layer1 = document.querySelector('g[data-layer-name]')
  if (!layer1) return null
  const svg = layer1.ownerSVGElement
  const inv = layer1.getScreenCTM().inverse()
  const toLocal = (sx, sy) => { const p = svg.createSVGPoint(); p.x = sx; p.y = sy; return p.matrixTransform(inv) }
  const mkRect = (sx, sy, fill) => {
    const o = toLocal(sx, sy)
    const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    r.setAttribute('x', o.x); r.setAttribute('y', o.y)
    r.setAttribute('width', '12'); r.setAttribute('height', '12')
    r.setAttribute('fill', fill)
    return r
  }
  // rect A in Layer 1 (left), rect B in a new Layer 2 (right) — both on-screen,
  // close enough that one marquee covers both.
  const a = mkRect(440, 360, '#4488cc'); layer1.appendChild(a)
  const layer2 = document.createElementNS('http://www.w3.org/2000/svg', 'g')
  layer2.setAttribute('data-layer-name', 'Layer 2')
  layer2.setAttribute('data-layer-id', 'vf-layer-2')
  const b = mkRect(560, 360, '#cc8844'); layer2.appendChild(b)
  layer1.parentElement.insertBefore(layer2, layer1.nextSibling)
  a.setAttribute('id', 'vf-rectA'); b.setAttribute('id', 'vf-rectB')
  return { ok: true }
})
if (!setup) { console.log('FAIL: no layer to inject into'); dumpLog(log); await browser.close(); process.exit(1) }

const layerCounts = () => page.evaluate(() => {
  const layers = [...document.querySelectorAll('g[data-layer-name]')]
  return layers.map((l) => ({ name: l.getAttribute('data-layer-name'), rects: l.querySelectorAll(':scope > rect').length }))
})
console.log('after inject:', JSON.stringify(await layerCounts()))
await shot(page, 'exp-group-crosslayer-01-injected')

// ── STEP 2: marquee-select across both rects (select tool) ──────────────────
await page.keyboard.press('v'); await sleep(150)
// Drag an empty-start marquee that encloses both rects (~screen 440 and 560).
await page.mouse.move(400, 320); await page.mouse.down()
for (let i = 1; i <= 12; i++) { await page.mouse.move(400 + (620 - 400) * i / 12, 320 + (410 - 320) * i / 12); await sleep(12) }
await page.mouse.up(); await sleep(250)
const selCount = await page.evaluate(() => document.querySelectorAll('[data-role="selection-box"]').length)
console.log('selection boxes after marquee:', selCount)
await shot(page, 'exp-group-crosslayer-02-selected')

// ── STEP 3: group (Ctrl+G), then undo (Ctrl+Z) ──────────────────────────────
await page.keyboard.press('Control+g'); await sleep(250)
console.log('after group:', JSON.stringify(await layerCounts()))
await shot(page, 'exp-group-crosslayer-03-grouped')

await page.keyboard.press('Control+z'); await sleep(300)
const afterUndo = await layerCounts()
console.log('after undo:', JSON.stringify(afterUndo))
await shot(page, 'exp-group-crosslayer-04-undone')

// ── ASSERT: each layer recovered exactly its own rect (NOT 2-and-0) ─────────
const l1 = afterUndo.find((l) => l.name === 'Layer 1')
const l2 = afterUndo.find((l) => l.name === 'Layer 2')
const rectAInL1 = await page.evaluate(() => document.querySelector('#vf-rectA')?.closest('g[data-layer-name]')?.getAttribute('data-layer-name'))
const rectBInL2 = await page.evaluate(() => document.querySelector('#vf-rectB')?.closest('g[data-layer-name]')?.getAttribute('data-layer-name'))
console.log(`rectA layer=${rectAInL1}, rectB layer=${rectBInL2}`)

const grouped = selCount >= 1
const pass = grouped && l1 && l2 && l1.rects === 1 && l2.rects === 1 &&
  rectAInL1 === 'Layer 1' && rectBInL2 === 'Layer 2'
console.log(pass
  ? 'PASS: cross-layer group undo restored each rect to its own layer (1 and 1)'
  : `FAIL: selBoxes=${selCount} L1=${l1 && l1.rects} L2=${l2 && l2.rects} rectA@${rectAInL1} rectB@${rectBInL2}`)

dumpLog(log)
await browser.close()
console.log('\nDONE')
