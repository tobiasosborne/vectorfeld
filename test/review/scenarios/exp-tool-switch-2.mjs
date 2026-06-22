import { openApp, shot, dumpLog } from '../_driver.mjs'

const SID = 'exp-tool-switch'

function st(page) {
  return page.evaluate(() => {
    const lyr = document.querySelector('g[data-layer-name]')
    const prevs = Array.from(document.querySelectorAll('[data-role="preview"]')).map(e => e.tagName)
    return {
      layerKids: lyr ? lyr.children.length : null,
      previews: prevs.length,
      previewTags: prevs,
      selBoxes: document.querySelectorAll('[data-role="selection-box"]').length,
      activeTool: document.querySelector('[data-tool-slot][data-active="true"]')?.getAttribute('data-tool-slot') || null,
      inspector: (document.querySelector('[data-testid="inspector"]')?.innerText || '').replace(/\s+/g, ' ').slice(0, 90),
    }
  })
}
const out = (l, s) => console.log(`[${l}]`, JSON.stringify(s))

// ===== TEST B isolated: Escape on mid-rect-drag =====
{
  const { browser, page } = await openApp()
  const cb = await page.locator('[data-role="canvas-root"]').boundingBox()
  const cx = f => cb.x + f, cy = f => cb.y + f
  console.log('=== B-ISOLATED: Escape during rect drag ===')
  await page.keyboard.press('r')
  await page.mouse.move(cx(200), cy(200)); await page.mouse.down()
  await page.mouse.move(cx(320), cy(300), { steps: 5 })
  out('B.mid-drag', await st(page))
  await page.keyboard.press('Escape')
  out('B.after-Escape(mouse-down)', await st(page))
  await shot(page, `${SID}-B-escape-during-drag`)
  await page.mouse.up()
  out('B.after-mouseup', await st(page))
  await shot(page, `${SID}-B-escape-after-up`)
  await browser.close()
}

// ===== TEST: stale preview after text commits via tool switch =====
{
  const { browser, page } = await openApp()
  const cb = await page.locator('[data-role="canvas-root"]').boundingBox()
  const cx = f => cb.x + f, cy = f => cb.y + f
  console.log('\n=== TEXT-COMMIT-ON-SWITCH: does mouse-click tool switch leave previews? ===')
  await page.keyboard.press('t')
  await page.mouse.click(cx(250), cy(250))
  await page.keyboard.type('HELLO')
  out('mid-type', await st(page))
  await shot(page, `${SID}-text-mid`)
  // click select slot with mouse (this is NOT keyboard-captured)
  await page.locator('[data-tool-slot="select"]').click()
  out('after-click-select-slot', await st(page))
  await shot(page, `${SID}-text-after-switch`)
  await browser.close()
}

// ===== TEST: text shortcut keys typed instead of switching =====
{
  const { browser, page } = await openApp()
  const cb = await page.locator('[data-role="canvas-root"]').boundingBox()
  const cx = f => cb.x + f, cy = f => cb.y + f
  console.log('\n=== TEXT-SHORTCUT-SWALLOW: press r/v/p during text edit ===')
  await page.keyboard.press('t')
  await page.mouse.click(cx(250), cy(250))
  await page.keyboard.type('AB')
  await page.keyboard.press('r')
  await page.keyboard.press('v')
  out('after-AB-then-r-v', await st(page))
  await page.keyboard.press('Escape')
  out('after-escape', await st(page))
  await shot(page, `${SID}-text-swallow`)
  await browser.close()
}

// ===== TEST F/G isolated: pen mid-path tool switch & Escape =====
{
  const { browser, page } = await openApp()
  const cb = await page.locator('[data-role="canvas-root"]').boundingBox()
  const cx = f => cb.x + f, cy = f => cb.y + f
  console.log('\n=== PEN-SWITCH: mid-pen (3 anchors) switch to V via keyboard ===')
  await page.keyboard.press('p')
  await page.mouse.click(cx(150), cy(400))
  await page.mouse.click(cx(250), cy(450))
  await page.mouse.click(cx(350), cy(400))
  out('mid-pen-3', await st(page))
  await shot(page, `${SID}-pen-mid`)
  await page.keyboard.press('v')
  out('after-V', await st(page))
  await shot(page, `${SID}-pen-after-V`)
  await browser.close()
}

{
  const { browser, page } = await openApp()
  const cb = await page.locator('[data-role="canvas-root"]').boundingBox()
  const cx = f => cb.x + f, cy = f => cb.y + f
  console.log('\n=== PEN-ESCAPE: mid-pen Escape ===')
  await page.keyboard.press('p')
  await page.mouse.click(cx(150), cy(400))
  await page.mouse.click(cx(250), cy(450))
  await page.mouse.click(cx(350), cy(400))
  out('mid-pen-3', await st(page))
  await page.keyboard.press('Escape')
  out('after-Escape', await st(page))
  await shot(page, `${SID}-pen-escape`)
  await browser.close()
}

console.log('\nDONE')
