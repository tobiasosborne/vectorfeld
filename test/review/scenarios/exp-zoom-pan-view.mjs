import { openApp, shot, dumpLog } from '../_driver.mjs'

const SID = 'exp-zoom-pan-view'
const { browser, page, log } = await openApp()

const snap = () => page.evaluate(() => {
  const svg = document.querySelector('[data-role="canvas-root"] svg') || document.querySelector('svg')
  const vb = svg?.viewBox?.baseVal
  const sb = document.querySelector('[data-role="zoom-in"]')?.parentElement?.parentElement
  // grab the percent text near zoom buttons
  const zoomTxt = Array.from(document.querySelectorAll('span')).map(s=>s.textContent).find(t=>/^\d+%$/.test(t||''))
  const allText = document.body.innerText
  const xMatch = allText.match(/X:\s*([-\d.]+)\s*mm/)
  const yMatch = allText.match(/Y:\s*([-\d.]+)\s*mm/)
  return {
    vb: vb ? { x: +vb.x.toFixed(2), y: +vb.y.toFixed(2), w: +vb.width.toFixed(2), h: +vb.height.toFixed(2) } : null,
    clientW: svg?.clientWidth, clientH: svg?.clientHeight,
    zoomTxt,
    statusX: xMatch?.[1], statusY: yMatch?.[1],
    selBoxes: document.querySelectorAll('[data-role="selection-box"]').length,
  }
})

const canvasBox = async () => {
  const el = await page.$('[data-role="canvas-root"]')
  return await el.boundingBox()
}

console.log('=== STEP 0: initial state ===')
console.log(JSON.stringify(await snap()))
await shot(page, `${SID}-00-initial`)

// ---- STEP 1: draw a rect at a known doc coordinate so we can hit-test it later ----
console.log('\n=== STEP 1: draw a rect ===')
const cb = await canvasBox()
// Draw a rect roughly centered
await page.keyboard.press('r')
const x0 = cb.x + cb.width*0.4, y0 = cb.y + cb.height*0.4
const x1 = cb.x + cb.width*0.6, y1 = cb.y + cb.height*0.6
await page.mouse.move(x0, y0)
await page.mouse.down()
await page.mouse.move(x1, y1, { steps: 8 })
await page.mouse.up()
await page.waitForTimeout(150)
// record the rect's doc-space bbox
const rectInfo = await page.evaluate(() => {
  const r = document.querySelector('g[data-layer-name] rect, svg rect[x]')
  if (!r) return null
  const b = r.getBBox ? r.getBBox() : null
  return { x:+r.getAttribute('x'), y:+r.getAttribute('y'), w:+r.getAttribute('width'), h:+r.getAttribute('height') }
})
console.log('rect doc bbox:', JSON.stringify(rectInfo))
await shot(page, `${SID}-01-rect-drawn`)

// helper: doc mm -> screen px using the live SVG CTM
const docToScreen = (dx, dy) => page.evaluate(([dx,dy]) => {
  const svg = document.querySelector('svg')
  const pt = svg.createSVGPoint(); pt.x = dx; pt.y = dy
  const p = pt.matrixTransform(svg.getScreenCTM())
  return { x: p.x, y: p.y }
}, [dx, dy])

// ---- STEP 2: status-bar mm readout accuracy ----
console.log('\n=== STEP 2: status-bar mm accuracy ===')
// Move mouse to a screen point that corresponds to doc (50,50) if rect exists; otherwise center of rect
const cx = rectInfo ? rectInfo.x + rectInfo.w/2 : 105
const cy = rectInfo ? rectInfo.y + rectInfo.h/2 : 148
const sp = await docToScreen(cx, cy)
await page.mouse.move(sp.x, sp.y)
await page.waitForTimeout(120)
const s2 = await snap()
console.log(`moved to doc(${cx.toFixed(1)},${cy.toFixed(1)}) -> screen(${sp.x.toFixed(0)},${sp.y.toFixed(0)}); status reads X=${s2.statusX} Y=${s2.statusY}`)
console.log('  expected ~', cx.toFixed(1), cy.toFixed(1))

// ---- STEP 3: dead zoom buttons? ----
console.log('\n=== STEP 3: status-bar +/- zoom buttons ===')
const before = await snap()
await page.click('[data-role="zoom-in"]')
await page.click('[data-role="zoom-in"]')
await page.waitForTimeout(120)
const afterIn = await snap()
console.log('zoom-in x2:', before.zoomTxt, '->', afterIn.zoomTxt, '| vb.w', before.vb?.w, '->', afterIn.vb?.w)
await page.click('[data-role="zoom-out"]')
await page.waitForTimeout(120)
const afterOut = await snap()
console.log('zoom-out x1:', afterIn.zoomTxt, '->', afterOut.zoomTxt, '| vb.w', afterIn.vb?.w, '->', afterOut.vb?.w)
await shot(page, `${SID}-03-after-zoom-buttons`)

// ---- STEP 4: Ctrl+wheel zoom + cursor anchoring ----
console.log('\n=== STEP 4: Ctrl+wheel zoom (anchor stability) ===')
// position cursor over rect center, record doc point under cursor, zoom in, re-measure
const anchorScreen = await docToScreen(cx, cy)
await page.mouse.move(anchorScreen.x, anchorScreen.y)
// what doc point is under the cursor before?
const docUnderBefore = await page.evaluate(([sx,sy]) => {
  const svg = document.querySelector('svg')
  const pt = svg.createSVGPoint(); pt.x=sx; pt.y=sy
  const p = pt.matrixTransform(svg.getScreenCTM().inverse())
  return { x:+p.x.toFixed(2), y:+p.y.toFixed(2) }
}, [anchorScreen.x, anchorScreen.y])
for (let i=0;i<5;i++){ await page.mouse.wheel(0,-100); /* ctrl */ }
// need ctrl held — playwright wheel doesn't carry ctrl; dispatch manually
const wheelZoom = (deltaY, n=1) => page.evaluate(([deltaY,n,sx,sy]) => {
  const c = document.querySelector('[data-role="canvas-root"]')
  for (let i=0;i<n;i++){
    c.dispatchEvent(new WheelEvent('wheel',{deltaY,clientX:sx,clientY:sy,ctrlKey:true,bubbles:true,cancelable:true}))
  }
}, [deltaY,n,anchorScreen.x,anchorScreen.y])
await wheelZoom(-100, 5) // zoom in 5 steps
await page.waitForTimeout(150)
const z4 = await snap()
const docUnderAfter = await page.evaluate(([sx,sy]) => {
  const svg = document.querySelector('svg')
  const pt = svg.createSVGPoint(); pt.x=sx; pt.y=sy
  const p = pt.matrixTransform(svg.getScreenCTM().inverse())
  return { x:+p.x.toFixed(2), y:+p.y.toFixed(2) }
}, [anchorScreen.x, anchorScreen.y])
console.log('zoom after ctrl-wheel-in x5:', z4.zoomTxt, 'vb', JSON.stringify(z4.vb))
console.log('doc-under-cursor before:', JSON.stringify(docUnderBefore), 'after:', JSON.stringify(docUnderAfter), '(should match if anchoring works)')
await shot(page, `${SID}-04-zoomed-in`)

// ---- STEP 5: hit-test at high zoom ----
console.log('\n=== STEP 5: hit-test rect at high zoom ===')
// click on rect center at current zoom
const hitScreen = await docToScreen(cx, cy)
await page.keyboard.press('v') // select tool
await page.mouse.click(hitScreen.x, hitScreen.y)
await page.waitForTimeout(150)
const z5 = await snap()
console.log('clicked rect center at high zoom; selBoxes =', z5.selBoxes, '(expect 1)')
console.log('inspector says:', await page.evaluate(()=>document.querySelector('[data-testid="inspector"]')?.innerText?.slice(0,60)))
await shot(page, `${SID}-05-hittest-highzoom`)

// ---- STEP 6: hit-test near canvas edge after pan ----
console.log('\n=== STEP 6: pan via space-drag, then hit-test ===')
await page.keyboard.down('Space')
const cb2 = await canvasBox()
await page.mouse.move(cb2.x+cb2.width*0.7, cb2.y+cb2.height*0.5)
await page.mouse.down()
await page.mouse.move(cb2.x+cb2.width*0.3, cb2.y+cb2.height*0.3, { steps: 10 })
await page.mouse.up()
await page.keyboard.up('Space')
await page.waitForTimeout(150)
const z6 = await snap()
console.log('after pan vb:', JSON.stringify(z6.vb))
// hit-test rect again at its (now moved) screen position
const hit6 = await docToScreen(cx, cy)
await page.evaluate(()=>{ document.querySelectorAll('[data-role="selection-box"]') }) // noop
await page.mouse.click(0,0) // deselect
await page.waitForTimeout(80)
await page.mouse.click(hit6.x, hit6.y)
await page.waitForTimeout(150)
const z6b = await snap()
console.log('rect center now at screen', hit6.x.toFixed(0), hit6.y.toFixed(0), '-> selBoxes', z6b.selBoxes, '(expect 1 if hit-test correct after pan)')
await shot(page, `${SID}-06-after-pan-hittest`)

// ---- STEP 7: zoom out far + check status mm at far corner / negatives ----
console.log('\n=== STEP 7: zoom out far, edge mm readout ===')
await wheelZoom(100, 12) // zoom out a lot
await page.waitForTimeout(150)
const z7 = await snap()
console.log('after zoom out: zoomTxt', z7.zoomTxt, 'vb', JSON.stringify(z7.vb))
// move to top-left corner of canvas viewport
const cb3 = await canvasBox()
await page.mouse.move(cb3.x+2, cb3.y+2)
await page.waitForTimeout(120)
const z7corner = await snap()
console.log('cursor at canvas top-left -> status X', z7corner.statusX, 'Y', z7corner.statusY, '(can it show negatives?)')
await shot(page, `${SID}-07-zoomed-out`)

// ---- STEP 7b: plain wheel → pan (no zoom) ----
console.log('\n=== STEP 7b: plain wheel scrolls (pans), does NOT zoom ===')
const beforePan = await snap()
// Use a REAL wheel (Playwright mouse.wheel) — the canvas wheel handler is a
// native {passive:false} listener that a synthetic dispatchEvent doesn't
// reliably reach. Position the cursor over the canvas, then wheel with no modifier.
await page.mouse.move(cb3.x + cb3.width * 0.5, cb3.y + cb3.height * 0.5)
await page.mouse.wheel(0, 200)
await page.waitForTimeout(120)
const afterPan = await snap()
console.log('before pan vb:', JSON.stringify(beforePan.vb))
console.log('after  pan vb:', JSON.stringify(afterPan.vb))
const panTranslated = afterPan.vb && beforePan.vb && afterPan.vb.y !== beforePan.vb.y
const panNoZoom = afterPan.vb && beforePan.vb &&
  Math.abs(afterPan.vb.w - beforePan.vb.w) < 0.01 &&
  Math.abs(afterPan.vb.h - beforePan.vb.h) < 0.01
console.log('viewBox.y changed (pan occurred):', panTranslated, '— width/height unchanged (no zoom):', panNoZoom)
await shot(page, `${SID}-07b-plain-wheel-pan`)

// ---- STEP 8: View menu contents ----
console.log('\n=== STEP 8: View menu ===')
await page.getByRole('button',{name:'View',exact:true}).click()
await page.waitForTimeout(120)
const viewItems = await page.evaluate(()=>{
  const items = Array.from(document.querySelectorAll('[role="menuitem"], button')).map(b=>b.textContent?.trim()).filter(Boolean)
  return items
})
console.log('View menu visible items (filtered):', JSON.stringify(viewItems.filter(t=>/grid|outline|guide|zoom|fit|100|actual|reset/i.test(t))))
await shot(page, `${SID}-08-view-menu`)
await page.keyboard.press('Escape')

// ---- STEP 9: is there ANY way to reset zoom to 100%? ----
console.log('\n=== STEP 9: reset-to-100 affordance check ===')
const has100 = await page.evaluate(()=>{
  const txt = document.body.innerText
  return /fit|actual size|100%\s*reset|zoom to fit/i.test(txt)
})
console.log('Any fit/actual-size/reset affordance found in DOM text:', has100)

dumpLog(log)
await browser.close()
