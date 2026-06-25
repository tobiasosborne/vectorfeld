// Regression scenario for vectorfeld-3yu.20:
// Dragging a guide off the H-ruler must create a HORIZONTAL guide whose
// position equals the drop's document Y (previously it used the along-ruler X,
// landing the guide on the orthogonal axis). Mirror-check the V-ruler too.
//
// Run headed via the review driver. PASS criteria printed at the end.
import { openApp, shot, dumpLog } from '../_driver.mjs'

const { browser, page, log } = await openApp()

// Map a screen pixel to document coords using the live SVG transform — the
// same math the app uses (screenToDoc), so the expected value is independent
// of zoom/layout.
async function screenToDoc(sx, sy) {
  return await page.evaluate(({ sx, sy }) => {
    const svg =
      document.querySelector('[data-role="canvas-root"] svg') ||
      document.querySelector('svg')
    const pt = svg.createSVGPoint()
    pt.x = sx; pt.y = sy
    const ctm = svg.getScreenCTM()
    const p = pt.matrixTransform(ctm.inverse())
    return { x: p.x, y: p.y }
  }, { sx, sy })
}

async function guides() {
  return await page.evaluate(() => {
    const g = document.querySelector('[data-role="user-guides-overlay"]')
    if (!g) return []
    return Array.from(g.querySelectorAll('line')).map((l) => ({
      x1: parseFloat(l.getAttribute('x1')),
      y1: parseFloat(l.getAttribute('y1')),
      x2: parseFloat(l.getAttribute('x2')),
      y2: parseFloat(l.getAttribute('y2')),
      // horizontal guide => y1 === y2 (a horizontal line at y=position)
      axis: l.getAttribute('y1') === l.getAttribute('y2') ? 'h' : 'v',
    }))
  })
}

await shot(page, 'ruler-guides-00-before')

// ---- H-RULER: drag down off the ruler, release at a point where docX != docY ----
const hr = await page.locator('[data-role="hruler"]').boundingBox()
// Start mid-ruler; release well below it, and shift X so docX != docY.
const hStartX = hr.x + hr.width * 0.6
const hStartY = hr.y + hr.height / 2
const hDropX = hr.x + hr.width * 0.35   // different column than start
const hDropY = hr.y + hr.height + 220   // well into the canvas

const hDoc = await screenToDoc(hDropX, hDropY)
console.log('H drop screen=', { hDropX, hDropY }, 'doc=', hDoc)

await page.mouse.move(hStartX, hStartY)
await page.mouse.down()
await page.mouse.move(hDropX, hDropY, { steps: 8 })
await page.mouse.up()
await page.waitForTimeout(150)
await shot(page, 'ruler-guides-01-hguide')

// ---- V-RULER: drag right off the ruler, release at docY != docX ----
const vr = await page.locator('[data-role="vruler"]').boundingBox()
const vStartX = vr.x + vr.width / 2
const vStartY = vr.y + vr.height * 0.6
const vDropX = vr.x + vr.width + 260
const vDropY = vr.y + vr.height * 0.3

const vDoc = await screenToDoc(vDropX, vDropY)
console.log('V drop screen=', { vDropX, vDropY }, 'doc=', vDoc)

await page.mouse.move(vStartX, vStartY)
await page.mouse.down()
await page.mouse.move(vDropX, vDropY, { steps: 8 })
await page.mouse.up()
await page.waitForTimeout(150)
await shot(page, 'ruler-guides-02-vguide')

const gs = await guides()
console.log('GUIDES:', JSON.stringify(gs))

const hGuide = gs.find((g) => g.axis === 'h')
const vGuide = gs.find((g) => g.axis === 'v')

// H guide position is its y; must ≈ the drop's document Y (NOT its X).
const hOk = hGuide && Math.abs(hGuide.y1 - hDoc.y) < 0.5
const hNotSwapped = hGuide && Math.abs(hGuide.y1 - hDoc.x) > 0.5 // would-be bug value
// V guide position is its x; must ≈ the drop's document X (NOT its Y).
const vOk = vGuide && Math.abs(vGuide.x1 - vDoc.x) < 0.5
const vNotSwapped = vGuide && Math.abs(vGuide.x1 - vDoc.y) > 0.5

console.log(`ASSERT H guide y≈dropY: ${hOk ? 'PASS' : 'FAIL'} (y=${hGuide?.y1}, dropY=${hDoc.y?.toFixed(2)}, dropX=${hDoc.x?.toFixed(2)})`)
console.log(`ASSERT H not axis-swapped: ${hNotSwapped ? 'PASS' : 'FAIL'}`)
console.log(`ASSERT V guide x≈dropX: ${vOk ? 'PASS' : 'FAIL'} (x=${vGuide?.x1}, dropX=${vDoc.x?.toFixed(2)}, dropY=${vDoc.y?.toFixed(2)})`)
console.log(`ASSERT V not axis-swapped: ${vNotSwapped ? 'PASS' : 'FAIL'}`)
console.log(`RESULT: ${hOk && hNotSwapped && vOk && vNotSwapped ? 'PASS' : 'FAIL'}`)

dumpLog(log)
await browser.close()
console.log('RULER-GUIDES DONE')
