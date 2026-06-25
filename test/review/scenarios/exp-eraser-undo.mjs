/**
 * exp-eraser-undo.mjs — Playwright scenario for vectorfeld-3yu.5
 *
 * Verifies:
 *   1. Eraser tool drag across 3 rects removes all three from view.
 *   2. Ctrl+Z (undo) restores all three with zero page errors.
 *   3. Layer child count is identical before erase and after undo.
 *
 * NOT run by CI golden suite — this is a headed review/dogfood scenario.
 * Run manually: node test/review/scenarios/exp-eraser-undo.mjs
 */

import { openApp, shot, dumpLog } from '../_driver.mjs'

const { browser, page, log } = await openApp()
const box = await page.locator('[data-role="canvas-root"]').boundingBox()

async function key(k) { await page.keyboard.press(k); await page.waitForTimeout(140) }
async function drag(x1, y1, x2, y2) {
  await page.mouse.move(box.x + x1, box.y + y1)
  await page.mouse.down()
  const steps = 20
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(
      box.x + x1 + (x2 - x1) * i / steps,
      box.y + y1 + (y2 - y1) * i / steps
    )
    await page.waitForTimeout(12)
  }
  await page.mouse.up()
  await page.waitForTimeout(180)
}

async function layerChildCount() {
  return await page.evaluate(() => {
    const layer = document.querySelector('g[data-layer-name]')
    return layer ? layer.children.length : -1
  })
}

async function pageErrors() {
  // Returns errors collected via page.on('pageerror') that were pushed to window.__pageErrors
  return await page.evaluate(() => window.__pageErrors || [])
}

// Collect page errors into a global array
await page.evaluate(() => {
  window.__pageErrors = []
  window.addEventListener('error', (e) => {
    window.__pageErrors.push(e.message)
  })
})

// ── SETUP: draw 3 rects spread across the canvas ────────────────────────────
console.log('=== SETUP: draw 3 rects ===')
// Draw well clear of the floating TopBar (top ~100px) so nothing intercepts.
await key('r'); await drag(300, 300, 360, 360)   // rect A (left)
await key('r'); await drag(450, 300, 510, 360)  // rect B (middle)
await key('r'); await drag(600, 300, 660, 360)  // rect C (right)
await key('v')  // switch back to select tool

const countBefore = await layerChildCount()
console.log(`Layer children before erase: ${countBefore}`)
await shot(page, 'exp-eraser-undo-01-three-rects')

// ── ERASE: drag eraser across all 3 rects ───────────────────────────────────
console.log('=== ERASE: drag eraser across all three rects ===')
await key('x')  // activate eraser (shortcut 'x')
// Drag from left of A to right of C, through Y-midpoint of all rects
await drag(280, 330, 680, 330)
await key('v')  // back to select tool to allow clean measurement

const countAfterErase = await layerChildCount()
console.log(`Layer children after erase: ${countAfterErase}`)
await shot(page, 'exp-eraser-undo-02-after-erase')

if (countAfterErase !== countBefore - 3) {
  console.warn(`WARNING: expected ${countBefore - 3} children after erase, got ${countAfterErase}`)
} else {
  console.log('PASS: all 3 elements erased')
}

// ── UNDO: Ctrl+Z ─────────────────────────────────────────────────────────────
console.log('=== UNDO: Ctrl+Z ===')
await page.keyboard.press('Control+z')
await page.waitForTimeout(200)

const countAfterUndo = await layerChildCount()
const errors = await pageErrors()
console.log(`Layer children after undo: ${countAfterUndo}`)
console.log(`Page errors after undo: ${errors.length > 0 ? JSON.stringify(errors) : 'none'}`)
await shot(page, 'exp-eraser-undo-03-after-undo')

// ── ASSERTIONS ───────────────────────────────────────────────────────────────
let passed = true

if (errors.length > 0) {
  console.error('FAIL: page errors detected:', JSON.stringify(errors))
  passed = false
} else {
  console.log('PASS: zero page errors on undo')
}

if (countAfterUndo !== countBefore) {
  console.error(`FAIL: expected ${countBefore} children after undo, got ${countAfterUndo}`)
  passed = false
} else {
  console.log(`PASS: child count restored (${countAfterUndo} === ${countBefore})`)
}

// ── REDO: Ctrl+Shift+Z ───────────────────────────────────────────────────────
console.log('=== REDO: Ctrl+Shift+Z ===')
await page.keyboard.press('Control+Shift+z')
await page.waitForTimeout(200)

const countAfterRedo = await layerChildCount()
console.log(`Layer children after redo: ${countAfterRedo}`)
if (countAfterRedo !== countBefore - 3) {
  console.error(`FAIL: expected ${countBefore - 3} after redo, got ${countAfterRedo}`)
  passed = false
} else {
  console.log('PASS: redo re-removed all 3 elements')
}

await shot(page, 'exp-eraser-undo-04-after-redo')

dumpLog(log)
await browser.close()
console.log(passed ? 'EXP-ERASER-UNDO PASS' : 'EXP-ERASER-UNDO FAIL')
