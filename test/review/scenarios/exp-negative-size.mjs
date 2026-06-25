// vectorfeld-3yu.18 — negative/zero W/H must never reach the DOM as an invalid
// dimension. Repro: draw a rect, select it, type -50 then 0 into the ControlBar
// W field. The rect width must stay positive and the console must stay clean
// (no "A negative value is not valid"). Run headed by the orchestrator:
//   node test/review/scenarios/exp-negative-size.mjs
import { openApp, shot, dumpLog } from '../_driver.mjs'

const { browser, page, log } = await openApp()
const box = await page.locator('[data-role="canvas-root"]').boundingBox()

async function drag(x1, y1, x2, y2) {
  await page.mouse.move(box.x + x1, box.y + y1)
  await page.mouse.down()
  for (let i = 1; i <= 5; i++) {
    await page.mouse.move(box.x + x1 + (x2 - x1) * i / 5, box.y + y1 + (y2 - y1) * i / 5)
    await page.waitForTimeout(12)
  }
  await page.mouse.up()
  await page.waitForTimeout(100)
}

const results = []
function check(name, cond, detail) {
  results.push({ name, pass: !!cond })
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${detail ? ' :: ' + detail : ''}`)
}

const readW = () =>
  page.evaluate(() => document.querySelector('g[data-layer-name] rect')?.getAttribute('width') ?? null)

// 1. Draw a rect and select it.
await page.keyboard.press('r'); await page.waitForTimeout(80)
await drag(140, 140, 340, 260)
await page.keyboard.press('v'); await page.waitForTimeout(80)
await page.mouse.click(box.x + 240, box.y + 200)
await page.waitForTimeout(120)

const wBefore = await readW()
check('rect-exists-with-positive-width', wBefore != null && parseFloat(wBefore) > 0, `width=${wBefore}`)
const errBaseline = log.console.filter((c) => c.type === 'error').length

const w = page.locator('[data-testid="frame-w"]')
check('control-bar-W-visible', (await w.count()) === 1)

// 2. Type -50 into W.
await w.click(); await w.fill('-50'); await w.press('Enter')
await page.waitForTimeout(150)
const wNeg = await readW()
check('width-stays-positive-after--50', wNeg != null && parseFloat(wNeg) > 0, `width=${wNeg}`)
await shot(page, 'negsize-after-neg50')

// 3. Type 0 into W.
await w.click(); await w.fill('0'); await w.press('Enter')
await page.waitForTimeout(150)
const wZero = await readW()
check('width-stays-positive-after-0', wZero != null && parseFloat(wZero) > 0, `width=${wZero}`)
await shot(page, 'negsize-after-0')

// 4. The shape must still be on canvas (not vanished) and no console errors.
const errsNow = log.console.filter((c) => c.type === 'error')
const negErrs = errsNow.filter((e) => /negative value|not valid/i.test(e.text))
check('no-negative-value-console-error', negErrs.length === 0, `negErrs=${negErrs.length}`)
check('no-new-console-errors', errsNow.length === errBaseline, `before=${errBaseline} after=${errsNow.length}`)

dumpLog(log)
const failed = results.filter((r) => !r.pass)
console.log(`\nEXP-NEGATIVE-SIZE: ${failed.length === 0 ? 'ALL PASS' : failed.length + ' FAILED'}`)
await browser.close()
process.exit(failed.length === 0 ? 0 : 1)
