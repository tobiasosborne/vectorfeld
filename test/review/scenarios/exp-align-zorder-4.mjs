import { openApp, dumpLog, shot } from '../_driver.mjs'
const { browser, page, log } = await openApp()
const box = await page.locator('[data-role="canvas-root"]').boundingBox()
async function tool(l){ await page.keyboard.press(l); await page.waitForTimeout(80) }
async function drag(x1,y1,x2,y2){ await page.mouse.move(box.x+x1,box.y+y1); await page.mouse.down(); for(let i=1;i<=5;i++){await page.mouse.move(box.x+x1+(x2-x1)*i/5,box.y+y1+(y2-y1)*i/5);await page.waitForTimeout(10)} await page.mouse.up(); await page.waitForTimeout(80) }
async function clickAt(cx,cy,o={}){ await page.mouse.click(box.x+cx,box.y+cy,o); await page.waitForTimeout(120) }
async function boxes(){ return await page.evaluate(()=>document.querySelectorAll('[data-role="selection-box"]').length) }

await tool('r'); await drag(120,120,200,200)
await tool('r'); await drag(320,120,400,200)
await tool('r'); await drag(520,120,600,200)
await tool('v'); await clickAt(900,600)

// CLEAN shift-click additive selection from scratch
await clickAt(160,160); console.log('click A:', await boxes())
await clickAt(360,160,{modifiers:['Shift']}); console.log('shift+click B:', await boxes(),'(expect 2)')
await clickAt(560,160,{modifiers:['Shift']}); console.log('shift+click C:', await boxes(),'(expect 3)')
await clickAt(360,160,{modifiers:['Shift']}); console.log('shift+click B again (toggle off):', await boxes(),'(expect 2)')

// collapse: plain click one of the multi
await clickAt(900,600)
await clickAt(160,160); await clickAt(360,160,{modifiers:['Shift']}); await clickAt(560,160,{modifiers:['Shift']})
console.log('built 3-sel:', await boxes())
await clickAt(160,160) // plain click on already-selected A, no drag
console.log('plain click on selected A (no drag):', await boxes(),'(EXPECT 1 - collapse)')
await shot(page,'exp-align-zorder-4-nocollapse')

dumpLog(log)
await browser.close()
console.log('DONE-4')
