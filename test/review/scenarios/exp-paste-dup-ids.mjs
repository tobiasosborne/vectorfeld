/**
 * exp-paste-dup-ids.mjs
 * Headed Playwright scenario for vectorfeld-3yu.13:
 *   Paste/duplicate a group must not produce duplicate element ids.
 *
 * Steps:
 *   1. Draw two rects.
 *   2. Select all (Ctrl+A).
 *   3. Group (Ctrl+G).
 *   4. Duplicate (Ctrl+D) — which copies the group and pastes with offset.
 *   5. Collect every [id] under the layer's g[data-layer-name] children.
 *   6. PASS when duplicate-id count is 0.
 *
 * IMPORTANT: orchestrator runs this file — do NOT run it from this script.
 */

import { openApp, shot, dumpLog } from '../_driver.mjs'

const { browser, page, log } = await openApp()
const box = await page.locator('[data-role="canvas-root"]').boundingBox()

async function drag(x1, y1, x2, y2) {
  await page.mouse.move(box.x + x1, box.y + y1)
  await page.mouse.down()
  for (let i = 1; i <= 5; i++) {
    await page.mouse.move(box.x + x1 + (x2 - x1) * i / 5, box.y + y1 + (y2 - y1) * i / 5)
    await page.waitForTimeout(12)
  }
  await page.mouse.up()
  await page.waitForTimeout(80)
}

async function tool(letter) {
  await page.keyboard.press(letter)
  await page.waitForTimeout(80)
}

// Draw rect 1
await tool('r')
await drag(100, 100, 260, 200)

// Draw rect 2
await tool('r')
await drag(280, 100, 440, 200)

// Select all
await tool('v')
await page.keyboard.press('Control+a')
await page.waitForTimeout(100)

// Group
await page.keyboard.press('Control+g')
await page.waitForTimeout(150)

// Duplicate (Ctrl+D)
await page.keyboard.press('Control+d')
await page.waitForTimeout(200)

await shot(page, 'paste-dup-ids-after-duplicate')

// Collect all ids under the active layer
const result = await page.evaluate(() => {
  const layer = document.querySelector('g[data-layer-name]')
  if (!layer) return { error: 'no layer found', ids: [], duplicates: [] }

  const allIds = Array.from(layer.querySelectorAll('[id]')).map(el => el.getAttribute('id'))
  const seen = new Set()
  const duplicates = []
  for (const id of allIds) {
    if (seen.has(id)) duplicates.push(id)
    else seen.add(id)
  }
  return { totalIds: allIds.length, duplicates }
})

console.log('ID AUDIT:', JSON.stringify(result))

if (result.error) {
  console.log('RESULT: FAIL —', result.error)
} else if (result.duplicates.length === 0) {
  console.log(`RESULT: PASS — ${result.totalIds} ids, 0 duplicates`)
} else {
  console.log(`RESULT: FAIL — ${result.duplicates.length} duplicate id(s): ${result.duplicates.join(', ')}`)
}

dumpLog(log)
await browser.close()
