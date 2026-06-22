import { openApp, shot, dumpLog } from '../_driver.mjs'
const { browser, page, log } = await openApp()
const box = await page.locator('[data-role="canvas-root"]').boundingBox()
async function snap(){return await page.evaluate(()=>{const l=document.querySelector('g[data-layer-name]');return{kids:l?l.children.length:-1,selBoxes:document.querySelectorAll('[data-role="selection-box"]').length,insp:(document.querySelector('[data-testid="inspector"]')?.innerText||'').replace(/\s+/g,' ').trim().slice(0,50)}})}
async function tool(l){await page.keyboard.press(l);await page.waitForTimeout(80)}
async function drag(a,b,c,d){await page.mouse.move(box.x+a,box.y+b);await page.mouse.down();for(let i=1;i<=5;i++){await page.mouse.move(box.x+a+(c-a)*i/5,box.y+b+(d-b)*i/5);await page.waitForTimeout(10)}await page.mouse.up();await page.waitForTimeout(80)}
async function undo(){await page.keyboard.press('Control+z');await page.waitForTimeout(120)}
// build rect, select, undo (phantom), Ctrl+D resurrect, then try to undo the resurrection
await tool('r');await drag(140,140,300,260)
await tool('v');await page.mouse.click(box.x+220,box.y+200);await page.waitForTimeout(100)
await undo()
let s=await snap();console.log(`phantom: kids=${s.kids} selBox=${s.selBoxes}`)
await page.keyboard.press('Control+d');await page.waitForTimeout(150)
s=await snap();console.log(`after Ctrl+D resurrect: kids=${s.kids} selBox=${s.selBoxes}`)
await undo();s=await snap();console.log(`undo#1 after resurrect: kids=${s.kids} selBox=${s.selBoxes}`)
await undo();s=await snap();console.log(`undo#2: kids=${s.kids} selBox=${s.selBoxes}`)
await undo();s=await snap();console.log(`undo#3: kids=${s.kids} selBox=${s.selBoxes}`)
dumpLog(log);await browser.close();console.log('DONE4')
