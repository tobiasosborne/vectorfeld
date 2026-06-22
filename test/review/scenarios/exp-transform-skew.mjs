import { openApp, shot, dumpLog } from '../_driver.mjs'
const { browser, page, log } = await openApp()
const box = await page.locator('[data-role="canvas-root"]').boundingBox()
async function tool(l){ await page.keyboard.press(l); await page.waitForTimeout(100) }
async function drag(x1,y1,x2,y2){ await page.mouse.move(box.x+x1,box.y+y1); await page.mouse.down(); for(let i=1;i<=6;i++){await page.mouse.move(box.x+x1+(x2-x1)*i/6,box.y+y1+(y2-y1)*i/6);await page.waitForTimeout(10)} await page.mouse.up(); await page.waitForTimeout(120) }

await tool('r'); await drag(250,220,400,330)
await tool('v'); await page.mouse.click(box.x+325,box.y+275); await page.waitForTimeout(150)

function rectT(){ return page.evaluate(()=>{ const r=document.querySelector('g[data-layer-name] rect'); return r?r.getAttribute('transform'):'NO-RECT' }) }

// Locate the SkX and SkY inputs precisely by label span text, focus + type like a user
async function userType(label, val){
  const handle = await page.evaluateHandle((label)=>{
    const insp=document.querySelector('[data-testid="inspector"]')
    const spans=Array.from(insp.querySelectorAll('span'))
    const sp=spans.find(s=>s.textContent.trim()===label)
    if(!sp) return null
    const lbl=sp.closest('label')
    return lbl?lbl.querySelector('input'):null
  }, label)
  const el = handle.asElement()
  if(!el){ console.log('NO INPUT for', label); return }
  await el.click({ clickCount: 3 }) // focus + select all
  await page.keyboard.type(String(val), { delay: 30 })
  await page.keyboard.press('Enter')
  await page.waitForTimeout(200)
}

console.log('transform before:', await rectT())
await userType('Rot', 0) // ensure baseline
console.log('after Rot=0:', await rectT())
await userType('SkX', 30)
console.log('after SkX=30:', await rectT())
await shot(page,'exp-transform-skew-A-skx')
await userType('SkY', 20)
console.log('after SkY=20:', await rectT())
await shot(page,'exp-transform-skew-B-sky')
await userType('Rot', 15)
console.log('after Rot=15 (should keep skew):', await rectT())
await shot(page,'exp-transform-skew-C-rot')

// Now test corner-scale of a flat rect carefully
await tool('v')
await page.keyboard.press('Control+a'); await page.keyboard.press('Delete'); await page.waitForTimeout(120)
await tool('r'); await drag(200,200,360,320)
await tool('v'); await page.mouse.click(box.x+280,box.y+260); await page.waitForTimeout(150)
const before = await page.evaluate(()=>{const r=document.querySelector('g[data-layer-name] rect');return {w:r.getAttribute('width'),h:r.getAttribute('height'),x:r.getAttribute('x'),y:r.getAttribute('y'),t:r.getAttribute('transform')}})
const se = await page.evaluate(()=>{const h=document.querySelector('[data-role="scale-handle"][data-handle-pos="se"]');const r=h.getBoundingClientRect();return{cx:r.x+r.width/2,cy:r.y+r.height/2}})
console.log('SE handle at', JSON.stringify(se), 'before', JSON.stringify(before))
await page.mouse.move(se.cx, se.cy)
await page.mouse.down()
await page.mouse.move(se.cx+30, se.cy+20,{steps:4})
await page.mouse.move(se.cx+80, se.cy+60,{steps:8})
await page.mouse.move(se.cx+80, se.cy+60)
await page.mouse.up()
await page.waitForTimeout(200)
const after = await page.evaluate(()=>{const r=document.querySelector('g[data-layer-name] rect');return {w:r.getAttribute('width'),h:r.getAttribute('height'),x:r.getAttribute('x'),y:r.getAttribute('y'),t:r.getAttribute('transform')}})
console.log('after SE drag', JSON.stringify(after))
await shot(page,'exp-transform-skew-D-flatscale')

dumpLog(log); await browser.close(); console.log('SKEW PROBE DONE')
