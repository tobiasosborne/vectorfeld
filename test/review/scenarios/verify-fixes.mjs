import { openApp, shot, dumpLog } from '../_driver.mjs'

const { browser, page, log } = await openApp()
const box = await page.locator('[data-role="canvas-root"]').boundingBox()
async function drag(x1,y1,x2,y2){ await page.mouse.move(box.x+x1,box.y+y1); await page.mouse.down(); for(let i=1;i<=5;i++){await page.mouse.move(box.x+x1+(x2-x1)*i/5,box.y+y1+(y2-y1)*i/5);await page.waitForTimeout(12)} await page.mouse.up(); await page.waitForTimeout(120) }
const state = ()=>page.evaluate(()=>({kids:document.querySelector('g[data-layer-name]')?.children.length, selBoxes:document.querySelectorAll('[data-role="selection-box"]').length, insp:(document.querySelector('[data-testid="inspector"]')?.innerText||'').split('\n')[0]}))
let pass=true
const check=(name,cond,detail)=>{ console.log((cond?'PASS':'FAIL')+'  '+name+'  '+detail); if(!cond) pass=false }

// ---- 3yu.6: text-edit Ctrl+Z must NOT undo a committed shape ----
await page.keyboard.press('r'); await drag(120,120,300,220)
let s=await state(); const rectKids=s.kids
await page.keyboard.press('t'); await page.mouse.click(box.x+160,box.y+320); await page.waitForTimeout(150)
await page.keyboard.type('typo',{delay:25})
await page.keyboard.press('Control+z'); await page.waitForTimeout(200)
s=await state()
check('3yu.6 text-edit Ctrl+Z preserves prior shape', s.kids>=rectKids, `kids ${rectKids}->${s.kids} (expect kept)`)
await page.keyboard.press('Escape'); await page.waitForTimeout(150)

// reset
await page.reload({waitUntil:'networkidle'}); await page.waitForTimeout(700)
const b2=await page.locator('[data-role="canvas-root"]').boundingBox()
const drag2=async(x1,y1,x2,y2)=>{await page.mouse.move(b2.x+x1,b2.y+y1);await page.mouse.down();for(let i=1;i<=5;i++){await page.mouse.move(b2.x+x1+(x2-x1)*i/5,b2.y+y1+(y2-y1)*i/5);await page.waitForTimeout(12)}await page.mouse.up();await page.waitForTimeout(100)}

// ---- 3yu.9: stale selection after undo-to-empty ----
await page.keyboard.press('r'); await drag2(120,120,220,200)
await page.keyboard.press('r'); await drag2(260,140,360,230)
await page.keyboard.press('r'); await drag2(150,260,260,340)
await page.keyboard.press('v'); await page.keyboard.press('Control+a'); await page.waitForTimeout(120)
let pre=await state(); console.log('  3 shapes selected:', JSON.stringify(pre))
for(let i=0;i<6;i++){await page.keyboard.press('Control+z'); await page.waitForTimeout(70)}
s=await state()
await shot(page,'verifyfix-undo-empty')
check('3yu.9 no phantom selection boxes after undo-to-empty', s.kids===0 && s.selBoxes===0, `kids=${s.kids} selBoxes=${s.selBoxes} insp="${s.insp}"`)
check('3yu.9 inspector not claiming selection over empty canvas', !/SELECTED/i.test(s.insp), `insp="${s.insp}"`)
// Ctrl+D on the (now-pruned) selection must NOT resurrect a deleted element
await page.keyboard.press('Control+d'); await page.waitForTimeout(150)
s=await state()
check('3yu.9 Ctrl+D after undo-to-empty does not resurrect', s.kids===0, `kids=${s.kids} (expect 0)`)

// reset
await page.reload({waitUntil:'networkidle'}); await page.waitForTimeout(700)
const b3=await page.locator('[data-role="canvas-root"]').boundingBox()
const drag3=async(x1,y1,x2,y2)=>{await page.mouse.move(b3.x+x1,b3.y+y1);await page.mouse.down();for(let i=1;i<=5;i++){await page.mouse.move(b3.x+x1+(x2-x1)*i/5,b3.y+y1+(y2-y1)*i/5);await page.waitForTimeout(12)}await page.mouse.up();await page.waitForTimeout(100)}

// ---- 3yu.19: shortcuts must not fire while a <select> dropdown is focused ----
await page.keyboard.press('r'); await drag3(140,140,280,240)
await page.keyboard.press('v'); await page.mouse.click(b3.x+200,b3.y+190); await page.waitForTimeout(150)
let kidsBefore=(await state()).kids
const ft=page.locator('[data-testid="fill-type"]')
if(await ft.count()){
  await ft.focus(); await page.waitForTimeout(80)
  await page.keyboard.press('Delete'); await page.waitForTimeout(150)
  const after=(await state()).kids
  check('3yu.19 Delete while <select> focused does not delete element', after===kidsBefore, `kids ${kidsBefore}->${after} (expect kept)`)
} else { console.log('  (fill-type select not found; selecting a shape may not have mounted it)'); }

dumpLog(log)
await browser.close()
console.log('\n=== RESULT: '+(pass?'ALL PASS':'SOME FAILED')+' ===')
process.exit(pass?0:1)
