import { openApp, shot, dumpLog } from '../_driver.mjs'

const { browser, page, log } = await openApp()
const box = await page.locator('[data-role="canvas-root"]').boundingBox()
async function snap() {
  return await page.evaluate(() => {
    const layer = document.querySelector('g[data-layer-name]')
    return {
      kids: layer ? layer.children.length : -1,
      selBoxes: document.querySelectorAll('[data-role="selection-box"]').length,
      handles: document.querySelectorAll('[data-role="scale-handle"]').length,
      inspector: (document.querySelector('[data-testid="inspector"]')?.innerText||'').replace(/\s+/g,' ').trim().slice(0,80),
      xml: (layer?.outerHTML||'').replace(/\sid="vf-\d+"/g,'').replace(/\s+/g,' ').trim(),
    }
  })
}
async function tool(l){await page.keyboard.press(l);await page.waitForTimeout(80)}
async function drag(x1,y1,x2,y2){await page.mouse.move(box.x+x1,box.y+y1);await page.mouse.down();for(let i=1;i<=5;i++){await page.mouse.move(box.x+x1+(x2-x1)*i/5,box.y+y1+(y2-y1)*i/5);await page.waitForTimeout(10)}await page.mouse.up();await page.waitForTimeout(80)}
async function undo(){await page.keyboard.press('Control+z');await page.waitForTimeout(120)}
async function redo(){await page.keyboard.press('Control+Shift+z');await page.waitForTimeout(120)}

// Build 3 rects, select all, undo to empty -> phantom selection of 3
await tool('r');await drag(120,120,280,240)
await tool('r');await drag(340,120,500,240)
await tool('r');await drag(120,320,280,440)
await tool('v');await page.keyboard.press('Control+a');await page.waitForTimeout(150)
await undo();await undo();await undo()
let s=await snap()
console.log(`SETUP undo-to-empty: kids=${s.kids} selBox=${s.selBoxes} insp="${s.inspector}"`)

// === ADVERSARIAL 1: click Align Left on phantom selection ===
console.log('\n--- click Align L on phantom ---')
const alignL = page.getByRole('button',{name:'L',exact:true}).first()
const alignVisible = await alignL.isVisible().catch(()=>false)
console.log(`Align L visible? ${alignVisible}`)
if (alignVisible){ await alignL.click().catch(e=>console.log('align click err:',e.message)); await page.waitForTimeout(150) }
s=await snap()
console.log(`after Align L: kids=${s.kids} selBox=${s.selBoxes} insp="${s.inspector}"`)
await shot(page,'exp-undo-redo-phantom-align')

// === ADVERSARIAL 2: phantom group ===
console.log('\n--- Ctrl+G on phantom ---')
await page.keyboard.press('Control+g');await page.waitForTimeout(150)
s=await snap()
console.log(`after phantom group: kids=${s.kids} selBox=${s.selBoxes} insp="${s.inspector}"`)
await shot(page,'exp-undo-redo-phantom-group')

// === ADVERSARIAL 3: redo after phantom ops — is redo stack intact? ===
console.log('\n--- redo x4 after phantom ops ---')
for(let i=0;i<4;i++){await redo();const ss=await snap();console.log(`redo#${i+1}: kids=${ss.kids} selBox=${ss.selBoxes}`)}
s=await snap()
console.log(`after redo: kids=${s.kids} (expected 3 if redo stack survived phantom ops)`)
await shot(page,'exp-undo-redo-phantom-redo')

// === ADVERSARIAL 4: phantom duplicate (Ctrl+D) — does it clone detached nodes back in? ===
console.log('\n--- rebuild phantom then Ctrl+D ---')
await undo();await undo();await undo();await undo()  // back to empty with phantom
await page.keyboard.press('Control+a').catch(()=>{}) // nothing to select
s=await snap();console.log(`pre-dup: kids=${s.kids} selBox=${s.selBoxes}`)
// re-create phantom: build+selectall+undo
await tool('r');await drag(140,140,300,260)
await tool('v');await page.mouse.click(box.x+220,box.y+200);await page.waitForTimeout(100)
await undo() // remove the just-added rect while selected
s=await snap();console.log(`phantom-1 after undo: kids=${s.kids} selBox=${s.selBoxes} insp="${s.inspector}"`)
await page.keyboard.press('Control+d');await page.waitForTimeout(150) // duplicate phantom
s=await snap();console.log(`after Ctrl+D on phantom: kids=${s.kids} selBox=${s.selBoxes} insp="${s.inspector}"`)
await shot(page,'exp-undo-redo-phantom-dup')

dumpLog(log)
await browser.close()
console.log('EXP-UNDO-REDO-3 DONE')
