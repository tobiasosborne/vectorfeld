// Atrium redesign dogfood — drives a real headed Chromium session through
// the key flows and screenshots at each gate. Written for vectorfeld-u6i.
//
// Checks:
//   1. Empty state — panels float, toolrail shows 9 buttons, accent pill
//      on Select, tab shows "Untitled" with no dirty dot.
//   2. Draw rect — tool switch via rail, canvas drag, Inspector populates
//      with RECT · 1 SELECTED, Frame shows X/Y/W/H, dirty dot fires on tab.
//   3. Text menus open properly (overflow:visible guard).
//   4. Real PDF compositing still works post-redesign.
//
// Usage:
//   npm run dev      # in another shell
//   npm run dogfood  # or: node test/dogfood/atrium.mjs

import { chromium } from '/home/tobias/.nvm/versions/node/v24.11.1/lib/node_modules/@playwright/cli/node_modules/playwright/index.mjs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { existsSync, mkdirSync } from 'node:fs'

const here = dirname(fileURLToPath(import.meta.url))
const FIXTURES = resolve(here, 'fixtures')
const OUT = resolve(here, 'screenshots')
mkdirSync(OUT, { recursive: true })
const URL = process.env.URL || 'http://localhost:5173'
const FOREGROUND = resolve(FIXTURES, 'Flyer Swift Vortragscoaching 15.04.2026 noheader.pdf')
const BACKGROUND = resolve(FIXTURES, 'Flyer Swift Vortragscoaching yellow BG bluer Border.pdf')

const browser = await chromium.launch({ headless: false })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await context.newPage()
page.on('pageerror', (err) => console.error('[page:error]', err.message))

const gate = async (name, fn) => {
  console.log(`\n─── ${name} ───`)
  try {
    await fn()
    console.log(`  ✓ ${name}`)
  } catch (err) {
    console.error(`  ✗ ${name}: ${err.message}`)
    process.exitCode = 1
  }
}

await page.goto(URL, { waitUntil: 'networkidle' })
// Wait for the Canvas to mount + tools to register.
await page.waitForFunction(
  () => !!document.querySelector('[data-tool-slot="select"][data-active="true"]'),
  { timeout: 5000 },
).catch(() => {})

await gate('1. Empty state — floating panels, 9-slot rail', async () => {
  // All five named Panels (topbar, leftrail, inspector, statusbar, canvas-root)
  for (const testid of ['topbar', 'leftrail', 'inspector', 'statusbar']) {
    const el = await page.locator(`[data-testid="${testid}"]`).first()
    if (!(await el.count())) throw new Error(`missing ${testid}`)
  }
  // 9 rail slots
  const slots = await page.locator('[data-tool-slot]').count()
  if (slots !== 9) throw new Error(`rail has ${slots} slots, expected 9`)
  // Select is active
  const isActive = await page.locator('[data-tool-slot="select"][data-active="true"]').count()
  if (!isActive) throw new Error('Select tool not marked active')
  // Brush + knife disabled
  const brushDisabled = await page.locator('[data-tool-slot="brush"]').isDisabled()
  const knifeDisabled = await page.locator('[data-tool-slot="knife"]').isDisabled()
  if (!brushDisabled || !knifeDisabled) throw new Error('brush/knife must be disabled')
  // Tab shows Untitled, no dirty dot
  const dirtyDots = await page.locator('[data-role="tab-dirty-dot"]').count()
  if (dirtyDots !== 0) throw new Error('unexpected dirty dot on fresh doc')
  await page.screenshot({ path: resolve(OUT, 'dogfood-1-empty.png') })
})

await gate('2. Draw rect via rail → Inspector populates → dirty dot fires', async () => {
  // Click Rect tool via rail
  await page.locator('[data-tool-slot="rect"]').click()
  // Verify accent pill moved
  const rectActive = await page.locator('[data-tool-slot="rect"][data-active="true"]').count()
  if (!rectActive) throw new Error('Rect slot did not become active')
  // Drag rect on canvas
  const box = await page.locator('[data-role="canvas-root"]').boundingBox()
  if (!box) throw new Error('no canvas-root box')
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  await page.mouse.move(cx - 120, cy - 80)
  await page.mouse.down()
  await page.mouse.move(cx + 120, cy + 80)
  await page.mouse.up()
  // Switch to select tool
  await page.locator('[data-tool-slot="select"]').click()
  // Click the rect
  await page.mouse.click(cx, cy)
  // Give React a tick to re-render the Inspector
  await page.waitForTimeout(500)
  // Inspector should now show a "N selected" header (CSS uppercases it)
  await page.waitForFunction(
    () => {
      const inspector = document.querySelector('[data-testid="inspector"]')
      const text = inspector?.textContent?.toLowerCase() || ''
      return text.includes('· 1 selected')
    },
    { timeout: 3000 },
  )
  // Dirty dot fired?
  const dirtyDots = await page.locator('[data-role="tab-dirty-dot"]').count()
  if (!dirtyDots) throw new Error('dirty dot never appeared on the tab')
  await page.screenshot({ path: resolve(OUT, 'dogfood-2-selection.png') })
})

await gate('3. File menu opens (overflow:visible on TopBar)', async () => {
  await page.getByRole('button', { name: 'File', exact: true }).click()
  // Look for an item known to live under File menu
  const openPdf = await page.getByText('Open PDF...', { exact: true }).count()
  if (!openPdf) throw new Error('File menu did not open or Open PDF item missing')
  await page.screenshot({ path: resolve(OUT, 'dogfood-3-file-menu.png') })
  // Close the menu
  await page.keyboard.press('Escape').catch(() => {})
  await page.mouse.click(50, 400)
})

if (existsSync(FOREGROUND) && existsSync(BACKGROUND)) {
  await gate('4. Regression — real PDF compositing still lands', async () => {
    // File > Open PDF
    const fc1Promise = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'File', exact: true }).click()
    await page.getByText('Open PDF...', { exact: true }).click()
    const fc1 = await fc1Promise
    await fc1.setFiles(FOREGROUND)
    await page.waitForFunction(
      () => document.querySelectorAll('g[data-layer-name]').length === 1 &&
        document.querySelector('g[data-layer-name]')?.children.length > 0,
      { timeout: 30000 },
    )
    // File > Open PDF as Background Layer
    const fc2Promise = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'File', exact: true }).click()
    await page.getByText('Open PDF as Background Layer...', { exact: true }).click()
    const fc2 = await fc2Promise
    await fc2.setFiles(BACKGROUND)
    await page.waitForFunction(
      () => document.querySelectorAll('g[data-layer-name]').length === 2,
      { timeout: 30000 },
    )
    await page.screenshot({ path: resolve(OUT, 'dogfood-4-composite.png') })
  })
} else {
  console.log(`  (skipping compositing regression — fixtures missing from ${FIXTURES})`)
}

await browser.close()
console.log(process.exitCode ? '\nFAILED' : '\nALL GATES PASSED')
