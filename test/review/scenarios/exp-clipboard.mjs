import { openApp, shot, dumpLog } from '../_driver.mjs'
import { writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(here, '..', 'shots')

const { browser, page, log } = await openApp()

// Helper to read state
async function state() {
  return await page.evaluate(() => {
    const layer = document.querySelector('g[data-layer-name]')
    const allEls = layer ? Array.from(layer.querySelectorAll('*')) : []
    const ids = allEls.map((e) => e.getAttribute('id')).filter(Boolean)
    const dupIds = ids.filter((id, i) => ids.indexOf(id) !== i)
    return {
      layerKids: layer ? layer.children.length : -1,
      selBoxes: document.querySelectorAll('[data-role="selection-box"]').length,
      totalEls: allEls.length,
      ids,
      dupIds: [...new Set(dupIds)],
      inspector: document.querySelector('[data-testid="inspector"]')?.innerText?.slice(0, 200),
    }
  })
}

async function canvasBox() {
  const cr = await page.locator('[data-role="canvas-root"]').boundingBox()
  return cr
}

// Draw a rectangle by dragging on canvas
async function drawRect(x1, y1, x2, y2) {
  const cr = await canvasBox()
  await page.mouse.move(cr.x + x1, cr.y + y1)
  await page.mouse.down()
  await page.mouse.move(cr.x + x2, cr.y + y2, { steps: 8 })
  await page.mouse.up()
}

async function clickCanvas(x, y) {
  const cr = await canvasBox()
  await page.mouse.click(cr.x + x, cr.y + y)
}

const report = {}

try {
  // ---- Step 1: draw a rectangle with rect tool ----
  await page.keyboard.press('r')
  await drawRect(120, 120, 240, 220)
  await page.keyboard.press('v') // back to select
  let s = await state()
  console.log('STEP1 after draw rect:', JSON.stringify(s, null, 0))
  await shot(page, 'exp-clipboard-01-drawn')
  report.afterDraw = s

  // ---- Step 2: select the rect, copy, paste (Ctrl+V, expect offset) ----
  await clickCanvas(180, 170)
  s = await state()
  console.log('STEP2 selected:', s.selBoxes, 'selboxes; inspector=', s.inspector)
  await shot(page, 'exp-clipboard-02-selected')

  await page.keyboard.press('Control+c')
  await page.keyboard.press('Control+v')
  s = await state()
  console.log('STEP2 after paste (offset):', JSON.stringify({layerKids:s.layerKids, selBoxes:s.selBoxes, ids:s.ids, dup:s.dupIds}))
  await shot(page, 'exp-clipboard-03-paste-offset')
  report.afterPasteOffset = s

  // Read the geometry of the two rects to verify offset
  let rects = await page.evaluate(() => {
    const layer = document.querySelector('g[data-layer-name]')
    return Array.from(layer.querySelectorAll('rect')).map((r) => ({
      id: r.getAttribute('id'), x: r.getAttribute('x'), y: r.getAttribute('y'),
    }))
  })
  console.log('STEP2 rects after offset paste:', JSON.stringify(rects))
  report.offsetRects = rects

  // ---- Step 3: paste in place (Ctrl+Shift+V) expect NO offset ----
  await page.keyboard.press('Control+Shift+v')
  s = await state()
  rects = await page.evaluate(() => {
    const layer = document.querySelector('g[data-layer-name]')
    return Array.from(layer.querySelectorAll('rect')).map((r) => ({
      id: r.getAttribute('id'), x: r.getAttribute('x'), y: r.getAttribute('y'),
    }))
  })
  console.log('STEP3 after paste-in-place:', JSON.stringify({layerKids:s.layerKids, selBoxes:s.selBoxes}))
  console.log('STEP3 rects:', JSON.stringify(rects))
  await shot(page, 'exp-clipboard-04-paste-in-place')
  report.pasteInPlaceRects = rects

  // ---- Step 4: paste multiple times to check cumulative offset / id growth ----
  await page.keyboard.press('Control+v')
  await page.keyboard.press('Control+v')
  await page.keyboard.press('Control+v')
  s = await state()
  console.log('STEP4 after 3 more pastes:', JSON.stringify({layerKids:s.layerKids, dup:s.dupIds}))
  await shot(page, 'exp-clipboard-05-multipaste')
  report.afterMultiPaste = s

  // ---- Step 5: duplicate (Ctrl+D) ----
  await clickCanvas(180, 170) // reselect something
  await page.keyboard.press('Control+d')
  s = await state()
  console.log('STEP5 after Ctrl+D duplicate:', JSON.stringify({layerKids:s.layerKids, selBoxes:s.selBoxes}))
  await shot(page, 'exp-clipboard-06-duplicate')
  report.afterDuplicate = s

  // ---- Step 6: cut (Ctrl+X) then paste ----
  await clickCanvas(185, 175)
  let before = await state()
  await page.keyboard.press('Control+x')
  let afterCut = await state()
  console.log('STEP6 cut: before kids=', before.layerKids, 'after=', afterCut.layerKids, 'selBoxes=', afterCut.selBoxes)
  await shot(page, 'exp-clipboard-07-after-cut')
  await page.keyboard.press('Control+v')
  let afterCutPaste = await state()
  console.log('STEP6 after cut+paste kids=', afterCutPaste.layerKids)
  report.cut = { before: before.layerKids, afterCut: afterCut.layerKids, afterPaste: afterCutPaste.layerKids }

  // ---- Step 7: GROUP test — id collision in children ----
  // Clear everything: select all & delete
  await page.evaluate(() => {
    const layer = document.querySelector('g[data-layer-name]')
    // can't easily clear; just count
  })
  // Draw two rects, group them, copy/paste the group, then inspect child IDs
  await page.keyboard.press('r')
  await drawRect(400, 300, 460, 360)
  await page.keyboard.press('r')
  await drawRect(480, 300, 540, 360)
  await page.keyboard.press('v')
  // select both via marquee around them
  await drawRect(390, 290, 550, 370)
  s = await state()
  console.log('STEP7 marquee selected:', s.selBoxes)
  await page.keyboard.press('Control+g') // group
  s = await state()
  console.log('STEP7 after group: layerKids=', s.layerKids, 'selBoxes=', s.selBoxes)
  await shot(page, 'exp-clipboard-08-grouped')
  // copy + paste the group
  await page.keyboard.press('Control+c')
  await page.keyboard.press('Control+v')
  s = await state()
  console.log('STEP7 after group paste: ids=', JSON.stringify(s.ids))
  console.log('STEP7 DUPLICATE IDS:', JSON.stringify(s.dupIds))
  await shot(page, 'exp-clipboard-09-group-pasted')
  report.groupPaste = { ids: s.ids, dupIds: s.dupIds, layerKids: s.layerKids }

  // ---- Step 8: Export SVG and check for duplicate ids in the exported file ----
  const fc = page.waitForEvent('download')
  await page.getByRole('button', { name: 'File', exact: true }).click()
  await page.getByText('Export SVG', { exact: true }).last().click().catch(async () => {
    await page.getByRole('menuitem', { name: 'Export SVG' }).click()
  })
  const dl = await fc
  const svgPath = resolve(OUT, 'exp-clipboard-export.svg')
  await dl.saveAs(svgPath)
  const svgText = (await import('node:fs')).readFileSync(svgPath, 'utf8')
  // find duplicate ids in exported svg
  const idMatches = [...svgText.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1])
  const dupExport = idMatches.filter((id, i) => idMatches.indexOf(id) !== i)
  console.log('STEP8 exported svg id count=', idMatches.length, 'dups=', JSON.stringify([...new Set(dupExport)]))
  report.export = { idCount: idMatches.length, dupIds: [...new Set(dupExport)], path: svgPath }

  // ---- Step 9: paste after undo (clipboard should survive undo) ----
  // undo everything? just undo a couple and paste
  await page.keyboard.press('Control+z')
  let afterUndo = await state()
  await page.keyboard.press('Control+v')
  let afterUndoPaste = await state()
  console.log('STEP9 undo->paste: afterUndo kids=', afterUndo.layerKids, 'afterPaste kids=', afterUndoPaste.layerKids)
  await shot(page, 'exp-clipboard-10-undo-paste')
  report.undoPaste = { afterUndo: afterUndo.layerKids, afterPaste: afterUndoPaste.layerKids }

  // ---- Step 10: pasted element selected & editable? Move pasted element with arrow ----
  await page.keyboard.press('Control+v')
  let beforeNudge = await page.evaluate(() => {
    const sel = document.querySelectorAll('[data-role="selection-box"]')
    return sel.length
  })
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  let afterNudge = await state()
  console.log('STEP10 pasted selBoxes=', beforeNudge, ' editable nudge ok kids=', afterNudge.layerKids)
  report.editable = { selBoxes: beforeNudge }

} catch (e) {
  console.log('ERROR in scenario:', e.message, e.stack)
} finally {
  console.log('\n=== REPORT ===')
  console.log(JSON.stringify(report, null, 2))
  dumpLog(log)
  await browser.close()
}
