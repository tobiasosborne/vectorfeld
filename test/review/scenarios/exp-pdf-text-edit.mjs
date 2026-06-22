import { openApp, shot, dumpLog, FIXTURES } from '../_driver.mjs'
import { resolve } from 'node:path'
import { readFileSync, writeFileSync } from 'node:fs'

const FG = resolve(FIXTURES, 'Flyer Swift Vortragscoaching 15.04.2026 noheader.pdf')
const { browser, page, log } = await openApp()
const OUT = resolve(process.cwd(), 'test/review/shots')

async function renderExport(tag) {
  const dl = page.waitForEvent('download', { timeout: 60000 })
  await page.getByRole('button', { name: 'Export PDF', exact: true }).last().click()
  const download = await dl.catch(() => null)
  if (!download) { console.log(`[${tag}] NO DOWNLOAD`); return }
  const out = resolve(OUT, `exp-pdf-text-edit-${tag}.pdf`)
  await download.saveAs(out)
  try {
    const { renderPdfPageToPng } = await import('../../roundtrip/helpers/renderPdf.ts')
    const png = await renderPdfPageToPng(new Uint8Array(readFileSync(out)), { page: 1, scale: 2 })
    writeFileSync(resolve(OUT, `exp-pdf-text-edit-${tag}-render.png`), png)
    console.log(`[${tag}] exported + rendered`)
  } catch (e) { console.log(`[${tag}] render failed`, e.message) }
}

async function openPdf(menuItem, file) {
  const fc = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'File', exact: true }).click()
  await page.getByRole('button', { name: menuItem, exact: true }).last().click()
  const chooser = await fc
  await chooser.setFiles(file)
  await page.waitForFunction(() => {
    const ls = document.querySelectorAll('g[data-layer-name]')
    return ls.length >= 1 && Array.from(ls).some(l => l.children.length > 0)
  }, { timeout: 40000 }).catch(() => {})
  await page.waitForTimeout(1000)
}

await openPdf('Open PDF...', FG)
await shot(page, 'exp-pdf-text-edit-00-imported')

// Inventory the DOM: how is text structured?
const inv = await page.evaluate(() => {
  const layers = Array.from(document.querySelectorAll('g[data-layer-name]'))
  const texts = Array.from(document.querySelectorAll('g[data-layer-name] text'))
  const tspans = Array.from(document.querySelectorAll('g[data-layer-name] text tspan'))
  // sample text fragment lengths
  const sample = texts.slice(0, 15).map(t => ({
    chars: (t.textContent || '').length,
    txt: (t.textContent || '').slice(0, 12),
    parent: t.parentElement?.tagName,
    parentHasLayer: t.parentElement?.hasAttribute('data-layer-name'),
  }))
  return {
    layerCount: layers.length,
    textCount: texts.length,
    tspanCount: tspans.length,
    avgChars: texts.length ? (texts.reduce((a, t) => a + (t.textContent || '').length, 0) / texts.length).toFixed(2) : 0,
    sample,
  }
})
console.log('INVENTORY:', JSON.stringify(inv, null, 2))

// Find a target text run containing recognizable content
const target = await page.evaluate(() => {
  const texts = Array.from(document.querySelectorAll('g[data-layer-name] text'))
  let el = texts.find(t => (t.textContent || '').trim().length >= 2) || texts[0]
  if (!el) return null
  const r = el.getBoundingClientRect()
  return {
    text: (el.textContent || ''),
    fill: el.getAttribute('fill'),
    x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height,
  }
})
console.log('TARGET:', JSON.stringify(target))
if (!target) { console.log('NO TEXT'); dumpLog(log); await browser.close(); process.exit(0) }

function snap() {
  return page.evaluate(() => ({
    selBoxes: document.querySelectorAll('[data-role="selection-box"]').length,
    editing: !!document.querySelector('[contenteditable="true"], textarea')
      || (document.activeElement && (document.activeElement.tagName === 'TEXTAREA')),
    activeTag: document.activeElement?.tagName,
    selectedTag: (() => {
      // What did we select? read inspector heading + look for font section
      const insp = document.querySelector('[data-testid="inspector"]')
      return insp ? insp.innerText.slice(0, 260) : null
    })(),
    hasFontSection: !!Array.from(document.querySelectorAll('[data-testid="inspector"] *'))
      .find(e => e.textContent === 'Font'),
    hasTextContentField: !!document.querySelector('[data-testid="inspector"] textarea')
      || !!Array.from(document.querySelectorAll('[data-testid="inspector"] *'))
        .find(e => /content|text content/i.test(e.textContent || '') && (e.textContent || '').length < 30),
  }))
}

// === PATH A: select tool, single click ===
await page.keyboard.press('v'); await page.waitForTimeout(100)
await page.mouse.click(target.x, target.y)
await page.waitForTimeout(300)
await shot(page, 'exp-pdf-text-edit-01-singleclick')
console.log('A) SINGLE CLICK:', JSON.stringify(await snap()))

// What exact element did the click select?
const selectedInfo = await page.evaluate(() => {
  const sel = document.querySelector('[data-selected="true"], [data-role="selection-box"]')
  // Look for element flagged selected; vectorfeld marks via selection module
  const layers = document.querySelectorAll('g[data-layer-name]')
  // attempt: read which DOM node has selection styling
  const all = Array.from(document.querySelectorAll('g[data-layer-name] *'))
  const selected = all.filter(e => e.getAttribute('data-selected') === 'true')
  return {
    selectedTags: selected.map(e => e.tagName + (e.hasAttribute('data-layer-name') ? '[layer]' : '')),
    note: sel ? 'box present' : 'no box',
  }
})
console.log('A) SELECTED DOM:', JSON.stringify(selectedInfo))

// === PATH B: double-click to enter edit mode ===
await page.mouse.dblclick(target.x, target.y)
await page.waitForTimeout(400)
await shot(page, 'exp-pdf-text-edit-02-dblclick')
console.log('B) DOUBLE CLICK:', JSON.stringify(await snap()))
// try typing right after dbl-click
await page.keyboard.type('XYZ', { delay: 30 })
await page.waitForTimeout(200)
const afterTypeB = await page.evaluate((orig) => {
  const texts = Array.from(document.querySelectorAll('g[data-layer-name] text'))
  return { changed: !texts.some(t => (t.textContent || '') === orig), first6: texts.slice(0, 6).map(t => (t.textContent || '').slice(0, 14)) }
}, target.text)
console.log('B) AFTER TYPE XYZ:', JSON.stringify(afterTypeB))
await page.keyboard.press('Escape'); await page.waitForTimeout(150)

// === PATH C: Text tool clicked over existing text ===
await page.keyboard.press('v'); await page.waitForTimeout(100)
await page.mouse.click(700, 800) // deselect in empty area
await page.waitForTimeout(150)
await page.keyboard.press('t'); await page.waitForTimeout(150)
await page.mouse.click(target.x, target.y)
await page.waitForTimeout(300)
await shot(page, 'exp-pdf-text-edit-03-texttool-over')
console.log('C) TEXT TOOL OVER:', JSON.stringify(await snap()))
await page.keyboard.type('Typo fix', { delay: 25 })
await page.waitForTimeout(200)
await shot(page, 'exp-pdf-text-edit-03b-texttool-typed')
await page.keyboard.press('Escape'); await page.waitForTimeout(200)
const afterC = await page.evaluate(() => {
  const texts = Array.from(document.querySelectorAll('g[data-layer-name] text'))
  return { count: texts.length, last: texts.slice(-3).map(t => (t.textContent || '').slice(0, 16)) }
})
console.log('C) AFTER TEXT TOOL:', JSON.stringify(afterC))
await renderExport('C-texttool')

// === PATH D: RECOLOR via Properties (gate-10) ===
await page.keyboard.press('v'); await page.waitForTimeout(100)
await page.mouse.click(700, 800); await page.waitForTimeout(100)
await page.mouse.click(target.x, target.y); await page.waitForTimeout(300)
const fillBefore = await page.evaluate((t) => {
  const texts = Array.from(document.querySelectorAll('g[data-layer-name] text'))
  const el = texts.find(x => (x.textContent || '').includes(t)) || texts[0]
  return { fill: el?.getAttribute('fill'), parentFill: el?.parentElement?.getAttribute('fill') }
}, target.text.slice(0, 6))
console.log('D) FILL BEFORE:', JSON.stringify(fillBefore))
// Try the inspector fill color picker
const recolorDone = await page.evaluate(() => {
  const fillType = document.querySelector('[data-testid="fill-type"]')
  const colorInput = document.querySelector('[data-testid="fill"] input[type="color"], input[data-testid="fill"], [data-testid="inspector"] input[type="color"]')
  return { hasFillType: !!fillType, hasColorInput: !!colorInput }
})
console.log('D) inspector fill controls:', JSON.stringify(recolorDone))
// set color via the color input directly if present
const setColor = await page.evaluate(() => {
  const inputs = Array.from(document.querySelectorAll('[data-testid="inspector"] input'))
  const colorInput = inputs.find(i => i.type === 'color') || inputs.find(i => /^#?[0-9a-fA-F]{3,6}$/.test(i.value))
  if (!colorInput) return { ok: false, reason: 'no color input in inspector' }
  return { ok: true, type: colorInput.type, value: colorInput.value }
})
console.log('D) color input:', JSON.stringify(setColor))
// Use playwright to actually drive the color: find inspector color picker text input
try {
  const hexInputs = await page.locator('[data-testid="inspector"] input[type="text"]').all()
  // try the fill hex field via the ColorPicker testid
  const fillPicker = page.locator('[data-testid="fill"]')
  if (await fillPicker.count() > 0) {
    const ci = fillPicker.locator('input[type="color"]')
    if (await ci.count() > 0) {
      await ci.first().evaluate((el) => { el.value = '#ff0000'; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })) })
    }
  }
} catch (e) { console.log('D) recolor drive err', e.message) }
await page.waitForTimeout(300)
await shot(page, 'exp-pdf-text-edit-04-recolor')
const fillAfter = await page.evaluate((t) => {
  const texts = Array.from(document.querySelectorAll('g[data-layer-name] text'))
  const el = texts.find(x => (x.textContent || '').includes(t)) || texts[0]
  return { fill: el?.getAttribute('fill'), parentFill: el?.parentElement?.getAttribute('fill') }
}, target.text.slice(0, 6))
console.log('D) FILL AFTER:', JSON.stringify(fillAfter))
await renderExport('D-recolor')

// === PATH E: DELETE a text run (gate-06) ===
await page.keyboard.press('v'); await page.waitForTimeout(100)
await page.mouse.click(700, 800); await page.waitForTimeout(100)
const beforeDelCount = await page.evaluate(() => document.querySelectorAll('g[data-layer-name] text').length)
await page.mouse.click(target.x, target.y); await page.waitForTimeout(250)
await page.keyboard.press('Delete'); await page.waitForTimeout(300)
await shot(page, 'exp-pdf-text-edit-05-delete')
const afterDel = await page.evaluate(() => ({
  textCount: document.querySelectorAll('g[data-layer-name] text').length,
  selBoxes: document.querySelectorAll('[data-role="selection-box"]').length,
}))
console.log('E) DELETE before/after textCount:', beforeDelCount, '->', JSON.stringify(afterDel))
await renderExport('E-delete')
// undo the delete so move test has the element
await page.keyboard.press('Control+z'); await page.waitForTimeout(300)

// === PATH F: MOVE a text run ===
await page.keyboard.press('v'); await page.waitForTimeout(100)
await page.mouse.click(700, 800); await page.waitForTimeout(100)
const t2 = await page.evaluate(() => {
  const texts = Array.from(document.querySelectorAll('g[data-layer-name] text'))
  const el = texts.find(t => (t.textContent || '').trim().length >= 2) || texts[0]
  const r = el.getBoundingClientRect()
  return { x: r.x + r.width / 2, y: r.y + r.height / 2, beforeX: el.getAttribute('x') }
})
await page.mouse.move(t2.x, t2.y); await page.mouse.down()
await page.mouse.move(t2.x + 120, t2.y + 60, { steps: 8 })
await page.mouse.up(); await page.waitForTimeout(300)
await shot(page, 'exp-pdf-text-edit-06-move')
const afterMove = await page.evaluate((bx) => {
  const texts = Array.from(document.querySelectorAll('g[data-layer-name] text'))
  return { sample: texts.slice(0, 3).map(t => ({ x: t.getAttribute('x')?.slice?.(0, 20), transform: t.getAttribute('transform') })) }
}, t2.beforeX)
console.log('F) AFTER MOVE:', JSON.stringify(afterMove))
await renderExport('F-move')

dumpLog(log)
await browser.close()
console.log('EXP-PDF-TEXT-EDIT DONE')
