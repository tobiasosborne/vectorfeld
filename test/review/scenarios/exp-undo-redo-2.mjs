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
    // canonical-ish: strip vf-ids and overlay, normalize whitespace
    const layerXml = layer ? layer.outerHTML : ''
    return { kids, selBoxes, scaleHandles, inspector: insp.replace(/\s+/g, ' ').trim().slice(0, 90), layerXml }
  })
}
function canon(xml) {
  // remove the dynamic id attribute so structural compare is meaningful
  return (xml||'').replace(/\sid="vf-\d+"/g, '').replace(/\s+/g, ' ').trim()
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

// ============ PART A: STALE SELECTION REPRO ============
// Build 3 rects, select all (selBox=3), then UNDO while selection alive.
console.log('=== PART A: stale selection ===')
await tool('r'); await drag(120, 120, 280, 240)
await tool('r'); await drag(340, 120, 500, 240)
await tool('r'); await drag(120, 320, 280, 440)
await tool('v'); await page.keyboard.press('Control+a'); await page.waitForTimeout(150)
let s = await snap()
console.log(`A built+selectall: kids=${s.kids} selBox=${s.selBoxes} insp="${s.inspector}"`)
await shot(page, 'exp-undo-redo-A-selectall')

// Undo ONCE while 3 selected. The last command was... selection isn't a command,
// so undo removes the 3rd rect. Selection still references it.
await undo()
s = await snap()
console.log(`A after 1 undo (rect3 removed, was selected): kids=${s.kids} selBox=${s.selBoxes} handles=${s.scaleHandles} insp="${s.inspector}"`)
await shot(page, 'exp-undo-redo-A-undo1')

await undo()
s = await snap()
console.log(`A after 2 undo: kids=${s.kids} selBox=${s.selBoxes} handles=${s.scaleHandles} insp="${s.inspector}"`)
await shot(page, 'exp-undo-redo-A-undo2')

await undo(); await undo()
s = await snap()
console.log(`A undo-to-empty: kids=${s.kids} selBox=${s.selBoxes} handles=${s.scaleHandles} insp="${s.inspector}"`)
await shot(page, 'exp-undo-redo-A-undoEmpty')

// Act on phantom selection if present
const phantomBefore = await snap()
await page.keyboard.press('ArrowRight'); await page.waitForTimeout(120)
const phantomAfterNudge = await snap()
console.log(`A phantom-nudge: selBox ${phantomBefore.selBoxes}->${phantomAfterNudge.selBoxes}, kids ${phantomBefore.kids}->${phantomAfterNudge.kids}`)
await page.keyboard.press('Delete'); await page.waitForTimeout(120)
const phantomAfterDel = await snap()
console.log(`A phantom-delete: kids=${phantomAfterDel.kids} selBox=${phantomAfterDel.selBoxes}`)
// try redo to see if phantom-nudge corrupted the redo stack
await redo(); s = await snap()
console.log(`A redo after phantom ops: kids=${s.kids}`)

// ============ PART B: STRICT CANONICAL CYCLE on non-empty doc ============
console.log('\n=== PART B: strict undo-all/redo-all canonical compare (non-empty target) ===')
// reset by reloading fresh
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(500)
const box2 = await page.locator('[data-role="canvas-root"]').boundingBox()
const C = (x,y)=>({x:box2.x+x, y:box2.y+y})
async function drag2(x1,y1,x2,y2){ await page.mouse.move(box2.x+x1,box2.y+y1); await page.mouse.down(); for(let i=1;i<=5;i++){await page.mouse.move(box2.x+x1+(x2-x1)*i/5,box2.y+y1+(y2-y1)*i/5);await page.waitForTimeout(10)} await page.mouse.up(); await page.waitForTimeout(80) }

await tool('r'); await drag2(120,120,280,240)
await tool('r'); await drag2(340,120,500,240)
await tool('v'); await page.mouse.click(box2.x+200, box2.y+180); await page.waitForTimeout(100)
// nudge it
for(let i=0;i<3;i++){await page.keyboard.press('ArrowDown');await page.waitForTimeout(40)}
// select all + group
await page.keyboard.press('Control+a'); await page.waitForTimeout(100)
await page.keyboard.press('Control+g'); await page.waitForTimeout(120)
const peak = await snap()
console.log(`B peak: kids=${peak.kids}`)
await shot(page, 'exp-undo-redo-B-peak')

// undo all (count commands generously)
const undoSeq = []
for (let i=0;i<10;i++){ await undo(); const ss=await snap(); undoSeq.push(ss.kids) }
console.log(`B undo kids sequence: ${undoSeq.join(',')}`)
const empty = await snap()
console.log(`B after undo-all: kids=${empty.kids} canon empty? ${canon(empty.layerXml).length}`)

// redo all
const redoSeq=[]
for (let i=0;i<10;i++){ await redo(); const ss=await snap(); redoSeq.push(ss.kids) }
console.log(`B redo kids sequence: ${redoSeq.join(',')}`)
const restored = await snap()
console.log(`B after redo-all: kids=${restored.kids}`)
await shot(page, 'exp-undo-redo-B-restored')

const matchStrict = peak.layerXml === restored.layerXml
const matchCanon = canon(peak.layerXml) === canon(restored.layerXml)
console.log(`B STRICT XML MATCH (peak vs redo-all): ${matchStrict}`)
console.log(`B CANON XML MATCH (peak vs redo-all): ${matchCanon}`)
writeFileSync('/tmp/B-peak.xml', peak.layerXml)
writeFileSync('/tmp/B-restored.xml', restored.layerXml)

dumpLog(log)
await browser.close()
console.log('EXP-UNDO-REDO-2 DONE')
