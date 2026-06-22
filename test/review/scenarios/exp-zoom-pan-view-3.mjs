import { openApp, shot, dumpLog } from '../_driver.mjs'
const SID = 'exp-zoom-pan-view3'
const { browser, page, log } = await openApp()

const zoom = () => page.evaluate(() => {
  const svg = document.querySelector('svg')
  const vb = svg.viewBox.baseVal
  const pxPerUnit = svg.clientWidth / vb.width
  const PX_PER_MM = 96/25.4
  return { actualPct:+((pxPerUnit/PX_PER_MM)*100).toFixed(1), pxPerUnit:+pxPerUnit.toFixed(3), vbw:+vb.width.toFixed(1), vbx:+vb.x.toFixed(1), clientW: svg.clientWidth }
})
const sbZoom = () => page.evaluate(() => {
  const zout = document.querySelector('[data-role="zoom-out"]')
  let n = zout?.nextElementSibling
  while (n && !/%/.test(n.textContent||'')) n = n.nextElementSibling
  return n?.textContent?.trim()
})
const cb = await (await page.$('[data-role="canvas-root"]')).boundingBox()
const midX = cb.x+cb.width/2, midY = cb.y+cb.height/2

console.log('INITIAL  actual:', JSON.stringify(await zoom()), ' statusbar shows:', await sbZoom(), ' <-- DISCREPANCY?')

// move mouse onto canvas to force a state emit (statusbar updates on mousemove)
await page.mouse.move(midX, midY); await page.waitForTimeout(120)
console.log('after mousemove statusbar:', await sbZoom(), ' actual:', (await zoom()).actualPct)

// REAL wheel (no ctrl) — does plain scroll zoom? (i.e. no plain-scroll pan)
const z0 = await zoom()
await page.mouse.move(midX, midY)
await page.mouse.wheel(0, -120) // scroll up
await page.mouse.wheel(0, -120)
await page.mouse.wheel(0, -120)
await page.waitForTimeout(150)
const z1 = await zoom()
console.log('PLAIN wheel(-120)x3 (NO ctrl):  vb.w', z0.vbw, '->', z1.vbw, ' actual', z0.actualPct, '->', z1.actualPct, ' (if changed => plain scroll zooms, no pan)')
await page.mouse.move(midX, midY); await page.waitForTimeout(100)
console.log('  statusbar now:', await sbZoom())
await shot(page, `${SID}-plainwheel`)

// zoom out via plain wheel, watch floor
await page.mouse.move(midX, midY)
for (let i=0;i<40;i++) await page.mouse.wheel(0, 120)
await page.waitForTimeout(200)
const zf = await zoom()
console.log('ZOOM-OUT FLOOR (plain wheel x40):', JSON.stringify(zf))
await page.mouse.move(midX, midY); await page.waitForTimeout(100)
console.log('  statusbar:', await sbZoom())
await shot(page, `${SID}-floor`)

// zoom in to ceiling
await page.mouse.move(midX, midY)
for (let i=0;i<90;i++) await page.mouse.wheel(0, -120)
await page.waitForTimeout(200)
const zc = await zoom()
console.log('ZOOM-IN CEILING (plain wheel x90):', JSON.stringify(zc))
await page.mouse.move(midX, midY); await page.waitForTimeout(100)
console.log('  statusbar:', await sbZoom())
await shot(page, `${SID}-ceil`)

dumpLog(log)
await browser.close()
