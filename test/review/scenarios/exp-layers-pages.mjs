import { openApp, shot, dumpLog } from '../_driver.mjs'

const { browser, page, log } = await openApp()

const SHOT = 'exp-layers-pages'
const results = []
function note(k, v) { results.push([k, v]); console.log(`>> ${k}:`, typeof v === 'string' ? v : JSON.stringify(v)) }

// Helper: read panel + DOM state
async function state() {
  return await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[data-testid="inspector"] [data-role="inspector-layers-tab"]'))
    // Layer rows: find the embedded LayersPanel rows (each has the ◉/◎ + lock buttons)
    const panel = document.querySelector('[data-testid="inspector"]')
    // count g[data-layer-name] in the doc svg
    const layerEls = Array.from(document.querySelectorAll('g[data-layer-name]'))
    const layers = layerEls.map(el => ({
      name: el.getAttribute('data-layer-name'),
      display: el.style.display,
      locked: el.getAttribute('data-locked'),
      kids: el.children.length,
    }))
    const selBoxes = document.querySelectorAll('[data-role="selection-box"]').length
    // inspector text - grab the layers panel area text
    const inspectorText = panel ? panel.innerText.slice(0, 600) : null
    const pageNav = document.querySelector('[data-role="page-nav"]')?.innerText
    return { layers, selBoxes, pageNav, inspectorText }
  })
}

// Helper: get layer row buttons within the embedded panel.
// Rows are divs with the visibility/lock/up/down/delete buttons.
async function layerRows() {
  return await page.evaluate(() => {
    const panel = document.querySelector('[data-testid="inspector"]')
    if (!panel) return []
    // rows live after the add-layer button container; find divs that contain a folder thumb + name span
    const candidates = Array.from(panel.querySelectorAll('div'))
    const rows = candidates.filter(d => {
      const btns = d.querySelectorAll(':scope > button')
      return btns.length >= 4 && d.querySelector('svg') // has thumb svg
    })
    return rows.map((r, i) => {
      const span = r.querySelector('span')
      return { i, name: span?.textContent, btnCount: r.querySelectorAll(':scope > button').length }
    })
  })
}

// Click a button inside a layer row by index + button role (vis/lock/up/down/del by title)
async function clickRowBtn(rowIdx, title) {
  return await page.evaluate(({ rowIdx, title }) => {
    const panel = document.querySelector('[data-testid="inspector"]')
    const candidates = Array.from(panel.querySelectorAll('div'))
    const rows = candidates.filter(d => {
      const btns = d.querySelectorAll(':scope > button')
      return btns.length >= 4 && d.querySelector('svg')
    })
    const row = rows[rowIdx]
    if (!row) return 'no-row'
    const btn = Array.from(row.querySelectorAll('button')).find(b => b.title === title || (title === 'vis' && (b.title === 'Hide' || b.title === 'Show')) || (title === 'lock' && (b.title === 'Lock' || b.title === 'Unlock')))
    if (!btn) return 'no-btn'
    btn.click()
    return 'ok'
  }, { rowIdx, title })
}

async function clickRow(rowIdx) {
  return await page.evaluate((rowIdx) => {
    const panel = document.querySelector('[data-testid="inspector"]')
    const candidates = Array.from(panel.querySelectorAll('div'))
    const rows = candidates.filter(d => {
      const btns = d.querySelectorAll(':scope > button')
      return btns.length >= 4 && d.querySelector('svg')
    })
    rows[rowIdx]?.click()
    return rows.length
  }, rowIdx)
}

// ============ 0. baseline ============
await shot(page, `${SHOT}-00-initial`)
note('initial state', await state())
note('initial rows', await layerRows())

// ============ 1. Add a couple layers ============
await page.locator('[data-testid="add-layer"]').click()
await page.waitForTimeout(150)
await page.locator('[data-testid="add-layer"]').click()
await page.waitForTimeout(150)
note('after add x2', await state())
await shot(page, `${SHOT}-01-added-layers`)

// ============ 2. Draw a rect into the active layer ============
const canvas = await page.locator('[data-role="canvas-root"]').boundingBox()
async function drawRect(x1, y1, x2, y2) {
  await page.keyboard.press('r')
  await page.mouse.move(canvas.x + x1, canvas.y + y1)
  await page.mouse.down()
  await page.mouse.move(canvas.x + x2, canvas.y + y2, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(120)
}
await drawRect(300, 200, 420, 300)
note('after draw rect into active layer', await state())
await shot(page, `${SHOT}-02-rect-drawn`)

// ============ 3. Lock the layer that has the rect, try to draw again ============
const rowsNow = await layerRows()
note('rows before lock', rowsNow)
// find the layer with kids>0
let st = await state()
const activeLayerIdx = st.layers.findIndex(l => l.kids > 0)
note('layer-with-rect idx', activeLayerIdx)
// Lock that row
await clickRowBtn(activeLayerIdx, 'lock')
await page.waitForTimeout(120)
st = await state()
note('after lock toggle', st.layers)
// click that row to make active, then try draw
await clickRow(activeLayerIdx)
await drawRect(330, 230, 360, 260)
st = await state()
note('after draw into LOCKED layer (should NOT add kid)', st.layers)
await shot(page, `${SHOT}-03-locked-draw`)

// ============ 4. Hide a layer & check canvas ============
await clickRowBtn(activeLayerIdx, 'vis')
await page.waitForTimeout(120)
st = await state()
note('after hide toggle', st.layers)
await shot(page, `${SHOT}-04-hidden`)

// ============ 5. Undo after hide — does it desync? ============
await page.keyboard.press('Control+z')
await page.waitForTimeout(150)
st = await state()
note('after undo (hide was NOT a command — does layer reappear or stay hidden? does undo revert the rect instead?)', st.layers)
await shot(page, `${SHOT}-05-after-undo-hide`)

// redo
await page.keyboard.press('Control+y')
await page.waitForTimeout(150)
note('after redo', (await state()).layers)

// ============ 6. Reorder: move up/down ============
// unhide + unlock first to reset
st = await state()
let hidden = st.layers.findIndex(l => l.display === 'none')
if (hidden >= 0) { await clickRowBtn(hidden, 'vis'); await page.waitForTimeout(100) }
let locked = (await state()).layers.findIndex(l => l.locked === 'true')
if (locked >= 0) { await clickRowBtn(locked, 'lock'); await page.waitForTimeout(100) }
note('reset state', (await state()).layers)

const rowsForReorder = await layerRows()
note('rows for reorder', rowsForReorder)
// move last row up
await clickRowBtn(rowsForReorder.length - 1, 'Move up')
await page.waitForTimeout(150)
note('after move-up of last', (await state()).layers.map(l => l.name))
await shot(page, `${SHOT}-06-reorder`)
// undo the reorder
await page.keyboard.press('Control+z')
await page.waitForTimeout(150)
note('after undo reorder', (await state()).layers.map(l => l.name))

// ============ 7. Select the rect on canvas, then delete its layer -> dangling selection? ============
// First make rect layer active & visible, select rect
await page.keyboard.press('v')
st = await state()
const rectLayerIdx = st.layers.findIndex(l => l.kids > 0)
note('rect layer idx for delete test', rectLayerIdx)
// click on the rect on canvas to select it
await page.mouse.click(canvas.x + 360, canvas.y + 250)
await page.waitForTimeout(150)
st = await state()
note('after clicking rect', { selBoxes: st.selBoxes })
await shot(page, `${SHOT}-07a-rect-selected`)
// now delete the layer containing the selected rect
await clickRowBtn(rectLayerIdx, 'Delete layer')
await page.waitForTimeout(200)
st = await state()
note('after deleting layer of selected element -> DANGLING selection?', { selBoxes: st.selBoxes, layers: st.layers })
await shot(page, `${SHOT}-07b-after-delete-active-layer`)

// ============ 8. Delete down to last layer (edge case) ============
let guard = 0
while ((await state()).layers.length > 1 && guard < 12) {
  await clickRowBtn(0, 'Delete layer')
  await page.waitForTimeout(120)
  guard++
}
st = await state()
note('after deleting down to last', { count: st.layers.length, layers: st.layers })
await shot(page, `${SHOT}-08-last-layer`)
// try to delete the last layer (button should be gone)
const lastDel = await clickRowBtn(0, 'Delete layer')
note('attempt delete LAST layer result', lastDel)
note('after attempt delete last', { count: (await state()).layers.length })

// ============ 9. Pages tab ============
await page.locator('[data-role="inspector-properties-tab"]').click()
await page.waitForTimeout(150)
const pagesText = await page.evaluate(() => document.querySelector('[data-testid="inspector"]')?.innerText)
note('Pages tab content', pagesText?.slice(-200))
note('page-nav statusbar', (await state()).pageNav)
await shot(page, `${SHOT}-09-pages-tab`)

dumpLog(log)
await browser.close()
console.log('\nDONE')
