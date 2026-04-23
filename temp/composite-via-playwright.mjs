// Drive a real user session through headed Chromium:
//   1. Open vectorfeld in a browser
//   2. File > Open PDF…   → noheader flyer (foreground / text)
//   3. File > Open PDF as Background Layer… → yellow-BG flyer (background / branded)
//   4. File > Export PDF → save composite to temp/
// Reuses the global @playwright/cli's bundled playwright. No project deps added.

import { chromium } from '/home/tobias/.nvm/versions/node/v24.11.1/lib/node_modules/@playwright/cli/node_modules/playwright/index.mjs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { existsSync, statSync } from 'node:fs'

const here = dirname(fileURLToPath(import.meta.url))
const FOREGROUND = resolve(here, 'Flyer Swift Vortragscoaching 15.04.2026 noheader.pdf')
const BACKGROUND = resolve(here, 'Flyer Swift Vortragscoaching yellow BG bluer Border.pdf')
const OUTPUT = resolve(here, 'composite.pdf')
const URL = process.env.URL || 'http://localhost:5173'

if (!existsSync(FOREGROUND) || !existsSync(BACKGROUND)) {
  console.error('Missing input fixtures in temp/')
  process.exit(1)
}

const browser = await chromium.launch({ headless: false })
const context = await browser.newContext({ acceptDownloads: true })
const page = await context.newPage()

// Surface page console logs (the cd2 console.warn lands here).
page.on('console', (msg) => console.log(`[page:${msg.type()}]`, msg.text()))
page.on('pageerror', (err) => console.error('[page:error]', err.message))

console.log(`[script] open ${URL}`)
await page.goto(URL, { waitUntil: 'networkidle' })

async function clickMenuItem(menu, item) {
  await page.getByRole('button', { name: menu, exact: true }).click()
  // Atrium TopBar exposes a standalone "Export PDF" accent button that
  // shares the name with the menu item. Prefer the item inside the open
  // dropdown when the name collides.
  await page.getByRole('button', { name: item, exact: true }).last().click()
}

async function importPdfVia(menuItem, filePath, expectedLayerCount) {
  const fcPromise = page.waitForEvent('filechooser')
  await clickMenuItem('File', menuItem)
  const chooser = await fcPromise
  await chooser.setFiles(filePath)
  // Wait for the import to settle. MuPDF + flatten can take a couple of seconds.
  // For background-layer mode the existing layer stays, so total count grows by 1;
  // for plain Open PDF it replaces, so total stays at 1.
  await page.waitForFunction(
    (expected) => {
      const layers = document.querySelectorAll('g[data-layer-name]')
      if (layers.length !== expected) return false
      // Also require at least one layer has content (not just a stub).
      return Array.from(layers).every((l) => l.children.length > 0)
    },
    expectedLayerCount,
    { timeout: 30000 }
  )
}

console.log('[script] import foreground PDF')
await importPdfVia('Open PDF...', FOREGROUND, 1)

const fgStats = await page.evaluate(() => {
  const layers = document.querySelectorAll('g[data-layer-name]')
  return Array.from(layers).map((l) => ({
    name: l.getAttribute('data-layer-name'),
    children: l.children.length,
    textChars: l.getAttribute('data-text-chars'),
    pathCount: l.getAttribute('data-path-count'),
    mostlyOutlined: l.getAttribute('data-mostly-outlined'),
  }))
})
console.log('[script] after foreground:', JSON.stringify(fgStats, null, 2))

console.log('[script] import background PDF')
await importPdfVia('Open PDF as Background Layer...', BACKGROUND, 2)

const bgStats = await page.evaluate(() => {
  const layers = document.querySelectorAll('g[data-layer-name]')
  return Array.from(layers).map((l) => ({
    name: l.getAttribute('data-layer-name'),
    children: l.children.length,
    textChars: l.getAttribute('data-text-chars'),
    pathCount: l.getAttribute('data-path-count'),
    mostlyOutlined: l.getAttribute('data-mostly-outlined'),
  }))
})
console.log('[script] after background:', JSON.stringify(bgStats, null, 2))

console.log('[script] Export PDF')
const downloadPromise = page.waitForEvent('download', { timeout: 60000 })
await clickMenuItem('File', 'Export PDF')
const download = await downloadPromise
await download.saveAs(OUTPUT)

const sz = statSync(OUTPUT).size
console.log(`[script] saved ${OUTPUT} (${sz} bytes)`)

// Visual verification artefacts:
//  - canvas screenshot from inside the editor (what the user sees pre-export)
//  - rendered PNG of the exported PDF (what the user gets post-export)
const canvasShot = resolve(here, 'composite-canvas.png')
await page.screenshot({ path: canvasShot, fullPage: true })
console.log(`[script] saved canvas screenshot ${canvasShot}`)

await browser.close()

// Render the exported PDF to PNG for side-by-side eyeballing.
const { renderPdfPageToPng } = await import('../test/roundtrip/helpers/renderPdf.ts')
const { readFileSync, writeFileSync } = await import('node:fs')
const png = await renderPdfPageToPng(new Uint8Array(readFileSync(OUTPUT)), { page: 1, scale: 2 })
const pngPath = resolve(here, 'composite-rendered.png')
writeFileSync(pngPath, png)
console.log(`[script] saved rendered PDF as ${pngPath} (${png.length} bytes)`)
console.log('[script] done')
