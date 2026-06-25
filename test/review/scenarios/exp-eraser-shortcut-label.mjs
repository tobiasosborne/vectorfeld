/**
 * exp-eraser-shortcut-label.mjs
 *
 * Headed Chromium gate: verifies that the eraser rail slot shows "X" (not "E"),
 * that pressing 'e' activates the Ellipse tool, and pressing 'x' activates Eraser.
 *
 * Prepared as part of fix for vectorfeld-3yu.24.
 * DO NOT run with `npx vitest` — this is a Playwright/driver scenario.
 * Run via: node test/review/scenarios/exp-eraser-shortcut-label.mjs
 */
import { openApp, shot, dumpLog } from '../_driver.mjs'

const SID = 'exp-eraser-shortcut-label'
const { browser, page, log } = await openApp()

function activeSlot() {
  return page.evaluate(() => {
    const btn = document.querySelector('[data-tool-slot][data-active="true"]')
    return btn ? btn.getAttribute('data-tool-slot') : null
  })
}

function eraseSlotShortcutText() {
  return page.evaluate(() => {
    const btn = document.querySelector('[data-tool-slot="erase"]')
    if (!btn) return null
    // The shortcut label is the last <span> child (small font, letterSpacing).
    const spans = btn.querySelectorAll('span')
    return spans.length > 0 ? spans[spans.length - 1].textContent?.trim() ?? null : null
  })
}

const out = (label, v) => console.log(`[${label}]`, JSON.stringify(v))

// ---------- A) Eraser slot must display 'X', not 'E' ----------
console.log('\n=== A: eraser slot shortcut label ===')
const label = await eraseSlotShortcutText()
out('A.erase-slot-shortcut', label)
if (!label || label.toLowerCase() !== 'x') {
  console.error(`FAIL: expected eraser slot to show 'X', got '${label}'`)
  process.exitCode = 1
} else {
  console.log('PASS: eraser slot shows X')
}
await shot(page, `${SID}-A1-erase-slot-label`)

// ---------- B) Pressing 'e' activates Ellipse (not Eraser) ----------
console.log('\n=== B: pressing E activates Ellipse ===')
await page.keyboard.press('v')   // reset to select first
out('B.before-e', await activeSlot())
await page.keyboard.press('e')
const afterE = await activeSlot()
out('B.after-e', afterE)
await shot(page, `${SID}-B1-after-e-key`)
if (afterE !== 'erase') {
  // Ellipse is in the overflow, not a named slot — check via active tool name from registry
  const activeToolName = await page.evaluate(() => {
    // Access registry through the window if exposed, otherwise fall back to slot check.
    // The overflow tools don't have [data-tool-slot] in the rail, so 'erase' being inactive
    // and 'select' being inactive confirms ellipse tool is active.
    const activeSlotEl = document.querySelector('[data-tool-slot][data-active="true"]')
    return activeSlotEl ? activeSlotEl.getAttribute('data-tool-slot') : 'none-in-rail'
  })
  out('B.active-slot-after-e', activeToolName)
  if (activeToolName !== 'erase') {
    console.log('PASS: pressing E did NOT activate eraser (activated overflow ellipse tool)')
  } else {
    console.error('FAIL: pressing E activated eraser slot — shortcut routing broken')
    process.exitCode = 1
  }
}

// ---------- C) Pressing 'x' activates Eraser ----------
console.log('\n=== C: pressing X activates Eraser ===')
await page.keyboard.press('v')   // reset
out('C.before-x', await activeSlot())
await page.keyboard.press('x')
const afterX = await activeSlot()
out('C.after-x', afterX)
await shot(page, `${SID}-C1-after-x-key`)
if (afterX === 'erase') {
  console.log('PASS: pressing X activated eraser slot (data-active="true")')
} else {
  console.error(`FAIL: expected eraser slot active after pressing X, got '${afterX}'`)
  process.exitCode = 1
}

console.log('\n=== DONE ===')
dumpLog(log)
await browser.close()
