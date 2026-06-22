import { openApp, shot, FIXTURES } from '../_driver.mjs'
import { resolve } from 'node:path'
const OUTLINED = resolve(FIXTURES, 'Flyer Swift Vortragscoaching yellow BG bluer Border.pdf')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function menuFileItem(page, itemLabel, filePath) {
  const fc = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'File', exact: true }).click()
  await page.getByText(itemLabel, { exact: false }).last().click()
  const chooser = await fc
  await chooser.setFiles(filePath)
}

const { browser, page } = await openApp()

await menuFileItem(page, 'Open PDF...', OUTLINED)
await sleep(6000)
const before = await page.evaluate(() => ({
  badges: document.querySelectorAll('[data-role="mostly-outlined-badge"]').length,
  domMostlyOutlined: document.querySelector('g[data-layer-name]')?.getAttribute('data-mostly-outlined'),
}))
console.log('IMMEDIATELY AFTER primary import of outlined PDF:', JSON.stringify(before))

// Now poke the layers panel to force a refresh (toggle visibility eye then back)
const eye = await page.$('[data-testid="add-layer"]')
// Click the add-layer button which calls refreshLayers
await page.click('[data-testid="add-layer"]')
await sleep(800)
const after = await page.evaluate(() => ({
  badges: document.querySelectorAll('[data-role="mostly-outlined-badge"]').length,
}))
console.log('AFTER forcing a panel refresh (add-layer click):', JSON.stringify(after))
await shot(page, 'exp-pdf-import-confirm-after-refresh')

await browser.close()
console.log('DONE')
