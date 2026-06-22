import { openApp, shot, dumpLog } from '../_driver.mjs'
const CR = '[data-role="canvas-root"]'

function read(page) {
  return page.evaluate(() => {
    const layers = document.querySelectorAll('g[data-layer-name]')
    let shape = null
    for (const lyr of layers) { for (const c of lyr.children) { shape = c; break } if (shape) break }
    const get = (id) => document.querySelector(`[data-testid="${id}"]`)?.value
    return {
      selBoxes: document.querySelectorAll('[data-role="selection-box"]').length,
      frameX: get('frame-x'), frameW: get('frame-w'),
      shapeX: shape?.getAttribute('x'), shapeW: shape?.getAttribute('width'),
      activeTag: document.activeElement?.tagName,
    }
  })
}
async function drawRect(page, x1, y1, x2, y2) {
  const box = await page.locator(CR).boundingBox()
  await page.keyboard.press('r')
  await page.mouse.move(box.x + x1, box.y + y1); await page.mouse.down()
  await page.mouse.move(box.x + x2, box.y + y2, { steps: 8 }); await page.mouse.up()
}
async function clickCanvas(page, dx, dy) {
  const box = await page.locator(CR).boundingBox()
  await page.keyboard.press('v'); await page.mouse.click(box.x + dx, box.y + dy)
}
async function fillFrame(page, id, v) {
  const i = page.locator(`[data-testid="${id}"]`)
  await i.click(); await i.fill(''); await i.type(String(v)); await page.keyboard.press('Enter')
}

async function run() {
  const { browser, page, log } = await openApp()
  await drawRect(page, 120, 120, 400, 320)
  await clickCanvas(page, 250, 200)
  let r = await read(page)
  console.log('drawn:', JSON.stringify(r))

  // Frame W commit, check own input refresh
  await fillFrame(page, 'frame-w', 80)
  await page.waitForTimeout(150)
  r = await read(page)
  console.log('after frame-w=80: shapeW=', r.shapeW, 'frame-w input=', r.frameW, 'STALE?', r.frameW!==r.shapeW)

  // Now click the rect again (force selection refresh) -> frame should sync
  await clickCanvas(page, 250, 200)
  await page.waitForTimeout(100)
  r = await read(page)
  console.log('after reclick: selBoxes=', r.selBoxes, 'frame-w input=', r.frameW, 'shapeW=', r.shapeW)

  // ---- FAIR NUDGE TEST: ensure selection, blur any input, nudge ----
  console.log('\n=== fair nudge ===')
  // make sure selected
  if (r.selBoxes === 0) await clickCanvas(page, 250, 200)
  await page.evaluate(() => document.activeElement.blur && document.activeElement.blur())
  let b = await read(page)
  console.log('pre-nudge selBoxes=', b.selBoxes, 'shapeX=', b.shapeX, 'active=', b.activeTag)
  for (let i=0;i<5;i++) await page.keyboard.press('ArrowRight')
  let a = await read(page)
  console.log('post-nudge shapeX=', a.shapeX, 'moved?', a.shapeX!==b.shapeX, 'delta=', parseFloat(a.shapeX)-parseFloat(b.shapeX))
  console.log('frame-x after nudge=', a.frameX, 'vs shapeX=', a.shapeX, 'STALE?', a.frameX!==undefined && Math.abs(parseFloat(a.frameX)-parseFloat(a.shapeX))>0.5)

  // ---- Delete with confirmed selection ----
  console.log('\n=== fair delete ===')
  await clickCanvas(page, 250, 200) // reselect (rect should still be near here)
  let bd = await read(page)
  console.log('pre-delete selBoxes=', bd.selBoxes)
  if (bd.selBoxes === 0) { console.log('  (selection lost, reselect by clicking rect center)'); }
  await page.keyboard.press('Delete')
  await page.waitForTimeout(100)
  const kids = await page.evaluate(() => document.querySelector('g[data-layer-name]')?.children.length)
  console.log('post-delete layer kids=', kids)

  dumpLog(log)
  await browser.close()
}
run().catch(e=>{console.error('FATAL',e);process.exit(1)})
