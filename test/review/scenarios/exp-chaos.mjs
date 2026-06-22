import { openApp, shot, dumpLog, FIXTURES } from '../_driver.mjs'
import { resolve } from 'node:path'

const { browser, page, log } = await openApp()
const box = await page.locator('[data-role="canvas-root"]').boundingBox()

// --- helpers ---------------------------------------------------------------
let lastErrIdx = 0
function newErrors() {
  const all = [
    ...log.console.filter(c => c.type === 'error').map(c => 'CONSOLE: ' + c.text),
    ...log.pageerrors.map(e => 'PAGEERROR: ' + e),
  ]
  const fresh = all.slice(lastErrIdx)
  lastErrIdx = all.length
  return fresh
}
const triggers = [] // {phase, action, errors:[]}
async function mark(phase, action) {
  const errs = newErrors()
  if (errs.length) triggers.push({ phase, action, errors: errs })
  return errs
}

async function tool(letter) { await page.keyboard.press(letter); await page.waitForTimeout(40) }
async function drag(x1, y1, x2, y2, opts = {}) {
  if (opts.shift) await page.keyboard.down('Shift')
  await page.mouse.move(box.x + x1, box.y + y1)
  await page.mouse.down()
  for (let i = 1; i <= 5; i++) {
    await page.mouse.move(box.x + x1 + (x2 - x1) * i / 5, box.y + y1 + (y2 - y1) * i / 5)
    await page.waitForTimeout(6)
  }
  await page.mouse.up()
  if (opts.shift) await page.keyboard.up('Shift')
  await page.waitForTimeout(50)
}
async function click(x, y, opts = {}) {
  if (opts.shift) await page.keyboard.down('Shift')
  await page.mouse.click(box.x + x, box.y + y)
  if (opts.shift) await page.keyboard.up('Shift')
  await page.waitForTimeout(40)
}
async function state() {
  return await page.evaluate(() => {
    const layer = document.querySelector('g[data-layer-name]')
    return {
      layerKids: layer ? layer.children.length : -1,
      selBoxes: document.querySelectorAll('[data-role="selection-box"]').length,
      scaleHandles: document.querySelectorAll('[data-role="scale-handle"]').length,
      inspector: (document.querySelector('[data-testid="inspector"]')?.innerText || '').replace(/\s+/g, ' ').slice(0, 120),
    }
  })
}
async function openMenu(name) {
  await page.getByRole('button', { name, exact: true }).click()
  await page.waitForTimeout(80)
}
async function menuItem(name) {
  await page.locator('button', { has: page.locator('span', { hasText: new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }) }).last().click()
  await page.waitForTimeout(100)
}
async function objectAction(name) { await openMenu('Object'); await menuItem(name) }

const log2 = (...a) => console.log(...a)

// ===========================================================================
// PHASE 1: draw ~10 shapes fast (rects + a couple via pen/text)
// ===========================================================================
log2('\n=== PHASE 1: draw 10 shapes fast ===')
const positions = [
  [80, 80, 150, 140], [200, 90, 280, 150], [330, 70, 400, 160], [460, 90, 540, 150],
  [90, 220, 160, 300], [240, 230, 320, 300], [400, 220, 480, 300], [560, 230, 640, 300],
  [120, 360, 200, 430], [320, 360, 420, 440],
]
for (const [a, b, c, d] of positions) { await tool('r'); await drag(a, b, c, d) }
await tool('v')
log2('after draw:', JSON.stringify(await state()))
await mark('P1', 'draw 10 rects')
await shot(page, 'exp-chaos-01-ten-shapes')

// Add a text shape
await tool('t'); await click(150, 500)
await page.keyboard.type('Chaos', { delay: 10 })
await page.keyboard.press('Escape')
await mark('P1', 'add text shape + type')
await tool('v')
log2('after text:', JSON.stringify(await state()))

// ===========================================================================
// PHASE 2: multi-select random subsets + transform
// ===========================================================================
log2('\n=== PHASE 2: multi-select + transform ===')
await click(115, 110)
await click(360, 115, { shift: true })
await click(125, 260, { shift: true })
await mark('P2', 'shift multi-select 3')
log2('multi-sel:', JSON.stringify(await state()))
await shot(page, 'exp-chaos-02-multiselect')

// scale via SE handle
let h = await page.evaluate(() => Array.from(document.querySelectorAll('[data-role="scale-handle"]')).map(x => { const r = x.getBoundingClientRect(); return { pos: x.getAttribute('data-handle-pos'), cx: r.x + r.width / 2, cy: r.y + r.height / 2 } }))
let se = h.find(x => x.pos === 'se')
if (se) {
  await page.mouse.move(se.cx, se.cy); await page.mouse.down()
  await page.mouse.move(se.cx + 60, se.cy + 60, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(80)
}
await mark('P2', 'scale multi via SE handle')
// drag-move the selection
await page.mouse.move(box.x + 200, box.y + 150); await page.mouse.down()
await page.mouse.move(box.x + 230, box.y + 180, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(80)
await mark('P2', 'drag-move selection')
log2('after transform:', JSON.stringify(await state()))
await shot(page, 'exp-chaos-03-transformed')

// ===========================================================================
// PHASE 3: group/ungroup repeatedly
// ===========================================================================
log2('\n=== PHASE 3: group/ungroup storm ===')
for (let i = 0; i < 5; i++) {
  await tool('v'); await page.keyboard.press('Control+a'); await page.waitForTimeout(40)
  await objectAction('Group')
  await mark('P3', `group iter ${i}`)
  const sg = await state()
  await objectAction('Ungroup')
  await mark('P3', `ungroup iter ${i}`)
  const su = await state()
  log2(`grp/ungrp ${i}: afterGroup kids=${sg.layerKids} afterUngroup kids=${su.layerKids}`)
}
await shot(page, 'exp-chaos-04-group-storm')

// ===========================================================================
// PHASE 4: align storm
// ===========================================================================
log2('\n=== PHASE 4: align storm ===')
const aligns = ['Align Left', 'Align Right', 'Align Top', 'Align Bottom', 'Align Center Horizontal', 'Align Middle']
for (const al of aligns) {
  await tool('v'); await page.keyboard.press('Control+a'); await page.waitForTimeout(40)
  await objectAction(al)
  await mark('P4', al)
}
log2('after aligns:', JSON.stringify(await state()))
await shot(page, 'exp-chaos-05-aligned')

// ===========================================================================
// PHASE 5: copy/paste storm
// ===========================================================================
log2('\n=== PHASE 5: copy/paste storm ===')
await tool('v'); await click(230, 180)
for (let i = 0; i < 8; i++) {
  await page.keyboard.press('Control+c')
  await page.keyboard.press('Control+v')
  await page.waitForTimeout(30)
  await mark('P5', `copy/paste iter ${i}`)
}
log2('after paste storm:', JSON.stringify(await state()))
await shot(page, 'exp-chaos-06-paste-storm')

// ===========================================================================
// PHASE 6: tool-switch storm (rapid)
// ===========================================================================
log2('\n=== PHASE 6: tool-switch storm ===')
const tools = ['v', 'a', 'p', 't', 'r', 'i', 'e', 'b', 'k', 'v', 'r', 'p', 'a', 't']
for (const t of tools) { await tool(t) }
await mark('P6', 'rapid tool-switch x14')
// tool switch mid-draw: start a rect drag then switch tool mid-drag
await tool('r')
await page.mouse.move(box.x + 300, box.y + 300); await page.mouse.down()
await page.mouse.move(box.x + 360, box.y + 360, { steps: 4 })
await page.keyboard.press('v')  // switch tool mid-drag
await page.mouse.move(box.x + 400, box.y + 400, { steps: 4 })
await page.mouse.up()
await page.waitForTimeout(80)
await mark('P6', 'tool-switch mid-drag')
log2('after toolswitch storm:', JSON.stringify(await state()))
await shot(page, 'exp-chaos-07-toolswitch')

// ===========================================================================
// PHASE 7: delete + undo/redo storm
// ===========================================================================
log2('\n=== PHASE 7: undo/redo storm ===')
await tool('v'); await page.keyboard.press('Control+a'); await page.keyboard.press('Delete')
await page.waitForTimeout(60)
await mark('P7', 'select-all + delete')
log2('after delete-all:', JSON.stringify(await state()))
await shot(page, 'exp-chaos-08-deleted')

for (let i = 0; i < 15; i++) { await page.keyboard.press('Control+z'); await page.waitForTimeout(25) }
await mark('P7', 'undo x15')
const afterUndo = await state()
log2('after undo x15:', JSON.stringify(afterUndo))
await shot(page, 'exp-chaos-09-undo-storm')

for (let i = 0; i < 15; i++) { await page.keyboard.press('Control+y'); await page.waitForTimeout(25) }
await mark('P7', 'redo x15')
log2('after redo x15:', JSON.stringify(await state()))
await shot(page, 'exp-chaos-10-redo-storm')

// undo-to-empty then check stale selection (known bug; verify it persists in chaos)
await tool('v'); await page.keyboard.press('Control+a')
for (let i = 0; i < 25; i++) { await page.keyboard.press('Control+z'); await page.waitForTimeout(15) }
await mark('P7', 'undo to empty')
const empty = await state()
log2('undo-to-empty:', JSON.stringify(empty))
await shot(page, 'exp-chaos-11-undo-empty')

// ===========================================================================
// PHASE 8: import PDF mid-session (after the chaos)
// ===========================================================================
log2('\n=== PHASE 8: import PDF mid-session ===')
// redo some shapes back first so there is existing content
for (let i = 0; i < 5; i++) { await page.keyboard.press('Control+y'); await page.waitForTimeout(20) }
await tool('v')
log2('before PDF import:', JSON.stringify(await state()))
const pdf = resolve(FIXTURES, 'Flyer Swift Vortragscoaching 15.04.2026 noheader.pdf')
try {
  const fc = page.waitForEvent('filechooser')
  await openMenu('File')
  await menuItem('Open PDF...')
  const chooser = await fc
  await chooser.setFiles(pdf)
  await page.waitForTimeout(2500)
  await mark('P8', 'import PDF mid-session')
  log2('after PDF import:', JSON.stringify(await state()))
  await shot(page, 'exp-chaos-12-pdf-imported')
} catch (e) {
  log2('PDF import failed:', e.message)
  triggers.push({ phase: 'P8', action: 'import PDF', errors: ['EXCEPTION: ' + e.message] })
}

// chaos on imported PDF: select all, move, undo
await tool('v'); await page.keyboard.press('Control+a'); await page.waitForTimeout(60)
await mark('P8', 'select-all on imported PDF')
log2('select-all on PDF:', JSON.stringify(await state()))
await page.keyboard.press('Control+z'); await page.waitForTimeout(60)
await mark('P8', 'undo after PDF import')

// ===========================================================================
// PHASE 9: export
// ===========================================================================
log2('\n=== PHASE 9: export ===')
try {
  const dl = page.waitForEvent('download', { timeout: 15000 })
  await openMenu('File')
  await menuItem('Export PDF')
  const d = await dl
  const out = resolve(FIXTURES, '..', '..', 'review', 'shots', 'exp-chaos-export.pdf')
  await d.saveAs(out)
  await page.waitForTimeout(300)
  await mark('P9', 'export PDF')
  log2('exported to', out)
} catch (e) {
  log2('export failed:', e.message)
  triggers.push({ phase: 'P9', action: 'export PDF', errors: ['EXCEPTION: ' + e.message] })
}
await shot(page, 'exp-chaos-13-after-export')

// ===========================================================================
// SUMMARY
// ===========================================================================
log2('\n===== ERROR-TRIGGER MAP =====')
if (!triggers.length) log2('  (no console/page errors captured during any phase)')
for (const t of triggers) {
  log2(`  [${t.phase}] ${t.action}:`)
  for (const e of t.errors) log2('      ' + e)
}

dumpLog(log)
await browser.close()
log2('EXP-CHAOS DONE')
