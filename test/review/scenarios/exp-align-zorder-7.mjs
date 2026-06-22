import { openApp, dumpLog, shot } from '../_driver.mjs'
const { browser, page, log } = await openApp()
const box = await page.locator('[data-role="canvas-root"]').boundingBox()
async function tool(l){ await page.keyboard.press(l); await page.waitForTimeout(80) }
async function drag(x1,y1,x2,y2){ await page.mouse.move(box.x+x1,box.y+y1); await page.mouse.down(); for(let i=1;i<=5;i++){await page.mouse.move(box.x+x1+(x2-x1)*i/5,box.y+y1+(y2-y1)*i/5);await page.waitForTimeout(10)} await page.mouse.up(); await page.waitForTimeout(80) }
async function bbs(){ return await page.evaluate(()=>{const l=document.querySelector('g[data-layer-name]');return Array.from(l.children).map(c=>{const b=c.getBBox();return{id:c.getAttribute('id'),x:Math.round(b.x),cx:Math.round(b.x+b.width/2),cy:Math.round(b.y+b.height/2)}})}) }

// 3 rects with UNEVEN horizontal spacing
await tool('r'); await drag(120,200,180,260)   // A center ~150
await tool('r'); await drag(220,200,280,260)   // B center ~250 (close to A)
await tool('r'); await drag(560,200,620,260)   // C center ~590 (far)
await tool('v')
// select all via shift-click held
await page.mouse.click(box.x+150,box.y+230); await page.waitForTimeout(100)
await page.keyboard.down('Shift')
await page.mouse.move(box.x+250,box.y+230); await page.mouse.down(); await page.mouse.up()
await page.mouse.move(box.x+590,box.y+230); await page.mouse.down(); await page.mouse.up()
await page.keyboard.up('Shift'); await page.waitForTimeout(150)
console.log('before distribute centersX:', JSON.stringify(await bbs()))
await shot(page,'exp-align-zorder-7-before')

// Inspector Distribute H button (testid? it's "H" under Distribute). Find it.
const distH = page.locator('[data-testid="inspector"] button', { hasText: /^H$/ })
const cnt = await distH.count()
console.log('Distribute H buttons found in inspector:', cnt)
if(cnt>0){ await distH.first().click(); await page.waitForTimeout(150) }
const after = await bbs()
console.log('after Distribute H centersX:', JSON.stringify(after))
// check even spacing of centers
const cxs = after.map(a=>a.cx).sort((a,b)=>a-b)
console.log('sorted centersX:', cxs, 'gaps:', cxs[1]-cxs[0], cxs[2]-cxs[1], '(should be equal)')
await shot(page,'exp-align-zorder-7-after')

dumpLog(log)
await browser.close()
console.log('DONE-7')
