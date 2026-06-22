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
      frameX: get('frame-x'), frameY: get('frame-y'), frameW: get('frame-w'), frameH: get('frame-h'), frameR: get('frame-r'),
      // position inputs (PropertiesPanel) — first X/Y under Position
      shapeX: shape?.getAttribute('x'), shapeY: shape?.getAttribute('y'),
      shapeW: shape?.getAttribute('width'), shapeH: shape?.getAttribute('height'),
      shapeT: shape?.getAttribute('transform'),
      activeTag: document.activeElement?.tagName,
    }
  })
}

async function drawRect(page, x1, y1, x2, y2) {
  const box = await page.locator(CR).boundingBox()
  await page.keyboard.press('r')
  await page.mouse.move(box.x + x1, box.y + y1)
  await page.mouse.down()
  await page.mouse.move(box.x + x2, box.y + y2, { steps: 8 })
  await page.mouse.up()
}
async function selectAt(page, dx, dy) {
  const box = await page.locator(CR).boundingBox()
  await page.keyboard.press('v')
  await page.mouse.click(box.x + dx, box.y + dy)
}

// PropertiesPanel inputs (label span + sibling input)
async function fillPanel(page, label, value) {
  const input = page.locator(`xpath=//span[normalize-space(text())="${label}"]/following-sibling::input`).first()
  await input.click(); await input.fill(''); await input.type(String(value))
  return input
}

async function run() {
  const { browser, page, log } = await openApp()

  // Draw a larger rect that stays on-canvas
  await drawRect(page, 120, 120, 400, 320)
  await selectAt(page, 250, 200)
  console.log('AFTER DRAW+SELECT', JSON.stringify(await read(page)))
  await shot(page, 'exp-properties2-00-drawn')

  // ---- STALE FRAME TEST: edit Position X via PropertiesPanel, check Frame X updates ----
  console.log('\n=== STALE FRAME (Position edit vs Frame readout) ===')
  await fillPanel(page, 'X', 50)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(150)
  const r1 = await read(page)
  console.log('after Position X=50:', JSON.stringify(r1))
  console.log('  shape.x=', r1.shapeX, ' frame-x shows=', r1.frameX, ' MATCH?', Math.abs(parseFloat(r1.shapeX)-parseFloat(r1.frameX))<0.5)
  await shot(page, 'exp-properties2-01-staleframe')

  // ---- Now edit via Frame input, check it works + Position panel updates ----
  console.log('\n=== Frame W edit ===')
  const fw = page.locator('[data-testid="frame-w"]')
  await fw.click(); await fw.fill(''); await fw.type('123'); await page.keyboard.press('Enter')
  await page.waitForTimeout(150)
  const r2 = await read(page)
  console.log('after Frame W=123:', 'shape.w=', r2.shapeW, 'frame-w=', r2.frameW)

  // ---- NUDGE after blur: click canvas to ensure selection, arrow, verify ----
  console.log('\n=== Nudge after blur ===')
  await selectAt(page, 150, 150)  // click on rect area (it should cover this)
  const before = await read(page)
  console.log('before nudge selBoxes=', before.selBoxes, 'shape.x=', before.shapeX, 'active=', before.activeTag)
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  const after = await read(page)
  console.log('after 3x ArrowRight shape.x=', after.shapeX, 'moved?', after.shapeX !== before.shapeX)
  await shot(page, 'exp-properties2-02-nudge')

  // ---- Delete after blur ----
  console.log('\n=== Delete after blur ===')
  const beforeDel = await page.evaluate(() => document.querySelectorAll('g[data-layer-name] *').length)
  await page.keyboard.press('Delete')
  await page.waitForTimeout(100)
  const afterDel = await read(page)
  const kidsAfter = await page.evaluate(() => {
    const lyr = document.querySelector('g[data-layer-name]'); return lyr?.children.length
  })
  console.log('after Delete: layer kids=', kidsAfter, 'selBoxes=', afterDel.selBoxes)
  await shot(page, 'exp-properties2-03-afterdel')

  dumpLog(log)
  await browser.close()
}
run().catch((e) => { console.error('FATAL', e); process.exit(1) })
