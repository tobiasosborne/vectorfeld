import { openApp, shot, dumpLog } from '../_driver.mjs'
const { browser, page, log } = await openApp()
const box = await page.locator('[data-role="canvas-root"]').boundingBox()
async function tool(l){ await page.keyboard.press(l); await page.waitForTimeout(100) }
async function drag(x1,y1,x2,y2){ await page.mouse.move(box.x+x1,box.y+y1); await page.mouse.down(); for(let i=1;i<=6;i++){await page.mouse.move(box.x+x1+(x2-x1)*i/6,box.y+y1+(y2-y1)*i/6);await page.waitForTimeout(10)} await page.mouse.up(); await page.waitForTimeout(120) }
async function userType(label,val){ const h=await page.evaluateHandle((label)=>{const insp=document.querySelector('[data-testid="inspector"]');const sp=Array.from(insp.querySelectorAll('span')).find(s=>s.textContent.trim()===label);return sp?sp.closest('label').querySelector('input'):null},label); const el=h.asElement(); if(!el){console.log('no input',label);return} await el.click({clickCount:3}); await page.keyboard.type(String(val),{delay:25}); await page.keyboard.press('Enter'); await page.waitForTimeout(200) }
async function st(){ return page.evaluate(()=>{const r=document.querySelector('g[data-layer-name] rect');if(!r)return null;const b=r.getBBox();return{w:+(+r.getAttribute('width')).toFixed(3),h:+(+r.getAttribute('height')).toFixed(3),t:r.getAttribute('transform'),localW:+b.width.toFixed(2),localH:+b.height.toFixed(2)}}) }

// Draw a SQUARE (160x160 screen px ~ equal mm)
await tool('r'); await drag(220,180,360,320)
await tool('v'); await page.mouse.click(box.x+290,box.y+250); await page.waitForTimeout(150)
console.log('square initial:', JSON.stringify(await st()))
// rotate 45 via numeric
await userType('Rot', 45)
const rot = await st()
console.log('after Rot=45:', JSON.stringify(rot))
await shot(page,'exp-transform-rs-1-rot45')

// Now uniform-scale via SE handle INNER point (toward center) with Shift for proportional
const se = await page.evaluate(()=>{const h=document.querySelector('[data-role="scale-handle"][data-handle-pos="se"]');const r=h.getBoundingClientRect();return{cx:r.x+r.width/2,cy:r.y+r.height/2}})
// click inner part (toward shape center) to avoid rotation zone
const px=se.cx-3, py=se.cy-3
await page.keyboard.down('Shift')
await page.mouse.move(px,py); await page.mouse.down()
await page.mouse.move(px+50,py+50,{steps:8}); await page.mouse.move(px+50,py+50)
await page.mouse.up(); await page.keyboard.up('Shift')
await page.waitForTimeout(200)
const scaled = await st()
console.log('after shift-uniform-scale of 45deg square:', JSON.stringify(scaled))
const aspect = scaled? (scaled.w/scaled.h):0
console.log('ASPECT w/h =', aspect.toFixed(3), '(should be ~1.0 for a square)')
await shot(page,'exp-transform-rs-2-scaled')

dumpLog(log); await browser.close(); console.log('ROTSCALE DONE')
