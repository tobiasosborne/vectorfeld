import { openApp, shot, dumpLog } from '../_driver.mjs'

const { browser, page, log } = await openApp()
const box = await page.locator('[data-role="canvas-root"]').boundingBox()
async function drag(x1,y1,x2,y2){ await page.mouse.move(box.x+x1,box.y+y1); await page.mouse.down(); for(let i=1;i<=5;i++){await page.mouse.move(box.x+x1+(x2-x1)*i/5,box.y+y1+(y2-y1)*i/5);await page.waitForTimeout(12)} await page.mouse.up(); await page.waitForTimeout(120) }
async function layerMembership(){ return await page.evaluate(()=>Array.from(document.querySelectorAll('g[data-layer-name]')).map(l=>({name:l.getAttribute('data-layer-name'),kids:l.children.length}))) }

// ---------- BUG A: text-edit Ctrl+Z clobbers a previously committed shape ----------
console.log('\n=== BUG A: text-edit Ctrl+Z ===')
await page.keyboard.press('r'); await drag(120,120,300,220)
let before = await layerMembership()
console.log('after rect:', JSON.stringify(before))
await page.keyboard.press('t'); await page.mouse.click(box.x+160, box.y+320); await page.waitForTimeout(150)
await page.keyboard.type('typo', { delay: 25 })
await shot(page,'verifyA-1-typing')
// user expects Ctrl+Z to undo the last typed char; does it instead undo the rect?
await page.keyboard.press('Control+z'); await page.waitForTimeout(200)
await shot(page,'verifyA-2-after-ctrlz')
let after = await layerMembership()
console.log('after Ctrl+Z while editing text:', JSON.stringify(after))
console.log('VERDICT A: rect undone mid-text-edit?', before[0].kids>0 && after[0].kids<before[0].kids ? 'YES (bug confirmed)':'no')
await page.keyboard.press('Escape'); await page.waitForTimeout(100)

// reset doc
await page.reload({ waitUntil:'networkidle' }); await page.waitForTimeout(800)
const box2 = await page.locator('[data-role="canvas-root"]').boundingBox()

// ---------- BUG B: Document Setup is a no-op ----------
console.log('\n=== BUG B: Document Setup ===')
const artboardBefore = await page.evaluate(()=>{ const a=document.querySelector('[data-role="artboard"]'); return a?{w:a.getAttribute('width'),h:a.getAttribute('height')}:null })
console.log('artboard before:', JSON.stringify(artboardBefore))
await page.getByRole('button',{name:'File',exact:true}).click(); await page.waitForTimeout(150)
const setupItem = page.getByText('Document Setup', { exact:false }).first()
if(await setupItem.count()){ await setupItem.click(); await page.waitForTimeout(200) }
await shot(page,'verifyB-1-dialog')
const dlg = await page.evaluate(()=>!!document.querySelector('[data-testid="artboard-dialog"]'))
console.log('artboard dialog open?', dlg)
if(dlg){
  const w=page.locator('[data-testid="artboard-width"]'); const h=page.locator('[data-testid="artboard-height"]')
  if(await w.count()){ await w.click(); await page.keyboard.press('Control+a'); await w.fill('100') }
  if(await h.count()){ await h.click(); await page.keyboard.press('Control+a'); await h.fill('100') }
  const apply=page.locator('[data-testid="artboard-apply"]')
  if(await apply.count()) await apply.click(); else await page.keyboard.press('Enter')
  await page.waitForTimeout(400)
}
await shot(page,'verifyB-2-after-apply')
const artboardAfter = await page.evaluate(()=>{ const a=document.querySelector('[data-role="artboard"]'); return a?{w:a.getAttribute('width'),h:a.getAttribute('height')}:null })
console.log('artboard after setting 100x100:', JSON.stringify(artboardAfter))
console.log('VERDICT B: artboard changed?', JSON.stringify(artboardBefore)!==JSON.stringify(artboardAfter)?'changed':'NO-OP (bug confirmed)')

// reset
await page.reload({ waitUntil:'networkidle' }); await page.waitForTimeout(800)
const box3 = await page.locator('[data-role="canvas-root"]').boundingBox()

// ---------- BUG C: cross-layer group + undo dumps elements into one layer ----------
console.log('\n=== BUG C: cross-layer group undo ===')
// add a second layer
const addLayer = page.locator('[data-testid="add-layer"]')
if(await addLayer.count()){ await addLayer.click(); await page.waitForTimeout(200) }
console.log('layers after add:', JSON.stringify(await layerMembership()))
// draw a shape (lands on whichever layer is active)
await page.keyboard.press('r'); await drag(140,140,260,220)
// activate the OTHER layer by clicking its row, then draw again
const rows = page.locator('g[data-layer-name]')
// click first layer row in panel to switch active layer
const layerRows = page.locator('[data-testid="inspector"]').getByText(/Layer/)
const n = await layerRows.count(); console.log('layer rows in panel:', n)
if(n>=2){ await layerRows.nth(1).click(); await page.waitForTimeout(150) }
await page.keyboard.press('r'); await drag(320,260,440,340)
const beforeGroup = await layerMembership()
console.log('before group (one shape per layer ideally):', JSON.stringify(beforeGroup))
// select all + group + undo
await page.keyboard.press('v'); await page.keyboard.press('Control+a'); await page.waitForTimeout(150)
await page.keyboard.press('Control+g'); await page.waitForTimeout(200)
console.log('after group:', JSON.stringify(await layerMembership()))
await page.keyboard.press('Control+z'); await page.waitForTimeout(250)
const afterUndo = await layerMembership()
await shot(page,'verifyC-after-undo')
console.log('after undo group:', JSON.stringify(afterUndo))
const sameAsBefore = JSON.stringify(beforeGroup)===JSON.stringify(afterUndo)
console.log('VERDICT C: layer membership restored by undo?', sameAsBefore?'restored':'NOT restored (possible data-loss bug)')

dumpLog(log)
await browser.close()
console.log('\nVERIFY-HEADLINE DONE')
