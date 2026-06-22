import { openApp, shot, dumpLog, FIXTURES } from '../_driver.mjs'
import { resolve } from 'node:path'

const EDITABLE = resolve(FIXTURES, 'Flyer Swift Vortragscoaching 15.04.2026 noheader.pdf')
const OUTLINED = resolve(FIXTURES, 'Flyer Swift Vortragscoaching yellow BG bluer Border.pdf')
const SVG_FIXTURE = resolve(FIXTURES, '..', '..', 'golden', 'milestones', 'fixtures', '02-filled-circle.svg')
const PNG_FIXTURE = '/tmp/exp-pdf-import-test.png'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Read layer stats from the live DOM.
async function layerStats(page) {
  return page.evaluate(() => {
    const layers = Array.from(document.querySelectorAll('g[data-layer-name]'))
    const svg = document.querySelector('svg[viewBox]')
    return {
      viewBox: svg?.getAttribute('viewBox') || null,
      layerCount: layers.length,
      layers: layers.map((l) => ({
        name: l.getAttribute('data-layer-name'),
        kids: l.children.length,
        textChars: l.getAttribute('data-text-chars'),
        pathCount: l.getAttribute('data-path-count'),
        mostlyOutlined: l.getAttribute('data-mostly-outlined'),
        textEls: l.querySelectorAll('text').length,
        pathEls: l.querySelectorAll('path').length,
        imageEls: l.querySelectorAll('image').length,
      })),
      badges: document.querySelectorAll('[data-role="mostly-outlined-badge"]').length,
      panelText: document.querySelector('[data-testid="inspector"]')?.innerText?.slice(0, 200) || null,
    }
  })
}

// Trigger a File-menu item that opens a file picker, then feed it a file.
async function menuFileItem(page, itemLabel, filePath) {
  const fc = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'File', exact: true }).click()
  await page.getByText(itemLabel, { exact: false }).last().click()
  const chooser = await fc
  await chooser.setFiles(filePath)
}

const { browser, page, log } = await openApp()

console.log('\n##### STEP 0: baseline empty doc')
console.log(JSON.stringify(await layerStats(page), null, 2))
await shot(page, 'exp-pdf-import-00-baseline')

console.log('\n##### STEP 1: Open PDF (editable flyer) — REPLACE semantics expected')
await menuFileItem(page, 'Open PDF...', EDITABLE)
await sleep(4000)
const s1 = await layerStats(page)
console.log(JSON.stringify(s1, null, 2))
await shot(page, 'exp-pdf-import-01-editable')

console.log('\n##### STEP 2: Open PDF AGAIN (same editable) — replace or append?')
await menuFileItem(page, 'Open PDF...', EDITABLE)
await sleep(4000)
const s2 = await layerStats(page)
console.log(JSON.stringify(s2, null, 2))
await shot(page, 'exp-pdf-import-02-editable-twice')

console.log('\n##### STEP 3: Open the OUTLINED flyer — expect mostly-outlined badge')
await menuFileItem(page, 'Open PDF...', OUTLINED)
await sleep(6000)
const s3 = await layerStats(page)
console.log(JSON.stringify(s3, null, 2))
await shot(page, 'exp-pdf-import-03-outlined')
// Look at the layers panel area specifically for the badge
const layersPanelText = await page.evaluate(() => document.querySelector('[data-testid="add-layer"]')?.closest('[class],div')?.parentElement?.innerText || document.body.innerText.slice(0,400))
console.log('LAYERS PANEL TEXT:', JSON.stringify(layersPanelText.slice(0, 400)))

console.log('\n##### STEP 4: Try undo after PDF import — is import undoable?')
await page.keyboard.press('Control+z')
await sleep(1500)
const s4 = await layerStats(page)
console.log('after one undo:', JSON.stringify(s4.layers.map(l=>({n:l.name,k:l.kids})), null, 2), 'vb', s4.viewBox)
await shot(page, 'exp-pdf-import-04-after-undo')

console.log('\n##### STEP 5: reload + Open editable, then Background Layer (compositing)')
await page.reload({ waitUntil: 'networkidle' })
await sleep(1000)
await menuFileItem(page, 'Open PDF...', EDITABLE)
await sleep(4000)
const s5a = await layerStats(page)
console.log('after primary editable:', JSON.stringify(s5a.layers.map(l=>({n:l.name,k:l.kids,mo:l.mostlyOutlined})), null, 2))
await menuFileItem(page, 'Open PDF as Background Layer...', OUTLINED)
await sleep(6000)
const s5b = await layerStats(page)
console.log('after bg outlined:', JSON.stringify(s5b, null, 2))
await shot(page, 'exp-pdf-import-05-composite')

console.log('\n##### STEP 6: Place Image (PNG) onto the composite')
await menuFileItem(page, 'Place Image...', PNG_FIXTURE)
await sleep(2000)
const s6 = await layerStats(page)
console.log('after place image:', JSON.stringify(s6.layers.map(l=>({n:l.name,k:l.kids,img:l.imageEls})), null, 2))
await shot(page, 'exp-pdf-import-06-place-image')

console.log('\n##### STEP 7: Open SVG (replaces everything?)')
await menuFileItem(page, 'Open SVG...', SVG_FIXTURE)
await sleep(2500)
const s7 = await layerStats(page)
console.log('after open svg:', JSON.stringify(s7, null, 2))
await shot(page, 'exp-pdf-import-07-open-svg')

console.log('\n##### STEP 8: reload + Background Layer FIRST (no primary content)')
await page.reload({ waitUntil: 'networkidle' })
await sleep(1000)
await menuFileItem(page, 'Open PDF as Background Layer...', OUTLINED)
await sleep(6000)
const s8 = await layerStats(page)
console.log('bg-first:', JSON.stringify(s8, null, 2))
await shot(page, 'exp-pdf-import-08-bg-first')

dumpLog(log)
await browser.close()
console.log('\nDONE')
