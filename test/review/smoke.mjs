import { openApp, shot, dumpLog } from './_driver.mjs'

const { browser, page, log } = await openApp()
// Baseline: empty app
await shot(page, 'smoke-01-boot')

// Probe key UI surfaces exist
const probe = await page.evaluate(() => {
  const q = (s) => !!document.querySelector(s)
  return {
    canvasRoot: q('[data-role="canvas-root"]'),
    selectActive: q('[data-tool-slot="select"][data-active="true"]'),
    toolSlots: document.querySelectorAll('[data-tool-slot]').length,
    topbarButtons: Array.from(document.querySelectorAll('button')).map(b => b.textContent?.trim()).filter(Boolean).slice(0, 30),
    title: document.title,
  }
})
console.log('PROBE:', JSON.stringify(probe, null, 2))

dumpLog(log)
await browser.close()
console.log('SMOKE OK')
