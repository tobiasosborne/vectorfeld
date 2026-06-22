import { openApp, shot, dumpLog } from '../_driver.mjs'

const CR = '[data-role="canvas-root"]'

function read(page) {
  return page.evaluate(() => {
    const layer = document.querySelector('g[data-layer-name]')
    const sel = document.querySelectorAll('[data-role="selection-box"]').length
    const insp = document.querySelector('[data-testid="inspector"]')?.innerText || ''
    // first non-layer shape in first layer
    const layers = document.querySelectorAll('g[data-layer-name]')
    let shape = null
    for (const lyr of layers) {
      for (const c of lyr.children) { shape = c; break }
      if (shape) break
    }
    const dump = shape ? {
      tag: shape.tagName,
      x: shape.getAttribute('x'), y: shape.getAttribute('y'),
      width: shape.getAttribute('width'), height: shape.getAttribute('height'),
      rx: shape.getAttribute('rx'), ry: shape.getAttribute('ry'),
      fill: shape.getAttribute('fill'), stroke: shape.getAttribute('stroke'),
      sw: shape.getAttribute('stroke-width'),
      dash: shape.getAttribute('stroke-dasharray'),
      transform: shape.getAttribute('transform'),
      opacity: shape.getAttribute('opacity'),
    } : null
    const active = document.activeElement
    return {
      selBoxes: sel,
      layerKids: layer?.children.length,
      activeTag: active?.tagName,
      activeVal: active?.value,
      shape: dump,
      inspectorLen: insp.length,
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

async function selectRect(page) {
  const box = await page.locator(CR).boundingBox()
  await page.keyboard.press('v')
  await page.mouse.click(box.x + 150, box.y + 150)
}

// find a PropertyInput by its label text inside inspector
async function fillProp(page, label, value) {
  const input = page.locator(`xpath=//span[normalize-space(text())="${label}"]/following-sibling::input`).first()
  await input.click()
  await input.fill('')
  await input.type(String(value))
  return input
}

async function run() {
  const { browser, page, log } = await openApp()
  const out = {}

  // --- Draw a rect ---
  await drawRect(page, 100, 100, 250, 200)
  await selectRect(page)
  await shot(page, 'exp-properties-01-selected')
  out.afterSelect = await read(page)
  console.log('afterSelect', JSON.stringify(out.afterSelect))

  // --- Frame X/Y/W/H ---
  await fillProp(page, 'X', 300)
  await page.keyboard.press('Enter')
  await fillProp(page, 'Y', 120)
  await page.keyboard.press('Enter')
  await fillProp(page, 'W', 180)
  await page.keyboard.press('Enter')
  await fillProp(page, 'H', 90)
  await page.keyboard.press('Enter')
  await shot(page, 'exp-properties-02-frame')
  out.afterFrame = await read(page)
  console.log('afterFrame', JSON.stringify(out.afterFrame.shape))

  // === FOCUS-STEALING TEST ===
  // Edit a numeric input, do NOT blur, then try Ctrl+C / Delete / arrow nudge.
  console.log('\n=== FOCUS STEAL: input still focused ===')
  const wInput = await fillProp(page, 'W', 200)  // typed but NOT committed / blurred
  let stateBefore = await read(page)
  console.log('focused input?', stateBefore.activeTag, 'val', stateBefore.activeVal)

  // Arrow nudge while focused
  const xBefore = out.afterFrame.shape.x
  await page.keyboard.press('ArrowRight')
  let afterArrow = await read(page)
  out.arrowWhileFocused = {
    activeTag: afterArrow.activeTag,
    activeVal: afterArrow.activeVal,
    shapeX: afterArrow.shape.x,
    movedShape: afterArrow.shape.x !== stateBefore.shape.x,
  }
  console.log('arrowWhileFocused', JSON.stringify(out.arrowWhileFocused))
  await shot(page, 'exp-properties-03-arrow-while-focused')

  // Delete while focused
  await page.keyboard.press('Delete')
  let afterDel = await read(page)
  out.deleteWhileFocused = {
    layerKids: afterDel.layerKids,
    shapeStillThere: !!afterDel.shape,
    activeTag: afterDel.activeTag,
    activeVal: afterDel.activeVal,
  }
  console.log('deleteWhileFocused', JSON.stringify(out.deleteWhileFocused))

  // Ctrl+C / Ctrl+V while focused (does paste happen?)
  await page.keyboard.press('Control+c')
  await page.keyboard.press('Control+v')
  let afterCopy = await read(page)
  out.copyPasteWhileFocused = {
    layerKids: afterCopy.layerKids,
    activeTag: afterCopy.activeTag,
  }
  console.log('copyPasteWhileFocused', JSON.stringify(out.copyPasteWhileFocused))

  // Now blur (Enter) and retry nudge to confirm it works after blur
  await page.keyboard.press('Enter')
  let afterBlur = await read(page)
  await selectRect(page) // re-ensure selection
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  let afterBlurArrow = await read(page)
  out.arrowAfterBlur = {
    movedAfterBlur: afterBlurArrow.shape && afterBlur.shape && afterBlurArrow.shape.x !== afterBlur.shape.x,
    xBlur: afterBlur.shape?.x, xAfter: afterBlurArrow.shape?.x,
  }
  console.log('arrowAfterBlur', JSON.stringify(out.arrowAfterBlur))

  // === FILL TRANSITIONS ===
  console.log('\n=== FILL transitions ===')
  await selectRect(page)
  await selectRect(page)
  const fillType = page.locator('[data-testid="fill-type"]')
  // ensure something selected
  let r0 = await read(page)
  console.log('before fill, shape:', JSON.stringify(r0.shape))
  if (!r0.shape) { console.log('NO SHAPE - drawing again'); await drawRect(page,100,300,250,400); await selectRect(page) }

  for (const ft of ['solid', 'linear', 'radial', 'none', 'solid']) {
    try {
      await fillType.selectOption(ft)
      await page.waitForTimeout(120)
      const r = await read(page)
      out['fill_' + ft] = r.shape?.fill
      console.log(`fill -> ${ft}:`, r.shape?.fill)
      await shot(page, `exp-properties-fill-${ft}`)
    } catch (e) {
      out['fill_' + ft + '_err'] = e.message
      console.log(`fill ${ft} ERR`, e.message)
    }
  }

  // === ROUNDED CORNERS ===
  console.log('\n=== Rounded corners ===')
  await fillProp(page, 'Rx', 20); await page.keyboard.press('Enter')
  await fillProp(page, 'Ry', 15); await page.keyboard.press('Enter')
  let rc = await read(page)
  out.corners = { rx: rc.shape?.rx, ry: rc.shape?.ry }
  console.log('corners', JSON.stringify(out.corners))
  await shot(page, 'exp-properties-corners')

  // === NEGATIVE / ZERO / HUGE W/H ===
  console.log('\n=== Edge W/H ===')
  await fillProp(page, 'W', -50); await page.keyboard.press('Enter')
  let neg = await read(page)
  out.negW = neg.shape?.width
  console.log('negW ->', neg.shape?.width)
  await shot(page, 'exp-properties-negW')

  await fillProp(page, 'W', 0); await page.keyboard.press('Enter')
  let zero = await read(page)
  out.zeroW = zero.shape?.width
  console.log('zeroW ->', zero.shape?.width)

  await fillProp(page, 'W', 99999); await page.keyboard.press('Enter')
  let huge = await read(page)
  out.hugeW = huge.shape?.width
  console.log('hugeW ->', huge.shape?.width)
  await shot(page, 'exp-properties-hugeW')

  // restore sane width
  await fillProp(page, 'W', 150); await page.keyboard.press('Enter')

  // non-numeric junk
  await fillProp(page, 'H', 'abc'); await page.keyboard.press('Enter')
  let junk = await read(page)
  out.junkH = junk.shape?.height
  console.log('junkH ->', junk.shape?.height)

  // === ROTATION via R field ===
  console.log('\n=== Rotation ===')
  await fillProp(page, 'Rot', 30); await page.keyboard.press('Enter')
  let rot = await read(page)
  out.rotation = rot.shape?.transform
  console.log('rotation ->', rot.shape?.transform)
  await shot(page, 'exp-properties-rot')

  // === SKEW ===
  console.log('\n=== Skew ===')
  await fillProp(page, 'SkX', 15); await page.keyboard.press('Enter')
  await fillProp(page, 'SkY', 10); await page.keyboard.press('Enter')
  let sk = await read(page)
  out.skew = sk.shape?.transform
  console.log('skew ->', sk.shape?.transform)
  await shot(page, 'exp-properties-skew')

  // === STROKE width + dash ===
  console.log('\n=== Stroke ===')
  await fillProp(page, 'SW', 4); await page.keyboard.press('Enter')
  const dashSel = page.locator('xpath=//span[normalize-space(text())="Dash"]/following-sibling::select').first()
  await dashSel.selectOption('4 2')
  await page.waitForTimeout(100)
  let str = await read(page)
  out.stroke = { sw: str.shape?.sw, dash: str.shape?.dash }
  console.log('stroke', JSON.stringify(out.stroke))
  await shot(page, 'exp-properties-stroke')

  console.log('\n=== FINAL OUT ===')
  console.log(JSON.stringify(out, null, 2))
  dumpLog(log)
  await browser.close()
}

run().catch((e) => { console.error('FATAL', e); process.exit(1) })
