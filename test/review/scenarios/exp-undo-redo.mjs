import { openApp, shot, dumpLog } from '../_driver.mjs'
import { writeFileSync } from 'node:fs'

const { browser, page, log } = await openApp()
const box = await page.locator('[data-role="canvas-root"]').boundingBox()

async function snap() {
  return await page.evaluate(() => {
    const layer = document.querySelector('g[data-layer-name]')
    const kids = layer ? layer.children.length : -1
    const selBoxes = document.querySelectorAll('[data-role="selection-box"]').length
    const scaleHandles = document.querySelectorAll('[data-role="scale-handle"]').length
    const insp = document.querySelector('[data-testid="inspector"]')?.innerText || ''
    // grab the document SVG markup of the active layer for canonical compare
    const layerXml = layer ? layer.outerHTML : ''
    return { kids, selBoxes, scaleHandles, inspector: insp.replace(/\s+/g, ' ').trim().slice(0, 120), layerXml }
  })
}
const checkpoints = {}
async function step(name, fn) {
  try {
    await fn()
    await page.waitForTimeout(160)
    const s = await snap()
    checkpoints[name] = s
    await shot(page, `exp-undo-redo-${name}`)
    console.log(`STEP ${name}: kids=${s.kids} selBox=${s.selBoxes} handles=${s.scaleHandles} | insp="${s.inspector}"`)
  } catch (e) {
    await shot(page, `exp-undo-redo-${name}-ERR`)
    console.log(`STEP ${name}: THREW ${e.message}`)
  }
}
async function tool(letter) { await page.keyboard.press(letter); await page.waitForTimeout(80) }
async function drag(x1, y1, x2, y2) {
  await page.mouse.move(box.x + x1, box.y + y1); await page.mouse.down()
  for (let i = 1; i <= 5; i++) { await page.mouse.move(box.x + x1 + (x2 - x1) * i / 5, box.y + y1 + (y2 - y1) * i / 5); await page.waitForTimeout(10) }
  await page.mouse.up(); await page.waitForTimeout(80)
}
async function click(x, y) { await page.mouse.click(box.x + x, box.y + y); await page.waitForTimeout(100) }
async function undo() { await page.keyboard.press('Control+z'); await page.waitForTimeout(120) }
async function redo() { await page.keyboard.press('Control+Shift+z'); await page.waitForTimeout(120) }

// ---------- BUILD A STACK OF MIXED OPS ----------
await step('00-boot', async () => {})
await step('01-rect1', async () => { await tool('r'); await drag(120, 120, 280, 240) })
await step('02-rect2', async () => { await tool('r'); await drag(340, 120, 500, 240) })
await step('03-rect3', async () => { await tool('r'); await drag(120, 320, 280, 440) })
await step('04-selectall', async () => { await tool('v'); await page.keyboard.press('Control+a') })
await step('05-group', async () => { await page.keyboard.press('Control+g') })
await step('06-move-group', async () => {
  // drag the group body
  await page.mouse.move(box.x + 200, box.y + 180); await page.mouse.down()
  await page.mouse.move(box.x + 260, box.y + 220); await page.mouse.move(box.x + 300, box.y + 260); await page.mouse.up()
  await page.waitForTimeout(120)
})
await step('07-ungroup', async () => { await page.keyboard.press('Control+Shift+g') })
await step('08-select-one', async () => { await tool('v'); await click(200, 200) })
await step('09-nudge', async () => { for (let i=0;i<5;i++){ await page.keyboard.press('ArrowRight'); await page.waitForTimeout(40) } })
await step('10-delete-one', async () => { await page.keyboard.press('Delete') })

// snapshot the canonical doc xml at the "fully built" peak BEFORE we delete? we already deleted.
const peakXml = checkpoints['09-nudge']?.layerXml

// ---------- UNDO ALL THE WAY ----------
console.log('\n--- UNDO STORM ---')
for (let i = 0; i < 14; i++) {
  await undo()
  const s = await snap()
  console.log(`UNDO#${i+1}: kids=${s.kids} selBox=${s.selBoxes} handles=${s.scaleHandles} | insp="${s.inspector}"`)
  if (i === 0) await shot(page, `exp-undo-redo-undo-01`)
}
const afterFullUndo = await snap()
await shot(page, 'exp-undo-redo-after-full-undo')
checkpoints['Z-after-full-undo'] = afterFullUndo
console.log(`AFTER FULL UNDO: kids=${afterFullUndo.kids} selBox=${afterFullUndo.selBoxes} handles=${afterFullUndo.scaleHandles} insp="${afterFullUndo.inspector}"`)

// ---------- STALE SELECTION ADVERSARIAL: act on phantom selection ----------
console.log('\n--- ACT ON PHANTOM SELECTION (after undo-to-empty) ---')
await step('phantom-delete', async () => { await page.keyboard.press('Delete') })
await step('phantom-nudge', async () => { await page.keyboard.press('ArrowRight') })
await step('phantom-align', async () => {
  // try Object > Align via menu if exists; else just press a copy
  await page.keyboard.press('Control+c')
  await page.keyboard.press('Control+v')
})
await step('phantom-group', async () => { await page.keyboard.press('Control+g') })

// ---------- REDO ALL THE WAY ----------
console.log('\n--- REDO STORM ---')
for (let i = 0; i < 16; i++) {
  await redo()
  const s = await snap()
  console.log(`REDO#${i+1}: kids=${s.kids} selBox=${s.selBoxes} handles=${s.scaleHandles}`)
}
const afterFullRedo = await snap()
await shot(page, 'exp-undo-redo-after-full-redo')
checkpoints['Z-after-full-redo'] = afterFullRedo
console.log(`AFTER FULL REDO: kids=${afterFullRedo.kids} insp="${afterFullRedo.inspector}"`)

// Compare peak vs redo
const peakKids = checkpoints['10-delete-one']?.kids
console.log(`\nCOMPARE: peak(after delete) kids=${peakKids} vs after-full-redo kids=${afterFullRedo.kids}`)
console.log(`XML MATCH (delete-one vs full-redo): ${checkpoints['10-delete-one']?.layerXml === afterFullRedo.layerXml}`)

// dump xml diff lengths for canonical compare
writeFileSync('/tmp/exp-peak.xml', checkpoints['10-delete-one']?.layerXml || '')
writeFileSync('/tmp/exp-redo.xml', afterFullRedo.layerXml || '')

// ---------- BRANCH TRUNCATION ----------
console.log('\n--- BRANCH TRUNCATION ---')
await step('bt-undo3', async () => { await undo(); await undo(); await undo() })
const beforeNewOp = await snap()
await step('bt-newop', async () => { await tool('r'); await drag(560, 320, 700, 440) })
await step('bt-redo-attempt', async () => { await redo() }) // should be a no-op (branch truncated)
const afterTrunc = await snap()
console.log(`BRANCH: redo after new-op changed kids? before=${beforeNewOp.kids} afterNewOp+redo=${afterTrunc.kids}`)

dumpLog(log)
await browser.close()
console.log('EXP-UNDO-REDO DONE')
