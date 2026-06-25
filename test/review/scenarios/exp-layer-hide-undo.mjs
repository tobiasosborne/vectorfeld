/**
 * exp-layer-hide-undo.mjs — Playwright scenario for vectorfeld-3yu.12
 *
 * Verifies that toggling a layer's visibility now routes through command
 * history (previously it mutated the DOM directly, so Ctrl+Z popped the user's
 * PREVIOUS real edit instead of the hide — data loss):
 *   1. Draw a rect → it lands on the active layer, which is visible.
 *   2. Click the layer's Hide button → the layer (and its rect) goes
 *      display:none.
 *   3. Ctrl+Z → the HIDE is undone: the layer is visible again and the rect
 *      survives, with zero page errors.
 *
 * NOT run by CI golden suite — this is a headed review/dogfood scenario.
 * Run manually: node test/review/scenarios/exp-layer-hide-undo.mjs
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
      box.y + y1 + (y2 - y1) * i / steps,
    )
    await page.waitForTimeout(12)
  }
  await page.mouse.up()
  await page.waitForTimeout(180)
}

// Report the display state of the first layer that actually contains a <rect>,
// plus whether any <rect> exists at all. display === '' (or absent) ⇒ visible.
async function layerState() {
  return await page.evaluate(() => {
    const layers = Array.from(document.querySelectorAll('g[data-layer-name]'))
    const layer = layers.find((l) => l.querySelector('rect')) || layers[0] || null
    return {
      hasRect: !!document.querySelector('g[data-layer-name] rect'),
      display: layer ? (layer.style.display || '') : '(no layer)',
    }
  })
}

async function pageErrors() {
  return await page.evaluate(() => window.__pageErrors || [])
}

await page.evaluate(() => {
  window.__pageErrors = []
  window.addEventListener('error', (e) => { window.__pageErrors.push(e.message) })
})

// ── SETUP: draw a rect on the active layer ───────────────────────────────────
console.log('=== SETUP: draw a rect ===')
await key('r'); await drag(320, 300, 420, 380)
await key('v')

const before = await layerState()
console.log(`After draw: hasRect=${before.hasRect}, layer display="${before.display}"`)
await shot(page, 'exp-layer-hide-undo-01-drawn')

let passed = true
if (!before.hasRect) { console.error('FAIL: no rect drawn'); passed = false }

// ── HIDE: click the layer's Hide button in the Layers panel ──────────────────
console.log('=== HIDE: click layer Hide button ===')
const hideBtn = page.locator('button[title="Hide"]').first()
await hideBtn.click()
await page.waitForTimeout(180)

const hidden = await layerState()
console.log(`After hide: layer display="${hidden.display}"`)
await shot(page, 'exp-layer-hide-undo-02-hidden')
if (hidden.display !== 'none') {
  console.error(`FAIL: expected display:none after hide, got "${hidden.display}"`)
  passed = false
} else {
  console.log('PASS: layer hidden (display:none)')
}

// ── UNDO: Ctrl+Z must undo the HIDE (not a phantom prior edit) ────────────────
console.log('=== UNDO: Ctrl+Z ===')
await page.keyboard.press('Control+z')
await page.waitForTimeout(200)

const after = await layerState()
const errors = await pageErrors()
console.log(`After undo: hasRect=${after.hasRect}, layer display="${after.display}"`)
console.log(`Page errors: ${errors.length ? JSON.stringify(errors) : 'none'}`)
await shot(page, 'exp-layer-hide-undo-03-after-undo')

if (errors.length > 0) { console.error('FAIL: page errors:', JSON.stringify(errors)); passed = false }
else console.log('PASS: zero page errors on undo')

if (after.display === 'none') {
  console.error('FAIL: layer still hidden after undo — hide was not undoable')
  passed = false
} else {
  console.log('PASS: layer visible again after undo')
}

if (!after.hasRect) {
  console.error('FAIL: rect disappeared after undo (undo ate the prior edit)')
  passed = false
} else {
  console.log('PASS: rect survived the hide+undo')
}

dumpLog(log)
await browser.close()
console.log(passed ? 'EXP-LAYER-HIDE-UNDO PASS' : 'EXP-LAYER-HIDE-UNDO FAIL')
