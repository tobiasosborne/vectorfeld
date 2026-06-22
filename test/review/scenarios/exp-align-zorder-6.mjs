import { openApp, dumpLog, shot } from '../_driver.mjs'
const { browser, page, log } = await openApp()
const box = await page.locator('[data-role="canvas-root"]').boundingBox()
async function tool(l){ await page.keyboard.press(l); await page.waitForTimeout(80) }
async function drag(x1,y1,x2,y2){ await page.mouse.move(box.x+x1,box.y+y1); await page.mouse.down(); for(let i=1;i<=5;i++){await page.mouse.move(box.x+x1+(x2-x1)*i/5,box.y+y1+(y2-y1)*i/5);await page.waitForTimeout(10)} await page.mouse.up(); await page.waitForTimeout(80) }
async function boxes(){ return await page.evaluate(()=>document.querySelectorAll('[data-role="selection-box"]').length) }
async function shiftClick(cx,cy){ await page.keyboard.down('Shift'); await page.mouse.move(box.x+cx,box.y+cy); await page.mouse.down(); await page.mouse.up(); await page.keyboard.up('Shift'); await page.waitForTimeout(120) }
async function plainClick(cx,cy){ await page.mouse.click(box.x+cx,box.y+cy); await page.waitForTimeout(120) }

await tool('r'); await drag(120,120,200,200)
await tool('r'); await drag(320,120,400,200)
await tool('r'); await drag(520,120,600,200)
await tool('v'); await plainClick(900,600)

// Build a real 3-selection via shift-click
await plainClick(160,160)
await shiftClick(360,160)
await shiftClick(560,160)
console.log('built selection boxes:', await boxes(),'(expect 3)')

// Now PLAIN click (no drag) on one already-selected element -> standard editors collapse to that one
await plainClick(160,160)
console.log('plain click on A within 3-sel:', await boxes(),'(EXPECT 1 if collapse-on-click works)')
await shot(page,'exp-align-zorder-6-collapse')

// Ctrl+A variant
await page.keyboard.press('Control+a'); await page.waitForTimeout(100)
console.log('Ctrl+A boxes:', await boxes())
await plainClick(360,160)
console.log('plain click B after Ctrl+A:', await boxes(),'(EXPECT 1)')

dumpLog(log)
await browser.close()
console.log('DONE-6')
