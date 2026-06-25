// Regression scenario for vectorfeld-3yu.10:
// Document Setup "Apply" must actually resize the page (artboard rect + viewBox),
// not just update React state. Prepared by the 3yu.10 fix; run headed via the
// review driver. PASS criteria printed at the end.
import { openApp, shot, dumpLog } from '../_driver.mjs'

const { browser, page, log } = await openApp()

// File-menu helper (idiom borrowed from exp-save-open.mjs).
async function fileMenuItem(name) {
  await page.getByRole('button', { name: 'File', exact: true }).click()
  await page.waitForTimeout(150)
  await page
    .locator('button', {
      has: page.locator('span', {
        hasText: new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      }),
    })
    .last()
    .click()
  await page.waitForTimeout(200)
}

async function snap() {
  return await page.evaluate(() => {
    const svg =
      document.querySelector('[data-role="canvas-root"] svg') ||
      document.querySelector('svg')
    const vb = svg ? svg.getAttribute('viewBox') : null
    const ab = document.querySelector('[data-role="artboard"]')
    return {
      viewBox: vb,
      vbWidth: vb ? parseFloat(vb.split(/\s+/)[2]) : null,
      abWidth: ab ? parseFloat(ab.getAttribute('width')) : null,
      abHeight: ab ? parseFloat(ab.getAttribute('height')) : null,
    }
  })
}

const before = await snap()
console.log('BEFORE:', JSON.stringify(before))
await shot(page, 'doc-setup-00-before')

// Open Document Setup, choose the "Square 100" preset, Apply.
await fileMenuItem('Document Setup')
const dialogVisible = await page
  .locator('[data-testid="artboard-dialog"]')
  .isVisible()
  .catch(() => false)
console.log('dialog visible?', dialogVisible)
await shot(page, 'doc-setup-01-dialog')

await page.getByRole('button', { name: 'Square 100', exact: true }).click()
await page.waitForTimeout(120)
const wVal = await page.locator('[data-testid="artboard-width"]').inputValue()
const hVal = await page.locator('[data-testid="artboard-height"]').inputValue()
console.log('dialog inputs after preset: width=', wVal, 'height=', hVal)

await page.locator('[data-testid="artboard-apply"]').click()
await page.waitForTimeout(400)

const after = await snap()
console.log('AFTER:', JSON.stringify(after))
await shot(page, 'doc-setup-02-after')

// Assertions: artboard rect resized to ~100 and the viewBox shrank.
const abOk = after.abWidth !== null && Math.abs(after.abWidth - 100) < 0.5 &&
             Math.abs(after.abHeight - 100) < 0.5
const vbShrank = before.vbWidth !== null && after.vbWidth !== null &&
                 after.vbWidth < before.vbWidth
console.log(`ASSERT artboard 100x100: ${abOk ? 'PASS' : 'FAIL'} (w=${after.abWidth}, h=${after.abHeight})`)
console.log(`ASSERT viewBox shrank:   ${vbShrank ? 'PASS' : 'FAIL'} (${before.vbWidth} -> ${after.vbWidth})`)
console.log(`RESULT: ${abOk && vbShrank ? 'PASS' : 'FAIL'}`)

dumpLog(log)
await browser.close()
console.log('DOC-SETUP-RESIZE DONE')
