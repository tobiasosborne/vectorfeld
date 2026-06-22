import { openApp, shot, dumpLog } from '../_driver.mjs'
const { browser, page, log } = await openApp()
const svg = await page.evaluate(() => { const s = document.querySelector('[data-testid="canvas-container"] svg'); const r = s.getBoundingClientRect(); return { x: r.x, y: r.y } })
const OX = svg.x, OY = svg.y
async function tool(l) { await page.keyboard.press(l); await page.waitForTimeout(60) }
async function drag(x1, y1, x2, y2) {
  await page.mouse.move(OX + x1, OY + y1); await page.mouse.down()
  for (let i = 1; i <= 5; i++) { await page.mouse.move(OX + x1 + (x2 - x1) * i / 5, OY + y1 + (y2 - y1) * i / 5); await page.waitForTimeout(8) }
  await page.mouse.up(); await page.waitForTimeout(70)
}
async function st() { return await page.evaluate(() => ({ layerKids: document.querySelector('g[data-layer-name]')?.children.length ?? -1, selBoxes: document.querySelectorAll('[data-role="selection-box"]').length, insp: (document.querySelector('[data-testid="inspector"]')?.innerText || '').replace(/\s+/g, ' ').slice(0, 60) })) }
function errs() { return [...log.console.filter(c => c.type === 'error').map(c => c.text), ...log.pageerrors] }

// Build phantom: draw 3, select-all, undo all to empty -> stale selection
for (let i = 0; i < 3; i++) { await tool('r'); await drag(40 + i * 90, 60, 110 + i * 90, 130) }
await tool('v'); await page.keyboard.press('Control+a'); await page.waitForTimeout(50)
console.log('3 selected:', JSON.stringify(await st()))
for (let i = 0; i < 6; i++) { await page.keyboard.press('Control+z'); await page.waitForTimeout(40) }
const phantom = await st()
console.log('UNDO-TO-EMPTY phantom:', JSON.stringify(phantom))
console.log('  stale selection bug present?', phantom.layerKids === 0 && (phantom.selBoxes > 0 || /SELECTED/.test(phantom.insp)))
await shot(page, 'exp-chaos-phantom-01')

// Act on phantom: arrow-move, delete, copy/paste
console.log('--- act on phantom ---')
await page.keyboard.press('ArrowRight'); await page.waitForTimeout(50)
console.log('after ArrowRight:', JSON.stringify(await st()), 'errsNow=', errs().length)
await page.keyboard.press('Delete'); await page.waitForTimeout(50)
console.log('after Delete:', JSON.stringify(await st()), 'errsNow=', errs().length)
await page.keyboard.press('Control+c'); await page.waitForTimeout(40)
await page.keyboard.press('Control+v'); await page.waitForTimeout(80)
console.log('after copy/paste phantom:', JSON.stringify(await st()), 'errsNow=', errs().length)
await shot(page, 'exp-chaos-phantom-02')

// redo from phantom state - does original content come back cleanly?
for (let i = 0; i < 6; i++) { await page.keyboard.press('Control+Shift+Z'); await page.waitForTimeout(40) }
console.log('after redo x6 from phantom:', JSON.stringify(await st()))
await shot(page, 'exp-chaos-phantom-03')

console.log('\nALL ERRORS:', JSON.stringify(errs()))
dumpLog(log)
await browser.close()
console.log('PHANTOM DONE')
