import { openApp, shot, dumpLog } from '../_driver.mjs'
const { browser, page, log } = await openApp()
const box = await page.locator('[data-role="canvas-root"]').boundingBox()
async function tool(l){ await page.keyboard.press(l); await page.waitForTimeout(100) }
async function drag(x1,y1,x2,y2){ await page.mouse.move(box.x+x1,box.y+y1); await page.mouse.down(); for(let i=1;i<=6;i++){await page.mouse.move(box.x+x1+(x2-x1)*i/6,box.y+y1+(y2-y1)*i/6);await page.waitForTimeout(10)} await page.mouse.up(); await page.waitForTimeout(120) }
async function fresh(){ await tool('v'); await page.keyboard.press('Control+a'); await page.keyboard.press('Delete'); await page.waitForTimeout(100); await tool('r'); await drag(200,200,360,320); await tool('v'); await page.mouse.click(box.x+280,box.y+260); await page.waitForTimeout(150) }
async function rectState(){ return page.evaluate(()=>{const r=document.querySelector('g[data-layer-name] rect');return r?{w:+(+r.getAttribute('width')).toFixed(2),h:+(+r.getAttribute('height')).toFixed(2),t:r.getAttribute('transform')}:null}) }
async function whatIsAt(cx,cy){ return page.evaluate(({cx,cy})=>{const el=document.elementFromPoint(cx,cy);return el?{tag:el.tagName,role:el.getAttribute('data-role'),pos:el.getAttribute('data-handle-pos')}:null},{cx,cy}) }

async function tryDrag(label, dxFromCenter, dyFromCenter){
  await fresh()
  const se = await page.evaluate(()=>{const h=document.querySelector('[data-role="scale-handle"][data-handle-pos="se"]');const r=h.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,cx:r.x+r.width/2,cy:r.y+r.height/2}})
  const px = se.cx + dxFromCenter, py = se.cy + dyFromCenter
  const at = await whatIsAt(px,py)
  const before = await rectState()
  await page.mouse.move(px,py); await page.mouse.down(); await page.mouse.move(px+60,py+45,{steps:8}); await page.mouse.move(px+60,py+45); await page.mouse.up(); await page.waitForTimeout(150)
  const after = await rectState()
  const mode = after.t && /rotate/.test(after.t) && Math.abs(after.w-before.w)<0.5 ? 'ROTATE' : (after.w>before.w+1?'SCALE':'NEITHER')
  console.log(`[${label}] handleRect=(${se.x.toFixed(0)},${se.y.toFixed(0)} ${se.w}x${se.h}) click@(${px.toFixed(1)},${py.toFixed(1)}) elementFromPoint=${JSON.stringify(at)} => before w=${before.w} after w=${after.w} t=${after.t} => MODE=${mode}`)
  return mode
}

// SE handle is 10px square centered on the corner. Test clicks across it.
await tryDrag('dead-center', 0, 0)
await tryDrag('inner (toward shape)', -3, -3)
await tryDrag('outer (away)', +3, +3)
await tryDrag('top-left of handle', -4, -4)
await tryDrag('bottom-right of handle', +4, +4)

dumpLog(log); await browser.close(); console.log('HANDLE PROBE DONE')
