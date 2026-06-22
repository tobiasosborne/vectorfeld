// Shared experiential-review driver. Reusable by review agents.
// Launches headed Chromium (global @playwright/cli's bundled playwright),
// opens the app, wires console/error/network capture, and exposes helpers.
//
// Usage from a scenario script:
//   import { openApp, shot, dumpLog } from './_driver.mjs'
//   const { page, browser, log } = await openApp()
//   ... drive ...
//   await shot(page, 'name')
//   dumpLog(log); await browser.close()

import { chromium } from '/home/tobias/.nvm/versions/node/v24.11.1/lib/node_modules/@playwright/cli/node_modules/playwright/index.mjs'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
export const SHOT_DIR = resolve(here, 'shots')
export const FIXTURES = resolve(here, '..', 'dogfood', 'fixtures')
const URL = process.env.URL || 'http://localhost:5173'

mkdirSync(SHOT_DIR, { recursive: true })

export async function openApp(opts = {}) {
  const log = { console: [], pageerrors: [], requestfailed: [] }
  const browser = await chromium.launch({
    headless: process.env.HEADLESS === 'true' ? true : false,
    args: ['--force-color-profile=srgb', '--font-render-hinting=none'],
  })
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    acceptDownloads: true,
  })
  const page = await context.newPage()
  page.on('console', (m) => log.console.push({ type: m.type(), text: m.text() }))
  page.on('pageerror', (e) => log.pageerrors.push(e.message))
  page.on('requestfailed', (r) => log.requestfailed.push(`${r.url()} :: ${r.failure()?.errorText}`))
  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.waitForFunction(
    () => !!document.querySelector('[data-tool-slot="select"][data-active="true"]'),
    { timeout: 15000 },
  ).catch(() => {})
  return { browser, context, page, log }
}

export async function shot(page, name) {
  const p = resolve(SHOT_DIR, `${name}.png`)
  await page.screenshot({ path: p, fullPage: false })
  return p
}

export function dumpLog(log) {
  const errs = log.console.filter((c) => c.type === 'error')
  console.log(`\n=== CONSOLE ERRORS (${errs.length}) ===`)
  errs.forEach((e) => console.log('  [err]', e.text))
  console.log(`=== PAGE ERRORS (${log.pageerrors.length}) ===`)
  log.pageerrors.forEach((e) => console.log('  [pageerror]', e))
  console.log(`=== FAILED REQUESTS (${log.requestfailed.length}) ===`)
  log.requestfailed.forEach((e) => console.log('  [reqfail]', e))
}
