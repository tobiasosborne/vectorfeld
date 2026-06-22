import { openApp, dumpLog } from '../_driver.mjs'
const { browser, page, log } = await openApp()
const box = await page.locator('[data-role="canvas-root"]').boundingBox()
async function tool(l){ await page.keyboard.press(l); await page.waitForTimeout(80) }
async function drag(x1,y1,x2,y2){ await page.mouse.move(box.x+x1,box.y+y1); await page.mouse.down(); for(let i=1;i<=5;i++){await page.mouse.move(box.x+x1+(x2-x1)*i/5,box.y+y1+(y2-y1)*i/5);await page.waitForTimeout(10)} await page.mouse.up(); await page.waitForTimeout(80) }

await tool('r'); await drag(120,120,250,250)  // vf-1 big back
await tool('r'); await drag(180,180,310,310)  // vf-2 overlaps, front
await tool('r'); await drag(400,120,460,180)  // vf-3 separate
await tool('v')
await page.mouse.click(box.x+900,box.y+600); await page.waitForTimeout(100)
const domBefore = await page.evaluate(()=>Array.from(document.querySelector('g[data-layer-name]').children).map(c=>c.getAttribute('id')))
console.log('DOM before:', domBefore.join(','))

// select in REVERSE / mixed order via shift-click: click vf-3 first, then vf-1, then vf-2
await page.mouse.click(box.x+430,box.y+150); await page.waitForTimeout(100)  // vf-3
await page.keyboard.down('Shift')
await page.mouse.move(box.x+135,box.y+135); await page.mouse.down(); await page.mouse.up()  // vf-1 corner
await page.mouse.move(box.x+295,box.y+295); await page.mouse.down(); await page.mouse.up()  // vf-2 corner
await page.keyboard.up('Shift'); await page.waitForTimeout(150)
const selOrder = await page.evaluate(()=>{
  // reconstruct selection order if exposed; fallback: count boxes
  return document.querySelectorAll('[data-role="selection-box"]').length
})
console.log('selection boxes:', selOrder)

// Group
await page.getByRole('button',{name:'Object',exact:true}).click(); await page.waitForTimeout(120)
await page.locator('button',{has:page.locator('span',{hasText:/^Group$/})}).last().click(); await page.waitForTimeout(150)
const grpKids = await page.evaluate(()=>{const l=document.querySelector('g[data-layer-name]');const g=Array.from(l.children).find(c=>c.tagName==='g'&&!c.hasAttribute('data-layer-name'));return g?Array.from(g.children).map(c=>c.getAttribute('id')):null})
console.log('group children DOM order after grouping:', grpKids?grpKids.join(','):'NONE','(should preserve back-to-front: vf-1,vf-2,vf-3)')

dumpLog(log)
await browser.close()
console.log('DONE-8')
