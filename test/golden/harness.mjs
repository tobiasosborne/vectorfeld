// Shared browser/page/export capture helpers for golden-master stories.
//
// Each story file exports { name, run(page, helpers) } and returns a
// { svg, pdf } result (Uint8Array / string). The runner (run.mjs) handles
// canonicalization and master comparison — stories only drive the UI.

import { chromium } from '/home/tobias/.nvm/versions/node/v24.11.1/lib/node_modules/@playwright/cli/node_modules/playwright/index.mjs'
import { readFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { createServer } from 'node:net'

const DEFAULT_URL = process.env.URL || 'http://localhost:5173'

export async function waitForHttp(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const resp = await fetch(url, { method: 'HEAD' })
      if (resp.ok || resp.status === 200) return
    } catch {}
    await delay(200)
  }
  throw new Error(`timeout waiting for ${url}`)
}

async function isPortOpen(port) {
  return new Promise((resolve) => {
    const srv = createServer()
    srv.once('error', () => resolve(false))
    srv.once('listening', () => srv.close(() => resolve(true)))
    srv.listen(port, '127.0.0.1')
  })
}

export async function ensureDevServer(url = DEFAULT_URL) {
  const port = Number(new URL(url).port || 5173)
  const free = await isPortOpen(port)
  if (!free) {
    // Something is listening — assume vite is already up. Verify with a HEAD.
    await waitForHttp(url, 5000)
    return { started: false, child: null }
  }
  // Nothing listening — spawn npm run dev and wait for it.
  const child = spawn('npm', ['run', 'dev', '--', '--port', String(port)], {
    cwd: '/home/tobias/Projects/vectorfeld',
    stdio: 'pipe',
    detached: false,
  })
  child.stdout.on('data', (d) => process.env.VERBOSE && process.stdout.write(`[vite] ${d}`))
  child.stderr.on('data', (d) => process.stderr.write(`[vite:err] ${d}`))
  await waitForHttp(url, 45000)
  return { started: true, child }
}

export async function launchBrowser() {
  return chromium.launch({
    headless: process.env.HEADLESS !== 'false' ? false : false, // always headed per the rule
    args: [
      '--force-color-profile=srgb',
      '--font-render-hinting=none',
      '--disable-gpu-vsync',
      '--disable-background-timer-throttling',
    ],
  })
}

export async function openPage(browser, url = DEFAULT_URL) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    // pixel ratio pinned so canvas coordinates map consistently
    deviceScaleFactor: 1,
  })
  const page = await context.newPage()
  page.on('pageerror', (err) => console.error('[page:error]', err.message))
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error('[console:error]', msg.text())
  })
  await page.goto(url, { waitUntil: 'networkidle' })
  // Wait for the canvas + Select tool active marker
  await page.waitForFunction(
    () => !!document.querySelector('[data-tool-slot="select"][data-active="true"]'),
    { timeout: 10000 },
  )
  return page
}

// ---- Story helpers (passed to each story's run()) ----

export function makeHelpers(page) {
  return {
    page,

    async clickTool(slotKey) {
      await page.locator(`[data-tool-slot="${slotKey}"]`).click()
      await page.waitForFunction(
        (k) => !!document.querySelector(`[data-tool-slot="${k}"][data-active="true"]`),
        slotKey,
        { timeout: 3000 },
      )
    },

    async canvasBox() {
      const box = await page.locator('[data-role="canvas-root"]').boundingBox()
      if (!box) throw new Error('canvas-root not found')
      return box
    },

    // Drag from (x1,y1) to (x2,y2) in canvas-relative coordinates (pixels
    // from canvas top-left). The tool's mouse handlers fire left-button
    // events; waitForTimeout between moves lets RAF-driven previews settle.
    async dragOnCanvas(x1, y1, x2, y2) {
      const box = await page.locator('[data-role="canvas-root"]').boundingBox()
      if (!box) throw new Error('canvas-root not found')
      await page.mouse.move(box.x + x1, box.y + y1)
      await page.mouse.down()
      await page.waitForTimeout(50)
      // Move in 5 steps so tool preview gets intermediate events
      const STEPS = 5
      for (let i = 1; i <= STEPS; i++) {
        const t = i / STEPS
        await page.mouse.move(box.x + x1 + (x2 - x1) * t, box.y + y1 + (y2 - y1) * t)
        await page.waitForTimeout(10)
      }
      await page.mouse.up()
      await page.waitForTimeout(100)
    },

    async clickOnCanvas(x, y) {
      const box = await page.locator('[data-role="canvas-root"]').boundingBox()
      if (!box) throw new Error('canvas-root not found')
      await page.mouse.click(box.x + x, box.y + y)
      await page.waitForTimeout(50)
    },

    async openFileMenu() {
      await page.getByRole('button', { name: 'File', exact: true }).click()
    },

    async closeAnyMenu() {
      await page.keyboard.press('Escape').catch(() => {})
      await page.waitForTimeout(50)
    },

    // Trigger Export SVG via File menu and capture the downloaded bytes.
    async captureExportSvg() {
      const downloadPromise = page.waitForEvent('download')
      await page.getByRole('button', { name: 'File', exact: true }).click()
      await page.getByText('Export SVG', { exact: true }).click()
      const download = await downloadPromise
      const path = await download.path()
      return readFileSync(path, 'utf8')
    },

    // Trigger Export PDF via the TopBar button (also available in File menu
    // but the button is disambiguated so clicks land cleanly) and return the
    // downloaded bytes as Uint8Array.
    async captureExportPdf() {
      const downloadPromise = page.waitForEvent('download')
      // The button lives in TopBar; File menu has the same label. Use .last()
      // to land on the top-right button consistently.
      await page.getByRole('button', { name: 'Export PDF', exact: true }).last().click()
      const download = await downloadPromise
      const path = await download.path()
      return new Uint8Array(readFileSync(path))
    },

    async typeText(text) {
      await page.keyboard.type(text, { delay: 10 })
    },

    // Fill the Frame section of the ControlBar with exact numeric values.
    // Requires an element to be selected (ControlBar only shows when selection
    // is non-empty). Each input commits on Enter. Undefined values are skipped.
    async setFrame({ x, y, w, h: frameH, r } = {}) {
      const fill = async (key, val) => {
        if (val == null) return
        const loc = page.locator(`[data-testid="${key}"]`)
        const count = await loc.count()
        if (count === 0) throw new Error(`frame input ${key} not found (selection empty?)`)
        await loc.click()
        await page.keyboard.press('Control+A')
        await loc.fill(String(val))
        await loc.press('Enter')
        await page.waitForTimeout(30)
      }
      await fill('frame-x', x)
      await fill('frame-y', y)
      await fill('frame-w', w)
      await fill('frame-h', frameH)
      await fill('frame-r', r)
    },

    async press(key) {
      await page.keyboard.press(key)
      await page.waitForTimeout(30)
    },

    // Reset the document to empty state between stories by reloading.
    // We rely on a fresh page.goto in the runner between stories rather
    // than this helper, but it is here for stories that want mid-run reset.
    async reload() {
      await page.reload({ waitUntil: 'networkidle' })
      await page.waitForFunction(
        () => !!document.querySelector('[data-tool-slot="select"][data-active="true"]'),
        { timeout: 10000 },
      )
    },
  }
}
