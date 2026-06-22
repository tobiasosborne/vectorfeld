import { openApp, shot, dumpLog } from '../_driver.mjs'
const { browser, page, log } = await openApp()
const box = await page.locator('[data-role="canvas-root"]').boundingBox()
async function tool(l){ await page.keyboard.press(l); await page.waitForTimeout(80) }
async function drag(x1,y1,x2,y2){ await page.mouse.move(box.x+x1,box.y+y1); await page.mouse.down(); for(let i=1;i<=5;i++){await page.mouse.move(box.x+x1+(x2-x1)*i/5,box.y+y1+(y2-y1)*i/5);await page.waitForTimeout(10)} await page.mouse.up(); await page.waitForTimeout(80) }
async function clickAt(cx,cy,o={}){ await page.mouse.click(box.x+cx,box.y+cy,o); await page.waitForTimeout(100) }
async function order(){ return await page.evaluate(()=>Array.from(document.querySelector('g[data-layer-name]').children).map(c=>c.getAttribute('id')).join(',')) }
async function sel(){ return await page.evaluate(()=>({boxes:document.querySelectorAll('[data-role="selection-box"]').length})) }

await tool('r'); await drag(120,120,200,200)  // vf-1 A left
await tool('r'); await drag(320,120,400,200)  // vf-2 B mid
await tool('r'); await drag(520,120,600,200)  // vf-3 C right
await tool('v'); await clickAt(900,600)
console.log('init order:', await order())

// KEYBOARD bring-forward on the BOTTOM element (vf-1): should step toward front
await clickAt(160,160)
console.log('sel A boxes:', (await sel()).boxes)
let b = await order()
await page.keyboard.press('Control+BracketRight'); await page.waitForTimeout(150)
console.log('Ctrl+] (fwd) on bottom A:', b, '->', await order(), '(expect vf-2,vf-1,vf-3)')

// reset
await clickAt(900,600); await clickAt(900,600)
// rebuild deterministic order via menu? just continue. Now keyboard send-to-back on front (vf-3)
await clickAt(560,160)
b = await order()
await page.keyboard.press('Control+Shift+BracketLeft'); await page.waitForTimeout(150)
console.log('Ctrl+Shift+[ (to back) on C:', b, '->', await order(), '(expect vf-3 first)')

// keyboard bring-to-front on first element
const firstId = (await order()).split(',')[0]
// select first element by clicking — but positions: A~160,B~360,C~560 in canvas; map id->click
const idToClick = { 'vf-1':[160,160], 'vf-2':[360,160], 'vf-3':[560,160] }
await clickAt(900,600); await clickAt(...idToClick[firstId])
b = await order()
await page.keyboard.press('Control+Shift+BracketRight'); await page.waitForTimeout(150)
console.log(`Ctrl+Shift+] (to front) on first(${firstId}):`, b, '->', await order(), `(expect ${firstId} last)`)

// ===== SINGLE-CLICK-AFTER-CTRL-A bug =====
console.log('--- selection collapse test ---')
await page.keyboard.press('Control+a'); await page.waitForTimeout(120)
console.log('after Ctrl+A boxes:', (await sel()).boxes)
await clickAt(160,160)  // click squarely inside A
console.log('after single-click A boxes:', (await sel()).boxes, '(EXPECT 1)')
await shot(page,'exp-align-zorder-3-collapse')
// click empty then single A to confirm normal path works
await clickAt(900,600); await clickAt(160,160)
console.log('empty-then-click A boxes:', (await sel()).boxes, '(expect 1)')

// shift-click add then plain click collapse
await clickAt(900,600); await clickAt(160,160); await clickAt(360,160,{modifiers:['Shift']})
console.log('A + shift B boxes:', (await sel()).boxes, '(expect 2)')
await clickAt(560,160)  // plain click C
console.log('then plain click C boxes:', (await sel()).boxes, '(expect 1)')
await shot(page,'exp-align-zorder-3-collapse2')

// ===== GROUP TRANSFORM PRESERVATION (clean) =====
console.log('--- group transform preservation ---')
await clickAt(900,600)
await page.keyboard.press('Control+a'); await page.waitForTimeout(100)
await page.getByRole('button',{name:'Object',exact:true}).click(); await page.waitForTimeout(120)
await page.locator('button',{has:page.locator('span',{hasText:/^Group$/})}).last().click(); await page.waitForTimeout(150)
const grp = await page.evaluate(()=>{const l=document.querySelector('g[data-layer-name]');const g=Array.from(l.children).find(c=>c.tagName==='g'&&!c.hasAttribute('data-layer-name'));return g?g.getAttribute('id'):null})
console.log('group id:', grp)
// apply transform to group, record child screen positions
const pre = await page.evaluate((gid)=>{const g=document.getElementById(gid);g.setAttribute('transform','translate(40,40) rotate(15)');return Array.from(g.children).map(c=>{const r=c.getBoundingClientRect();return{id:c.getAttribute('id'),sx:Math.round(r.x),sy:Math.round(r.y),tr:c.getAttribute('transform')||''}})},grp)
await page.waitForTimeout(120)
await shot(page,'exp-align-zorder-3-grp-transformed')
console.log('children screen WITH group transform:', JSON.stringify(pre))
// select the group and ungroup. select via clicking a child rendered location:
const sp = await page.evaluate((gid)=>{const g=document.getElementById(gid);const c=g.children[0];const r=c.getBoundingClientRect();return{x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}},grp)
await page.mouse.click(sp.x, sp.y); await page.waitForTimeout(120)
console.log('clicked group child at screen', JSON.stringify(sp),'sel boxes', (await sel()).boxes)
await page.getByRole('button',{name:'Object',exact:true}).click(); await page.waitForTimeout(120)
const ung = page.locator('button',{has:page.locator('span',{hasText:/^Ungroup$/})}).last()
const ungEnabled = await ung.isEnabled()
console.log('Ungroup enabled?', ungEnabled)
if(ungEnabled){ await ung.click(); await page.waitForTimeout(150) } else { await page.keyboard.press('Escape') }
const post = await page.evaluate(()=>{const l=document.querySelector('g[data-layer-name]');return Array.from(l.children).map(c=>{const r=c.getBoundingClientRect();return{id:c.getAttribute('id'),tag:c.tagName,sx:Math.round(r.x),sy:Math.round(r.y),tr:c.getAttribute('transform')||''}})})
console.log('after ungroup layer children:', JSON.stringify(post))
await shot(page,'exp-align-zorder-3-grp-ungrouped')
for(const c of post){const p=pre.find(x=>x.id===c.id); if(p) console.log(`  ${c.id}: drift dx=${c.sx-p.sx} dy=${c.sy-p.sy} tr='${c.tr}' (drift should be ~0 if transform preserved)`)}

dumpLog(log)
await browser.close()
console.log('DONE-3')
