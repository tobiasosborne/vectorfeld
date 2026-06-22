import { openApp, shot, dumpLog } from '../_driver.mjs'
const { browser, page, log } = await openApp()
const SHOT = 'exp-layers-pages-c'
function note(k, v) { console.log(`>> ${k}:`, typeof v === 'string' ? v : JSON.stringify(v)) }

async function state() {
  return await page.evaluate(() => {
    const layerEls = Array.from(document.querySelectorAll('g[data-layer-name]'))
    const layers = layerEls.map(el => ({ name: el.getAttribute('data-layer-name'), display: el.style.display, locked: el.getAttribute('data-locked'), kids: el.children.length }))
    const selBoxes = document.querySelectorAll('[data-role="selection-box"]').length
    const panel = document.querySelector('[data-testid="inspector"]')
    const selLine = panel?.innerText.split('\n')[0]
    return { layers, selBoxes, selLine }
  })
}
async function clickRowBtn(rowIdx, title) {
  return await page.evaluate(({ rowIdx, title }) => {
    const panel = document.querySelector('[data-testid="inspector"]')
    const rows = Array.from(panel.querySelectorAll('div')).filter(d => d.querySelectorAll(':scope > button').length >= 4 && d.querySelector('svg'))
    const row = rows[rowIdx]; if (!row) return 'no-row'
    const btn = Array.from(row.querySelectorAll('button')).find(b => (title==='vis'&&['Hide','Show'].includes(b.title))||(title==='lock'&&['Lock','Unlock'].includes(b.title))||b.title===title)
    if (!btn) return 'no-btn'; btn.click(); return 'ok'
  }, { rowIdx, title })
}

const canvas = await page.locator('[data-role="canvas-root"]').boundingBox()
async function drawRect(x1,y1,x2,y2){ await page.keyboard.press('r'); await page.mouse.move(canvas.x+x1,canvas.y+y1); await page.mouse.down(); await page.mouse.move(canvas.x+x2,canvas.y+y2,{steps:6}); await page.mouse.up(); await page.waitForTimeout(120) }

// === SCENARIO A: hide a layer while its element is selected ===
await drawRect(300,200,420,300)
note('A: after draw', await state())
// rect is selected. Hide the layer it lives in (Layer 1, row 0)
await clickRowBtn(0,'vis')
await page.waitForTimeout(150)
note('A: after HIDE selected element layer -> phantom selection?', await state())
await shot(page, `${SHOT}-A-hidden-selected`)

// === SCENARIO B: undo does NOT revert hide; reverts the draw instead ===
note('B: history len? press undo', '')
await page.keyboard.press('Control+z')
await page.waitForTimeout(150)
note('B: after 1x undo (user expects un-hide)', await state())
await shot(page, `${SHOT}-B-undo`)
await page.keyboard.press('Control+z')
await page.waitForTimeout(150)
note('B: after 2x undo', await state())

// === SCENARIO C: lock not undoable ===
await browser.close().then(()=>{}) // close A/B context, fresh below
const r2 = await openApp(); const p2 = r2.page
async function state2(){ return await p2.evaluate(()=>{const e=Array.from(document.querySelectorAll('g[data-layer-name]')); return e.map(x=>({n:x.getAttribute('data-layer-name'),locked:x.getAttribute('data-locked'),disp:x.style.display}))})}
async function clickRowBtn2(i,t){return await p2.evaluate(({i,t})=>{const panel=document.querySelector('[data-testid="inspector"]');const rows=Array.from(panel.querySelectorAll('div')).filter(d=>d.querySelectorAll(':scope > button').length>=4&&d.querySelector('svg'));const row=rows[i];if(!row)return'no-row';const b=Array.from(row.querySelectorAll('button')).find(b=>(t==='lock'&&['Lock','Unlock'].includes(b.title)));if(!b)return'no-btn';b.click();return'ok'},{i,t})}
await clickRowBtn2(0,'lock')
await p2.waitForTimeout(120)
note('C: after lock', await state2())
await p2.keyboard.press('Control+z')
await p2.waitForTimeout(150)
note('C: after undo (should unlock if undoable)', await state2())
dumpLog(r2.log)
await r2.browser.close()
console.log('DONE')
