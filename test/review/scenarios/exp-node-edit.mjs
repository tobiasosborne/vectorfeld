// exp-node-edit.mjs — bead vectorfeld-3yu.7
//
// Regression guard for the direct-select node editor. The OLD standalone regex
// parser dropped H/V/S/Q/T/A commands and read relative m/l/c verbatim, so the
// first node drag on an imported path mangled or destroyed segments. The editor
// now rebuilds paths via pathOps.parsePathD/commandsToD (all-absolute M/L/C/Z),
// so the first edit normalizes losslessly and drops no command.
//
// The flyer fixture has no editable vector paths, and MuPDF paths are absolute
// M/L/C (which would NOT trigger the bug). So we INJECT an on-screen path that
// carries the exact bug-triggering commands — H, V, a relative `l`, and an S —
// mapped into the layer's local frame so it renders on-canvas and is
// direct-selectable. We then drag an anchor and assert the rebuilt path keeps
// the SAME command count (the old parser would have dropped H/V/l/S).
//
// PREPARED + verified via the headed dogfood harness against localhost:5173.
//   xvfb-run -a node test/review/scenarios/exp-node-edit.mjs

import { openApp, shot, dumpLog } from '../_driver.mjs'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const countCommands = (d) => (d.match(/[MLCHVSQTAZmlchvsqtaz]/g) || []).length

const { browser, page, log } = await openApp()

console.log('\n##### STEP 1: inject an on-screen path with H/V/relative/S commands')
const injected = await page.evaluate(() => {
  const layer = document.querySelector('g[data-layer-name]')
  if (!layer) return null
  const svg = layer.ownerSVGElement
  // Map a central screen point into the layer's local (doc) coordinate frame so
  // the path renders ON canvas regardless of zoom/pan.
  const inv = layer.getScreenCTM().inverse()
  const p = svg.createSVGPoint(); p.x = 520; p.y = 400
  const o = p.matrixTransform(inv)
  const ox = o.x, oy = o.y
  const u = 10 // segment size in doc units (kept compact to stay on-screen)
  // M H V (relative l) C S Z  — 7 commands; old parser kept only M/L/C/Z.
  const d = `M ${ox} ${oy} H ${ox + u} V ${oy + u} l ${u} 0 ` +
            `C ${ox + 3 * u} ${oy + u} ${ox + 3 * u} ${oy} ${ox + 4 * u} ${oy} ` +
            `S ${ox + 5 * u} ${oy - u} ${ox + 6 * u} ${oy} Z`
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('d', d)
  path.setAttribute('fill', 'none')
  path.setAttribute('stroke', '#3366cc')
  path.setAttribute('stroke-width', '2')
  path.setAttribute('id', 'vf-test-nodeedit')
  layer.appendChild(path)
  const b = path.getBoundingClientRect()
  return { d, count: (d.match(/[MLCHVSQTAZmlchvsqtaz]/g) || []).length,
           cx: b.x + b.width / 2, cy: b.y + b.height / 2, w: b.width, h: b.height }
})
if (!injected) { console.log('FAIL: no layer to inject into'); dumpLog(log); await browser.close(); process.exit(1) }
const beforeCount = countCommands(injected.d)
console.log(`injected path: ${beforeCount} commands, bbox ${injected.w.toFixed(0)}x${injected.h.toFixed(0)} @ (${injected.cx.toFixed(0)},${injected.cy.toFixed(0)})`)
await shot(page, 'exp-node-edit-01-injected')

console.log('\n##### STEP 2: direct-select (press a, click the path)')
await page.keyboard.press('a')
await sleep(200)
await page.mouse.click(injected.cx, injected.cy)
await sleep(300)
const anchors = await page.evaluate(() =>
  document.querySelectorAll('[data-role="direct-select-anchor"]').length)
console.log('direct-select anchors visible:', anchors)
await shot(page, 'exp-node-edit-02-selected')

console.log('\n##### STEP 3: drag the first anchor, assert no command dropped')
const anchorPos = await page.evaluate(() => {
  const a = document.querySelector('[data-role="direct-select-anchor"]')
  if (!a) return null
  const b = a.getBoundingClientRect()
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
})
console.log('first anchor pos:', JSON.stringify(anchorPos))
if (anchorPos) {
  await page.mouse.move(anchorPos.x, anchorPos.y)
  await page.mouse.down()
  await page.mouse.move(anchorPos.x + 30, anchorPos.y + 20, { steps: 8 })
  await page.mouse.up()
  await sleep(300)
}
await shot(page, 'exp-node-edit-03-after-drag')

const afterD = await page.evaluate(() =>
  document.getElementById('vf-test-nodeedit')?.getAttribute('d') || '')
const afterCount = countCommands(afterD)
console.log('command count BEFORE:', beforeCount, '-> AFTER:', afterCount)

// The path normalizes to absolute M/L/C/Z on first edit (H/V→L, relative→absolute,
// S→exact C) — one output command per source command, so the COUNT is invariant.
// The old regex parser dropped H/V/l/S entirely, which would lower the count.
const movedAnchor = !!anchorPos && anchors > 0
const pass = movedAnchor && afterCount === beforeCount && afterCount > 0
console.log(pass
  ? `PASS: node edit preserved all ${afterCount} commands (H/V/relative/S not dropped)`
  : `FAIL: anchors=${anchors} dragged=${movedAnchor} count ${beforeCount} -> ${afterCount}`)

dumpLog(log)
await browser.close()
console.log('\nDONE')
