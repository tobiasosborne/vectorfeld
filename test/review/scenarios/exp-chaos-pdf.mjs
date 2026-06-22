import { openApp, shot, dumpLog, FIXTURES } from '../_driver.mjs'
import { resolve } from 'node:path'
const { browser, page, log } = await openApp()
const svg = await page.evaluate(() => { const s = document.querySelector('[data-testid="canvas-container"] svg'); const r = s.getBoundingClientRect(); return { x: r.x, y: r.y } })
const OX = svg.x, OY = svg.y
async function tool(l) { await page.keyboard.press(l); await page.waitForTimeout(60) }
async function drag(x1, y1, x2, y2) {
  await page.mouse.move(OX + x1, OY + y1); await page.mouse.down()
  for (let i = 1; i <= 5; i++) { await page.mouse.move(OX + x1 + (x2 - x1) * i / 5, OY + y1 + (y2 - y1) * i / 5); await page.waitForTimeout(8) }
  await page.mouse.up(); await page.waitForTimeout(70)
}
async function st() { return await page.evaluate(() => ({ layerKids: document.querySelector('g[data-layer-name]')?.children.length ?? -1, selBoxes: document.querySelectorAll('[data-role="selection-box"]').length, insp: (document.querySelector('[data-testid="inspector"]')?.innerText || '').replace(/\s+/g, ' ').slice(0, 60) })) }
async function openMenu(n) { await page.getByRole('button', { name: n, exact: true }).click(); await page.waitForTimeout(80) }
async function menuItem(n) { await page.locator('button', { has: page.locator('span', { hasText: new RegExp('^' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }) }).last().click(); await page.waitForTimeout(100) }

// Draw a few shapes first (existing content)
for (let i = 0; i < 3; i++) { await tool('r'); await drag(40 + i * 90, 60, 110 + i * 90, 130) }
await tool('v')
console.log('existing content:', JSON.stringify(await st()))

// Import PDF mid-session
const pdf = resolve(FIXTURES, 'Flyer Swift Vortragscoaching 15.04.2026 noheader.pdf')
const fc = page.waitForEvent('filechooser')
await openMenu('File'); await menuItem('Open PDF...')
const c = await fc; await c.setFiles(pdf); await page.waitForTimeout(3000)
console.log('after import:', JSON.stringify(await st()))
await shot(page, 'exp-chaos-pdf-01-imported')
console.log('  >> did existing 3 shapes survive? (kids should be >3 if PDF added, OR ==pdf count if replaced)')

// Check pages
const pages = await page.evaluate(() => {
  const nav = document.querySelector('[data-role="page-nav"]')
  return nav ? nav.innerText.replace(/\s+/g, ' ') : 'no page-nav'
})
console.log('page nav:', pages)

// Now chaos on it: select-all, undo, redo
await tool('v'); await page.keyboard.press('Control+a'); await page.waitForTimeout(100)
console.log('select-all after import:', JSON.stringify(await st()))
await shot(page, 'exp-chaos-pdf-02-selectall')
await page.keyboard.press('Control+z'); await page.waitForTimeout(150)
console.log('undo after import (does it remove PDF? restore old shapes?):', JSON.stringify(await st()))
await shot(page, 'exp-chaos-pdf-03-undo')
await page.keyboard.press('Control+Shift+Z'); await page.waitForTimeout(150)
console.log('redo:', JSON.stringify(await st()))

// Export and confirm no crash
try {
  const dl = page.waitForEvent('download', { timeout: 15000 })
  await openMenu('File'); await menuItem('Export PDF')
  const d = await dl; await d.saveAs(resolve(FIXTURES, '..', '..', 'review', 'shots', 'exp-chaos-pdf-export.pdf'))
  await page.waitForTimeout(300); console.log('export ok')
} catch (e) { console.log('export FAILED:', e.message) }
await shot(page, 'exp-chaos-pdf-04-final')

dumpLog(log)
await browser.close()
console.log('PDF CHAOS DONE')
