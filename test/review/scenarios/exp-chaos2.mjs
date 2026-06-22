import { openApp, shot, dumpLog, FIXTURES } from '../_driver.mjs'
import { resolve } from 'node:path'

const { browser, page, log } = await openApp()
// CORRECT origin: the drawable SVG starts at (92,80), not canvas-root (0,0)
const svg = await page.evaluate(() => {
  const s = document.querySelector('[data-testid="canvas-container"] svg') || document.querySelector('svg')
  const r = s.getBoundingClientRect(); return { x: r.x, y: r.y }
})
const OX = svg.x, OY = svg.y
console.log('SVG origin:', OX, OY)

let lastErrIdx = 0
function newErrors() {
  const all = [
    ...log.console.filter(c => c.type === 'error').map(c => 'CONSOLE: ' + c.text),
    ...log.pageerrors.map(e => 'PAGEERROR: ' + e),
  ]
  const fresh = all.slice(lastErrIdx); lastErrIdx = all.length; return fresh
}
const triggers = []
function mark(phase, action) { const e = newErrors(); if (e.length) triggers.push({ phase, action, errors: e }); return e }

async function tool(l) { await page.keyboard.press(l); await page.waitForTimeout(60) }
async function drag(x1, y1, x2, y2, opts = {}) {
  if (opts.shift) await page.keyboard.down('Shift')
  await page.mouse.move(OX + x1, OY + y1); await page.mouse.down()
  for (let i = 1; i <= 6; i++) { await page.mouse.move(OX + x1 + (x2 - x1) * i / 6, OY + y1 + (y2 - y1) * i / 6); await page.waitForTimeout(6) }
  await page.mouse.up()
  if (opts.shift) await page.keyboard.up('Shift')
  await page.waitForTimeout(50)
}
async function click(x, y, opts = {}) {
  if (opts.shift) await page.keyboard.down('Shift')
  await page.mouse.click(OX + x, OY + y)
  if (opts.shift) await page.keyboard.up('Shift')
  await page.waitForTimeout(50)
}
async function st() {
  return await page.evaluate(() => ({
    layerKids: document.querySelector('g[data-layer-name]')?.children.length ?? -1,
    selBoxes: document.querySelectorAll('[data-role="selection-box"]').length,
    scaleHandles: document.querySelectorAll('[data-role="scale-handle"]').length,
    inspector: (document.querySelector('[data-testid="inspector"]')?.innerText || '').replace(/\s+/g, ' ').slice(0, 70),
  }))
}
async function openMenu(n) { await page.getByRole('button', { name: n, exact: true }).click(); await page.waitForTimeout(80) }
async function menuItem(n) { await page.locator('button', { has: page.locator('span', { hasText: new RegExp('^' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }) }).last().click(); await page.waitForTimeout(100) }
async function objAct(n) { await openMenu('Object'); await menuItem(n) }

// PHASE 1: 10 rects, all start x>=20,y>=20 within SVG
console.log('\n=== P1 draw 10 ===')
const pos = [
  [40, 40, 130, 110], [200, 50, 300, 120], [360, 40, 460, 130], [520, 60, 620, 130],
  [40, 220, 140, 320], [220, 230, 320, 320], [400, 220, 500, 320], [560, 230, 660, 320],
  [60, 400, 160, 480], [300, 400, 420, 490],
]
for (const p of pos) { await tool('r'); await drag(...p) }
await tool('v')
console.log('after draw:', JSON.stringify(await st())); mark('P1', 'draw 10')
await shot(page, 'exp-chaos2-01-ten')

// PHASE 2: multi-select 3 + scale + move
console.log('\n=== P2 multi-select + transform ===')
await click(85, 75); await click(410, 85, { shift: true }); await click(90, 270, { shift: true })
console.log('multi-sel:', JSON.stringify(await st())); mark('P2', 'shift-select 3')
const h = await page.evaluate(() => Array.from(document.querySelectorAll('[data-role="scale-handle"]')).map(x => { const r = x.getBoundingClientRect(); return { pos: x.getAttribute('data-handle-pos'), cx: r.x + r.width / 2, cy: r.y + r.height / 2 } }))
const se = h.find(x => x.pos === 'se')
if (se) { await page.mouse.move(se.cx, se.cy); await page.mouse.down(); await page.mouse.move(se.cx + 50, se.cy + 50, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(80) }
mark('P2', 'scale multi')
console.log('after scale:', JSON.stringify(await st()))
await shot(page, 'exp-chaos2-02-scaled')

// PHASE 3: group/ungroup storm
console.log('\n=== P3 group/ungroup x6 ===')
for (let i = 0; i < 6; i++) {
  await tool('v'); await page.keyboard.press('Control+a'); await page.waitForTimeout(40)
  await objAct('Group'); mark('P3', `group ${i}`); const g = await st()
  await objAct('Ungroup'); mark('P3', `ungroup ${i}`); const u = await st()
  console.log(`  iter ${i}: grp kids=${g.layerKids} ungrp kids=${u.layerKids}`)
}
await shot(page, 'exp-chaos2-03-groupstorm')

// PHASE 4: align storm
console.log('\n=== P4 align storm ===')
for (const a of ['Align Left', 'Align Top', 'Align Center Horizontal', 'Align Middle']) {
  await tool('v'); await page.keyboard.press('Control+a'); await page.waitForTimeout(40)
  await objAct(a); mark('P4', a)
}
console.log('after aligns:', JSON.stringify(await st()))

// PHASE 5: copy/paste storm (real selection)
console.log('\n=== P5 copy/paste storm ===')
await tool('v'); await page.keyboard.press('Control+a'); await page.waitForTimeout(60)
console.log('before paste storm:', JSON.stringify(await st()))
for (let i = 0; i < 6; i++) {
  await page.keyboard.press('Control+c'); await page.waitForTimeout(40)
  await page.keyboard.press('Control+v'); await page.waitForTimeout(80)
  mark('P5', `cp ${i}`)
  console.log(`  paste ${i}: kids=${(await st()).layerKids}`)
}
await shot(page, 'exp-chaos2-04-pastestorm')

// PHASE 6: tool-switch storm + mid-drag switch
console.log('\n=== P6 tool-switch storm ===')
for (const t of ['v', 'a', 'p', 't', 'r', 'i', 'e', 'b', 'k', 'v', 'r', 'p', 'a', 't', 'v']) await tool(t)
mark('P6', 'rapid switch')
await tool('r')
await page.mouse.move(OX + 200, OY + 350); await page.mouse.down()
await page.mouse.move(OX + 260, OY + 410, { steps: 4 })
await page.keyboard.press('v')
await page.mouse.move(OX + 300, OY + 450, { steps: 4 }); await page.mouse.up(); await page.waitForTimeout(80)
mark('P6', 'mid-drag tool switch')
console.log('after toolswitch:', JSON.stringify(await st()))

// PHASE 7: delete + undo/redo storm + undo-to-empty stale-selection check
console.log('\n=== P7 undo/redo storm ===')
await tool('v'); await page.keyboard.press('Control+a'); await page.keyboard.press('Delete'); await page.waitForTimeout(60)
mark('P7', 'delete all'); console.log('after delete:', JSON.stringify(await st()))
for (let i = 0; i < 20; i++) { await page.keyboard.press('Control+z'); await page.waitForTimeout(20) }
mark('P7', 'undo x20'); const au = await st(); console.log('after undo x20:', JSON.stringify(au))
for (let i = 0; i < 20; i++) { await page.keyboard.press('Control+y'); await page.waitForTimeout(20) }
mark('P7', 'redo x20'); console.log('after redo x20:', JSON.stringify(await st()))
// undo to empty
await tool('v'); await page.keyboard.press('Control+a')
for (let i = 0; i < 40; i++) { await page.keyboard.press('Control+z'); await page.waitForTimeout(12) }
mark('P7', 'undo to empty')
const empty = await st(); console.log('UNDO-TO-EMPTY:', JSON.stringify(empty))
console.log('  >> STALE SELECTION?', empty.layerKids === 0 && (empty.selBoxes > 0 || /SELECTED/.test(empty.inspector)))
await shot(page, 'exp-chaos2-05-undo-empty')
// try operating on the phantom selection - does it crash?
await page.keyboard.press('Delete'); await page.waitForTimeout(60); mark('P7', 'delete on phantom sel')
await objAct('Group'); mark('P7', 'group on phantom sel')
console.log('after acting on phantom:', JSON.stringify(await st()))
await shot(page, 'exp-chaos2-06-phantom-acted')

// PHASE 8: import PDF mid-session
console.log('\n=== P8 import PDF ===')
for (let i = 0; i < 6; i++) { await page.keyboard.press('Control+y'); await page.waitForTimeout(20) }  // bring shapes back
await tool('v')
console.log('before import:', JSON.stringify(await st()))
const pdf = resolve(FIXTURES, 'Flyer Swift Vortragscoaching 15.04.2026 noheader.pdf')
try {
  const fc = page.waitForEvent('filechooser')
  await openMenu('File'); await menuItem('Open PDF...')
  const c = await fc; await c.setFiles(pdf); await page.waitForTimeout(2500)
  mark('P8', 'import PDF'); console.log('after import:', JSON.stringify(await st()))
  await shot(page, 'exp-chaos2-07-pdf')
} catch (e) { triggers.push({ phase: 'P8', action: 'import PDF', errors: ['EX: ' + e.message] }) }
// chaos on PDF: select-all, undo, redo
await tool('v'); await page.keyboard.press('Control+a'); await page.waitForTimeout(80); mark('P8', 'select-all PDF')
console.log('select-all PDF:', JSON.stringify(await st()))
await page.keyboard.press('Control+z'); await page.waitForTimeout(80); mark('P8', 'undo after import')
console.log('undo after import:', JSON.stringify(await st()))
await shot(page, 'exp-chaos2-08-pdf-undo')

// PHASE 9: export
console.log('\n=== P9 export ===')
try {
  const dl = page.waitForEvent('download', { timeout: 15000 })
  await openMenu('File'); await menuItem('Export PDF')
  const d = await dl; await d.saveAs(resolve(FIXTURES, '..', '..', 'review', 'shots', 'exp-chaos2-export.pdf'))
  await page.waitForTimeout(300); mark('P9', 'export PDF'); console.log('exported ok')
} catch (e) { triggers.push({ phase: 'P9', action: 'export', errors: ['EX: ' + e.message] }) }

console.log('\n===== ERROR-TRIGGER MAP =====')
if (!triggers.length) console.log('  (no errors)')
for (const t of triggers) { console.log(`  [${t.phase}] ${t.action}:`); t.errors.forEach(e => console.log('      ' + e)) }
dumpLog(log)
await browser.close()
console.log('EXP-CHAOS2 DONE')
