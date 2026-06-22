import { openApp, dumpLog, shot } from '../_driver.mjs'
const { browser, page, log } = await openApp()
const box = await page.locator('[data-role="canvas-root"]').boundingBox()
async function tool(l){ await page.keyboard.press(l); await page.waitForTimeout(80) }
async function drag(x1,y1,x2,y2){ await page.mouse.move(box.x+x1,box.y+y1); await page.mouse.down(); for(let i=1;i<=5;i++){await page.mouse.move(box.x+x1+(x2-x1)*i/5,box.y+y1+(y2-y1)*i/5);await page.waitForTimeout(10)} await page.mouse.up(); await page.waitForTimeout(80) }
async function boxes(){ return await page.evaluate(()=>document.querySelectorAll('[data-role="selection-box"]').length) }

await tool('r'); await drag(120,120,200,200)
await tool('r'); await drag(320,120,400,200)
await tool('r'); await drag(520,120,600,200)
await tool('v')
// empty click
await page.mouse.click(box.x+900, box.y+600); await page.waitForTimeout(100)

// Manual shift-click using keyboard.down('Shift') around the mouse click to ensure modifier on mousedown
await page.mouse.click(box.x+160, box.y+160); await page.waitForTimeout(120)
console.log('click A:', await boxes())
await page.keyboard.down('Shift')
await page.mouse.move(box.x+360, box.y+160)
await page.mouse.down(); await page.waitForTimeout(20); await page.mouse.up()
await page.keyboard.up('Shift')
await page.waitForTimeout(120)
console.log('manual shift+click B (Shift held via keyboard):', await boxes(),'(expect 2)')

// probe: does mousedown see shiftKey? install a listener
await page.evaluate(()=>{ window.__sk=[]; const svg=document.querySelector('svg'); svg.addEventListener('mousedown',e=>window.__sk.push(e.shiftKey),true) })
await page.keyboard.down('Shift')
await page.mouse.move(box.x+560, box.y+160); await page.mouse.down(); await page.mouse.up()
await page.keyboard.up('Shift')
await page.waitForTimeout(120)
const sk = await page.evaluate(()=>window.__sk)
console.log('shiftKey seen on mousedown:', JSON.stringify(sk), 'boxes now:', await boxes())

// MARQUEE multi-select (drag over all three)
await page.mouse.click(box.x+900, box.y+600); await page.waitForTimeout(100)
await drag(100, 90, 620, 230)  // big marquee over all 3
console.log('marquee over all 3 boxes:', await boxes(),'(expect 3)')
await shot(page,'exp-align-zorder-5-marquee')

dumpLog(log)
await browser.close()
console.log('DONE-5')
