import { openApp, shot, dumpLog } from '../_driver.mjs'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

function ctxState(page) {
  return page.evaluate(() => {
    // The context menu is the LAST [data-role="panel"] (fixed position, zIndex 100)
    const panels = Array.from(document.querySelectorAll('[data-role="panel"]'))
    // find the one with fixed position
    const menu = panels.find(p => getComputedStyle(p).position === 'fixed')
    return {
      panelCount: panels.length,
      menuFound: !!menu,
      items: menu ? Array.from(menu.querySelectorAll('button')).map(b => ({ label: b.innerText, disabled: b.disabled })) : null,
      inspector: document.querySelector('[data-testid="inspector"]')?.innerText?.split('\n')[0],
      selBoxes: document.querySelectorAll('[data-role="selection-box"]').length,
    }
  })
}

const { browser, page, log } = await openApp()
const b = await page.locator('[data-role="canvas-root"]').boundingBox()

async function drawRect(cx, cy, w, h) {
  await page.mouse.move(b.x + cx, b.y + cy); await page.mouse.down()
  await page.mouse.move(b.x + cx + w, b.y + cy + h, { steps: 8 }); await page.mouse.up()
}

// === DRILL 1: Context menu — does right-click on a selected shape keep selection? ===
console.log('=== DRILL 1: context menu selection ===')
await page.keyboard.press('r'); await drawRect(200, 200, 120, 90)
await page.keyboard.press('v')
await page.mouse.click(b.x + 230, b.y + 230) // select
await sleep(150)
console.log('after left-click select:', JSON.stringify(await ctxState(page)))
// right-click ON the selected shape
await page.mouse.click(b.x + 230, b.y + 230, { button: 'right' })
await sleep(200)
console.log('after right-click ON selected shape:', JSON.stringify(await ctxState(page)))
await shot(page, 'exp-misc-tools-drill-ctx-on-selected')
await page.keyboard.press('Escape'); await sleep(100)

// right-click on shape WITHOUT prior selection
await page.mouse.click(b.x + 600, b.y + 600); await sleep(100) // deselect
await page.mouse.click(b.x + 230, b.y + 230, { button: 'right' })
await sleep(200)
console.log('after right-click WITHOUT prior selection:', JSON.stringify(await ctxState(page)))
await shot(page, 'exp-misc-tools-drill-ctx-no-presel')
await page.keyboard.press('Escape'); await sleep(100)

// Does context menu Delete work when we DO have selection?
await page.mouse.click(b.x + 230, b.y + 230); await sleep(150) // select first
const before = await page.evaluate(() => document.querySelector('g[data-layer-name]')?.children.length)
await page.mouse.click(b.x + 230, b.y + 230, { button: 'right' }); await sleep(150)
await page.evaluate(() => {
  const panels = Array.from(document.querySelectorAll('[data-role="panel"]'))
  const menu = panels.find(p => getComputedStyle(p).position === 'fixed')
  const del = Array.from(menu.querySelectorAll('button')).find(b => b.innerText === 'Delete')
  console.log('delete disabled?', del?.disabled)
  if (del && !del.disabled) del.click()
})
await sleep(150)
const after = await page.evaluate(() => document.querySelector('g[data-layer-name]')?.children.length)
console.log(`context Delete: kids ${before} -> ${after}`)

// === DRILL 2: Eraser drag undo ===
console.log('=== DRILL 2: eraser drag undo ===')
await page.keyboard.press('r'); await drawRect(150, 200, 80, 60)
await page.keyboard.press('r'); await drawRect(280, 200, 80, 60)
await page.keyboard.press('r'); await drawRect(410, 200, 80, 60)
await sleep(150)
const k0 = await page.evaluate(() => document.querySelector('g[data-layer-name]')?.children.length)
console.log('before drag erase kids:', k0)
await page.locator('[data-tool-slot="erase"]').click()
await page.mouse.move(b.x + 150, b.y + 230); await page.mouse.down()
await page.mouse.move(b.x + 500, b.y + 230, { steps: 25 }); await page.mouse.up()
await sleep(150)
const k1 = await page.evaluate(() => document.querySelector('g[data-layer-name]')?.children.length)
console.log('after drag erase kids:', k1)
log.pageerrors.length = 0 // reset to isolate undo errors
await page.keyboard.press('Control+z')
await sleep(250)
const k2 = await page.evaluate(() => document.querySelector('g[data-layer-name]')?.children.length)
console.log('after undo drag erase kids:', k2, '(expected back to', k0, ')')
console.log('pageerrors during undo:', JSON.stringify(log.pageerrors))
await shot(page, 'exp-misc-tools-drill-eraser-undo')

// redo
await page.keyboard.press('Control+y')
await sleep(200)
const k3 = await page.evaluate(() => document.querySelector('g[data-layer-name]')?.children.length)
console.log('after redo kids:', k3)

dumpLog(log)
await browser.close()
