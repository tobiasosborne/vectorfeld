import { openApp, shot, dumpLog } from '../_driver.mjs'
const SID = 'exp-zoom-pan-view2'
const { browser, page, log } = await openApp()

// authoritative zoom % from getZoomPercent equivalent
const zoom = () => page.evaluate(() => {
  const svg = document.querySelector('svg')
  const vb = svg.viewBox.baseVal
  const pxPerUnit = svg.clientWidth / vb.width
  const PX_PER_MM = 96/25.4
  return { pct:+((pxPerUnit/PX_PER_MM)*100).toFixed(1), vbw:+vb.width.toFixed(1), vbx:+vb.x.toFixed(1), vby:+vb.y.toFixed(1), clientW: svg.clientWidth }
})
const sbZoom = () => page.evaluate(() => {
  // the status-bar percent: the span right between zoom-out and zoom-in
  const zout = document.querySelector('[data-role="zoom-out"]')
  let n = zout?.nextElementSibling
  while (n && !/%/.test(n.textContent||'')) n = n.nextElementSibling
  return n?.textContent?.trim()
})
const wheelZoom = (deltaY, n, sx, sy) => page.evaluate(([deltaY,n,sx,sy]) => {
  const c = document.querySelector('[data-role="canvas-root"]')
  for (let i=0;i<n;i++) c.dispatchEvent(new WheelEvent('wheel',{deltaY,clientX:sx,clientY:sy,ctrlKey:true,bubbles:true,cancelable:true}))
}, [deltaY,n,sx,sy])

const cb = await (await page.$('[data-role="canvas-root"]')).boundingBox()
const midX = cb.x+cb.width/2, midY = cb.y+cb.height/2

console.log('initial:', JSON.stringify(await zoom()), 'statusbar:', await sbZoom())

// 1) Draw a REAL rect with the rect tool and verify it's a new element
const before = await page.evaluate(()=>document.querySelectorAll('g[data-layer-name] > *').length)
await page.keyboard.press('r')
await page.mouse.move(cb.x+cb.width*0.42, cb.y+cb.height*0.42)
await page.mouse.down()
await page.mouse.move(cb.x+cb.width*0.58, cb.y+cb.height*0.58, {steps:10})
await page.mouse.up()
await page.waitForTimeout(200)
const after = await page.evaluate(()=>{
  const kids = Array.from(document.querySelectorAll('g[data-layer-name] > *'))
  const last = kids[kids.length-1]
  return { count: kids.length, lastTag: last?.tagName, x:last?.getAttribute('x'), y:last?.getAttribute('y'), w:last?.getAttribute('width'), h:last?.getAttribute('height') }
})
console.log('layer kids before/after draw:', before, '->', JSON.stringify(after))
await shot(page, `${SID}-rect`)

// compute rect doc-center
const rx = +after.x, ry = +after.y, rw = +after.w, rh = +after.h
const rcx = rx + rw/2, rcy = ry + rh/2
console.log('rect doc-center:', rcx, rcy)

const docToScreen = (dx,dy)=>page.evaluate(([dx,dy])=>{const svg=document.querySelector('svg');const pt=svg.createSVGPoint();pt.x=dx;pt.y=dy;const p=pt.matrixTransform(svg.getScreenCTM());return{x:p.x,y:p.y}},[dx,dy])

// 2) hit-test at 100%
await page.keyboard.press('v')
await page.mouse.click(0,0); await page.waitForTimeout(60)
let hs = await docToScreen(rcx,rcy)
await page.mouse.click(hs.x,hs.y); await page.waitForTimeout(120)
let sel = await page.evaluate(()=>document.querySelectorAll('[data-role="selection-box"]').length)
console.log('HIT @100% center -> selBoxes', sel)

// 3) zoom in 8 steps centered on rect, re-hit
await wheelZoom(-100, 8, hs.x, hs.y)
await page.waitForTimeout(150)
console.log('after zoom-in:', JSON.stringify(await zoom()), 'statusbar:', await sbZoom())
await page.mouse.click(cb.x+5,cb.y+5); await page.waitForTimeout(60) // deselect via empty corner
hs = await docToScreen(rcx,rcy)
await page.mouse.click(hs.x,hs.y); await page.waitForTimeout(120)
sel = await page.evaluate(()=>document.querySelectorAll('[data-role="selection-box"]').length)
console.log('HIT @zoomed-in rect-center screen(',hs.x.toFixed(0),hs.y.toFixed(0),') -> selBoxes', sel)
await shot(page, `${SID}-hit-zoomin`)

// 3b) hit-test a corner of the rect (edge precision)
let hsCorner = await docToScreen(rx+1, ry+1)
await page.mouse.click(cb.x+5,cb.y+5); await page.waitForTimeout(60)
await page.mouse.click(hsCorner.x, hsCorner.y); await page.waitForTimeout(120)
let selC = await page.evaluate(()=>document.querySelectorAll('[data-role="selection-box"]').length)
console.log('HIT @rect near-corner -> selBoxes', selC)

// 4) zoom out test (does ctrl-wheel-out change vb?)
const zBeforeOut = await zoom()
await wheelZoom(100, 10, midX, midY)
await page.waitForTimeout(150)
const zAfterOut = await zoom()
console.log('ZOOM OUT vb.w', zBeforeOut.vbw, '->', zAfterOut.vbw, '| pct', zBeforeOut.pct, '->', zAfterOut.pct, '| statusbar', await sbZoom())

// 5) zoom-out clamp: spam many out steps, see floor
await wheelZoom(100, 40, midX, midY)
await page.waitForTimeout(150)
const zFloor = await zoom()
console.log('ZOOM OUT FLOOR:', JSON.stringify(zFloor))
await shot(page, `${SID}-zoomfloor`)

// 6) zoom-in ceiling
await wheelZoom(-100, 80, midX, midY)
await page.waitForTimeout(200)
const zCeil = await zoom()
console.log('ZOOM IN CEILING:', JSON.stringify(zCeil), '(MAX_ZOOM clamp is pxPerUnit<=64; at clientW~1042 that is vb.w~16 i.e. ~430%? check)')
await shot(page, `${SID}-zoomceil`)

dumpLog(log)
await browser.close()
