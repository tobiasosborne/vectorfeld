import { openApp, shot, dumpLog } from '../_driver.mjs'
const SID = 'exp-tool-switch'
function st(page) {
  return page.evaluate(() => ({
    layerKids: document.querySelector('g[data-layer-name]')?.children.length ?? null,
    previews: document.querySelectorAll('[data-role="preview"]').length,
    selBoxes: document.querySelectorAll('[data-role="selection-box"]').length,
    activeTool: document.querySelector('[data-tool-slot][data-active="true"]')?.getAttribute('data-tool-slot') || null,
    inspector: (document.querySelector('[data-testid="inspector"]')?.innerText || '').replace(/\s+/g, ' ').slice(0, 70),
  }))
}
const out = (l, s) => console.log(`[${l}]`, JSON.stringify(s))

const { browser, page, log } = await openApp()
const cb = await page.locator('[data-role="canvas-root"]').boundingBox()
const cx = f => cb.x + f, cy = f => cb.y + f

// Make a rect, it auto-selects
await page.keyboard.press('r')
await page.mouse.move(cx(200), cy(200)); await page.mouse.down()
await page.mouse.move(cx(320), cy(300), { steps: 4 }); await page.mouse.up()
out('rect-made(selected)', await st(page))

// Switch to Text tool via keyboard. Does inspector still show RECT selected?
await page.keyboard.press('t')
out('after-switch-to-text', await st(page))
await shot(page, `${SID}-inspector-after-text-switch`)

// Switch to pen
await page.keyboard.press('p')
out('after-switch-to-pen', await st(page))

// Switch to rect tool
await page.keyboard.press('r')
out('after-switch-to-rect', await st(page))
await shot(page, `${SID}-inspector-after-rect-switch`)

dumpLog(log)
await browser.close()
