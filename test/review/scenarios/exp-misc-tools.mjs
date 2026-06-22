import { openApp, shot, dumpLog } from '../_driver.mjs'

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

function state(page) {
  return page.evaluate(() => ({
    activeTool: document.querySelector('[data-tool-slot][data-active="true"]')?.getAttribute('data-tool-slot') || null,
    layerKids: document.querySelector('g[data-layer-name]')?.children.length ?? null,
    selBoxes: document.querySelectorAll('[data-role="selection-box"]').length,
    inspector: document.querySelector('[data-testid="inspector"]')?.innerText?.slice(0, 200) || null,
    defaultStyle: window.__vf_defaultStyle ?? null,
  }))
}

async function canvasBox(page) {
  const b = await page.locator('[data-role="canvas-root"]').boundingBox()
  return b
}

async function drawRect(page, cx, cy, w, h) {
  const b = await canvasBox(page)
  await page.mouse.move(b.x + cx, b.y + cy)
  await page.mouse.down()
  await page.mouse.move(b.x + cx + w, b.y + cy + h, { steps: 8 })
  await page.mouse.up()
}

const { browser, page, log } = await openApp()
console.log('=== START exp-misc-tools ===')

// expose default style for inspection
await page.evaluate(() => {
  import('/src/model/defaultStyle.ts').then(m => {
    window.__getDS = m.getDefaultStyle
  }).catch(() => {})
})

// ---- 1. Draw two rects to operate on ----
await page.keyboard.press('r')
await drawRect(page, 200, 180, 120, 90)
await page.keyboard.press('r')
await drawRect(page, 420, 200, 100, 110)
await sleep(200)
console.log('after draw 2 rects:', JSON.stringify(await state(page)))
await shot(page, 'exp-misc-tools-01-two-rects')

// ---- 2. Set distinct fills on each via inspector? Instead use color: just set via attr to differentiate for eyedropper ----
// Give first rect a known fill by selecting & using fill input if present.
await page.keyboard.press('v')
const b = await canvasBox(page)
await page.mouse.click(b.x + 230, b.y + 210) // click first rect
await sleep(150)
const insp1 = await page.evaluate(() => document.querySelector('[data-testid="inspector"]')?.innerText?.slice(0,300))
console.log('first rect selected inspector:', JSON.stringify(insp1))
await shot(page, 'exp-misc-tools-02-rect1-selected')

// Find a color input in inspector
const colorInputs = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('[data-testid="inspector"] input[type="color"], [data-testid="inspector"] input')).map(i => ({
    type: i.type, testid: i.getAttribute('data-testid'), value: i.value
  }))
})
console.log('inspector inputs:', JSON.stringify(colorInputs))

// Set the fill of first rect directly in DOM to a recognizable color for eyedropper test
await page.evaluate(() => {
  const layer = document.querySelector('g[data-layer-name]')
  const r = layer?.querySelector('rect')
  if (r) { r.setAttribute('fill', '#1188ff'); r.setAttribute('stroke', '#ff0000'); r.setAttribute('stroke-width', '4') }
})
await shot(page, 'exp-misc-tools-03-rect1-colored')

// ---- 3. EYEDROPPER: pick color from first rect, then check default style ----
await page.keyboard.press('v')
await page.mouse.click(b.x + 600, b.y + 600) // deselect
await sleep(100)
// activate eyedropper via rail click (shortcut may conflict)
await page.locator('[data-tool-slot="eyedropper"]').click()
await sleep(100)
console.log('eyedropper active state:', JSON.stringify(await state(page)))
await page.mouse.click(b.x + 230, b.y + 210) // click colored rect
await sleep(150)
const dsAfterPick = await page.evaluate(() => window.__getDS ? window.__getDS() : null)
console.log('default style after eyedropper pick:', JSON.stringify(dsAfterPick))
await shot(page, 'exp-misc-tools-04-after-eyedropper')

// Now draw a new rect — should it inherit the picked style?
await page.keyboard.press('r')
await drawRect(page, 200, 400, 90, 80)
await sleep(150)
const newRectStyle = await page.evaluate(() => {
  const layer = document.querySelector('g[data-layer-name]')
  const rects = Array.from(layer?.querySelectorAll('rect') || [])
  const last = rects[rects.length - 1]
  return last ? { fill: last.getAttribute('fill'), stroke: last.getAttribute('stroke'), sw: last.getAttribute('stroke-width') } : null
})
console.log('new rect drawn after eyedropper:', JSON.stringify(newRectStyle))
await shot(page, 'exp-misc-tools-05-new-rect-after-pick')

// ---- 4. ERASER tool ----
console.log('--- ERASER ---')
const beforeErase = await state(page)
console.log('before erase:', JSON.stringify(beforeErase))
await page.locator('[data-tool-slot="erase"]').click()
await sleep(100)
console.log('eraser active state:', JSON.stringify(await state(page)))
// hover over a rect to see highlight
await page.mouse.move(b.x + 230, b.y + 210)
await sleep(150)
await shot(page, 'exp-misc-tools-06-eraser-hover')
// click to erase first rect
await page.mouse.click(b.x + 230, b.y + 210)
await sleep(150)
const afterErase1 = await state(page)
console.log('after erase click 1:', JSON.stringify(afterErase1))
await shot(page, 'exp-misc-tools-07-after-erase')
// undo erase
await page.keyboard.press('Control+z')
await sleep(200)
const afterUndoErase = await state(page)
console.log('after undo erase:', JSON.stringify(afterUndoErase))
await shot(page, 'exp-misc-tools-08-after-undo-erase')

// drag-erase across multiple
await page.locator('[data-tool-slot="erase"]').click()
await page.mouse.move(b.x + 200, b.y + 210)
await page.mouse.down()
await page.mouse.move(b.x + 500, b.y + 250, { steps: 20 })
await page.mouse.up()
await sleep(150)
console.log('after drag erase:', JSON.stringify(await state(page)))
await shot(page, 'exp-misc-tools-09-after-drag-erase')
await page.keyboard.press('Control+z')
await sleep(200)
console.log('after undo drag erase:', JSON.stringify(await state(page)))
await shot(page, 'exp-misc-tools-10-undo-drag-erase')

// ---- 5. CONTEXT MENU ----
console.log('--- CONTEXT MENU ---')
await page.keyboard.press('v')
await page.mouse.click(b.x + 230, b.y + 210) // select a rect
await sleep(150)
// right click
await page.mouse.click(b.x + 230, b.y + 210, { button: 'right' })
await sleep(200)
const ctxItems = await page.evaluate(() => {
  const panel = document.querySelector('[data-role="panel"]')
  if (!panel) return null
  return Array.from(panel.querySelectorAll('button')).map(btn => ({ label: btn.innerText, disabled: btn.disabled }))
})
console.log('context menu items (with selection):', JSON.stringify(ctxItems))
await shot(page, 'exp-misc-tools-11-context-menu')

// Try "Bring to Front" via context menu
if (ctxItems) {
  await page.evaluate(() => {
    const panel = document.querySelector('[data-role="panel"]')
    const btn = Array.from(panel.querySelectorAll('button')).find(b => b.innerText.includes('Front'))
    btn?.click()
  })
  await sleep(150)
  console.log('after Bring to Front:', JSON.stringify(await state(page)))
}
await shot(page, 'exp-misc-tools-12-after-bring-front')

// Context menu with NO selection
await page.keyboard.press('v')
await page.mouse.click(b.x + 650, b.y + 650) // deselect
await sleep(100)
await page.mouse.click(b.x + 650, b.y + 650, { button: 'right' })
await sleep(200)
const ctxNoSel = await page.evaluate(() => {
  const panel = document.querySelector('[data-role="panel"]')
  if (!panel) return null
  return Array.from(panel.querySelectorAll('button')).map(btn => ({ label: btn.innerText, disabled: btn.disabled }))
})
console.log('context menu items (no selection):', JSON.stringify(ctxNoSel))
await shot(page, 'exp-misc-tools-13-context-no-sel')
await page.keyboard.press('Escape')
await sleep(100)

// Context menu Flip + Delete
await page.mouse.click(b.x + 420, b.y + 250)
await sleep(100)
await page.mouse.click(b.x + 420, b.y + 250, { button: 'right' })
await sleep(150)
await page.evaluate(() => {
  const panel = document.querySelector('[data-role="panel"]')
  const btn = Array.from(panel.querySelectorAll('button')).find(b => b.innerText.includes('Flip Horizontal'))
  btn?.click()
})
await sleep(150)
console.log('after flip H:', JSON.stringify(await state(page)))
await shot(page, 'exp-misc-tools-14-after-flip')

// ---- 6. OVERFLOW MENU + orphaned tools ----
console.log('--- OVERFLOW MENU ---')
await page.locator('[data-role="overflow"]').click()
await sleep(150)
const overflowItems = await page.evaluate(() => {
  const menu = document.querySelector('[data-role="overflow-menu"]')
  if (!menu) return null
  return Array.from(menu.querySelectorAll('button')).map(btn => btn.innerText.replace(/\n/g,' '))
})
console.log('overflow items:', JSON.stringify(overflowItems))
await shot(page, 'exp-misc-tools-15-overflow-open')

// Test each overflow tool: ellipse, line, measure, lasso, pencil, free-transform
const overflowTools = ['ellipse', 'line', 'measure', 'lasso', 'pencil', 'free-transform']
const toolResults = {}
for (const t of overflowTools) {
  // open overflow and click the matching item
  const isOpen = await page.evaluate(() => !!document.querySelector('[data-role="overflow-menu"]'))
  if (!isOpen) { await page.locator('[data-role="overflow"]').click(); await sleep(100) }
  const clicked = await page.evaluate((tool) => {
    const menu = document.querySelector('[data-role="overflow-menu"]')
    if (!menu) return false
    // map by index based on OVERFLOW_TOOLS order: pencil, ellipse, line, measure, lasso, free-transform
    const order = ['pencil','ellipse','line','measure','lasso','free-transform']
    const labels = ['Pencil','Ellipse','Line','Measure','Lasso','Free Transform']
    const idx = order.indexOf(tool)
    const btns = Array.from(menu.querySelectorAll('button'))
    if (idx >= 0 && btns[idx]) { btns[idx].click(); return true }
    return false
  }, t)
  await sleep(100)
  const active = await page.evaluate(() => {
    // active tool isn't shown in rail for overflow tools; read registry
    return window.__activeTool || null
  })
  toolResults[t] = { clicked }
}
// Better: read active tool name from registry directly
await page.evaluate(() => {
  import('/src/tools/registry.ts').then(m => { window.__getActiveTool = m.getActiveToolName })
})
await sleep(200)

// Now test ellipse actually draws
console.log('--- testing each overflow tool draws ---')
async function activateOverflow(toolName, btnIndex) {
  const open = await page.evaluate(() => !!document.querySelector('[data-role="overflow-menu"]'))
  if (!open) { await page.locator('[data-role="overflow"]').click(); await sleep(100) }
  await page.evaluate((i) => {
    const menu = document.querySelector('[data-role="overflow-menu"]')
    const btns = Array.from(menu.querySelectorAll('button'))
    btns[i]?.click()
  }, btnIndex)
  await sleep(100)
  return page.evaluate(() => window.__getActiveTool ? window.__getActiveTool() : null)
}

// order: pencil(0), ellipse(1), line(2), measure(3), lasso(4), free-transform(5)
// ELLIPSE
let act = await activateOverflow('ellipse', 1)
console.log('ellipse active:', act)
const kidsBeforeEllipse = (await state(page)).layerKids
await drawRect(page, 250, 500, 100, 70)
await sleep(150)
const kidsAfterEllipse = (await state(page)).layerKids
const ellipseAdded = await page.evaluate(() => document.querySelectorAll('g[data-layer-name] ellipse, g[data-layer-name] circle').length)
console.log(`ELLIPSE: active=${act} kids ${kidsBeforeEllipse}->${kidsAfterEllipse} ellipseEls=${ellipseAdded}`)
await shot(page, 'exp-misc-tools-16-ellipse-draw')

// LINE
act = await activateOverflow('line', 2)
const kidsBeforeLine = (await state(page)).layerKids
await drawRect(page, 600, 450, 120, 60)
await sleep(150)
const lineEls = await page.evaluate(() => document.querySelectorAll('g[data-layer-name] line, g[data-layer-name] polyline, g[data-layer-name] path').length)
const kidsAfterLine = (await state(page)).layerKids
console.log(`LINE: active=${act} kids ${kidsBeforeLine}->${kidsAfterLine} lineEls=${lineEls}`)
await shot(page, 'exp-misc-tools-17-line-draw')

// PENCIL
act = await activateOverflow('pencil', 0)
const kidsBeforePencil = (await state(page)).layerKids
const bb = await canvasBox(page)
await page.mouse.move(bb.x + 300, bb.y + 600)
await page.mouse.down()
await page.mouse.move(bb.x + 350, bb.y + 640, { steps: 5 })
await page.mouse.move(bb.x + 420, bb.y + 600, { steps: 5 })
await page.mouse.up()
await sleep(150)
const kidsAfterPencil = (await state(page)).layerKids
console.log(`PENCIL: active=${act} kids ${kidsBeforePencil}->${kidsAfterPencil}`)
await shot(page, 'exp-misc-tools-18-pencil-draw')

// MEASURE
act = await activateOverflow('measure', 3)
const kidsBeforeMeasure = (await state(page)).layerKids
await page.mouse.move(bb.x + 200, bb.y + 700)
await page.mouse.down()
await page.mouse.move(bb.x + 400, bb.y + 720, { steps: 10 })
await sleep(100)
await shot(page, 'exp-misc-tools-19-measure-drag')
await page.mouse.up()
await sleep(150)
const kidsAfterMeasure = (await state(page)).layerKids
console.log(`MEASURE: active=${act} kids ${kidsBeforeMeasure}->${kidsAfterMeasure}`)

// LASSO
act = await activateOverflow('lasso', 4)
console.log('lasso active:', act)
await page.mouse.move(bb.x + 150, bb.y + 150)
await page.mouse.down()
await page.mouse.move(bb.x + 350, bb.y + 150, { steps: 6 })
await page.mouse.move(bb.x + 350, bb.y + 350, { steps: 6 })
await page.mouse.move(bb.x + 150, bb.y + 350, { steps: 6 })
await page.mouse.move(bb.x + 150, bb.y + 150, { steps: 6 })
await page.mouse.up()
await sleep(150)
console.log(`LASSO: active=${act} state=`, JSON.stringify(await state(page)))
await shot(page, 'exp-misc-tools-20-lasso')

// FREE TRANSFORM
act = await activateOverflow('free-transform', 5)
console.log('free-transform active:', act)
await shot(page, 'exp-misc-tools-21-freetransform')

// ---- 7. SHORTCUT 'E' conflict check ----
console.log('--- shortcut E conflict ---')
await page.mouse.click(bb.x + 650, bb.y + 650) // ensure focus on canvas area, not input
await page.keyboard.press('e')
await sleep(100)
const afterE = await page.evaluate(() => window.__getActiveTool ? window.__getActiveTool() : null)
console.log(`pressed 'e' -> active tool = ${afterE} (rail labels E as eraser)`)
await page.keyboard.press('x')
await sleep(100)
const afterX = await page.evaluate(() => window.__getActiveTool ? window.__getActiveTool() : null)
console.log(`pressed 'x' -> active tool = ${afterX}`)
await page.keyboard.press('n')
await sleep(100)
const afterN = await page.evaluate(() => window.__getActiveTool ? window.__getActiveTool() : null)
console.log(`pressed 'n' -> active tool = ${afterN}`)

// ---- 8. STATUS BAR widgets ----
console.log('--- STATUS BAR ---')
const statusBar = await page.evaluate(() => {
  const sd = document.querySelector('[data-role="saved-dot"]')
  const pn = document.querySelector('[data-role="page-nav"]')
  const zi = document.querySelector('[data-role="zoom-in"]')
  const zo = document.querySelector('[data-role="zoom-out"]')
  const pnBtns = pn ? Array.from(pn.querySelectorAll('button')).map(b => ({ text: b.innerText, disabled: b.disabled })) : null
  return {
    savedDotColor: sd ? getComputedStyle(sd).background : null,
    pageNavText: pn?.innerText,
    pageNavButtons: pnBtns,
    zoomInPresent: !!zi, zoomOutPresent: !!zo,
  }
})
console.log('status bar:', JSON.stringify(statusBar))

// zoom in/out
const zoomBefore = await page.evaluate(() => document.querySelector('[data-role="page-nav"]')?.parentElement?.innerText)
await page.locator('[data-role="zoom-in"]').click()
await page.locator('[data-role="zoom-in"]').click()
await sleep(200)
await shot(page, 'exp-misc-tools-22-zoomed-in')
await page.locator('[data-role="zoom-out"]').click()
await sleep(200)
await shot(page, 'exp-misc-tools-23-zoomed-out')

// After making edits, is saved dot still "Saved"? (dirty state check)
const savedText = await page.evaluate(() => {
  const sd = document.querySelector('[data-role="saved-dot"]')
  return sd?.parentElement?.innerText
})
console.log('saved indicator text after many edits:', JSON.stringify(savedText))

console.log('=== END exp-misc-tools ===')
dumpLog(log)
await browser.close()
