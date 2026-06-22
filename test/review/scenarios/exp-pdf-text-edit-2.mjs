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
  const out = resolve(OUT, `exp-pdf-text-edit2-${tag}.pdf`)
  await download.saveAs(out)
  try {
    const { renderPdfPageToPng } = await import('../../roundtrip/helpers/renderPdf.ts')
    const png = await renderPdfPageToPng(new Uint8Array(readFileSync(out)), { page: 1, scale: 2 })
    writeFileSync(resolve(OUT, `exp-pdf-text-edit2-${tag}-render.png`), png)
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

// Find the VISIBLE heading "Kurzfristige" text run on screen
const target = await page.evaluate(() => {
  const texts = Array.from(document.querySelectorAll('g[data-layer-name] text'))
  // find text run whose rect is within viewport and has the heading content
  const cands = texts.map(t => {
    const r = t.getBoundingClientRect()
    return { t, r, txt: (t.textContent || '') }
  }).filter(c => c.r.top > 60 && c.r.bottom < 880 && c.r.left > 50 && c.r.width > 4)
  // prefer the big heading "Kurzfristige"
  let pick = cands.find(c => c.txt.includes('Kurzfristige'))
    || cands.find(c => c.txt.includes('Ich entlaste'))
    || cands.find(c => c.txt.trim().length > 4)
    || cands[0]
  if (!pick) return null
  const r = pick.r
  return {
    text: pick.txt, fill: pick.t.getAttribute('fill'),
    fontSize: pick.t.getAttribute('font-size'),
    cx: r.x + r.width / 2, cy: r.y + r.height / 2, w: r.width, h: r.height,
    parentTag: pick.t.parentElement?.tagName,
    parentHasLayer: pick.t.parentElement?.hasAttribute('data-layer-name'),
  }
})
console.log('VISIBLE TARGET:', JSON.stringify(target))
if (!target) { console.log('NO VISIBLE TEXT'); dumpLog(log); await browser.close(); process.exit(0) }

function snap(label) {
  return page.evaluate((lbl) => {
    const insp = document.querySelector('[data-testid="inspector"]')
    return {
      label: lbl,
      selBoxes: document.querySelectorAll('[data-role="selection-box"]').length,
      activeTag: document.activeElement?.tagName,
      hasFontSection: !!Array.from(document.querySelectorAll('[data-testid="inspector"] *'))
        .find(e => e.textContent === 'Font'),
      inspectorHead: insp ? insp.innerText.split('\n').slice(0, 2).join(' | ') : null,
    }
  }, label)
}

// === PATH A: single click on visible heading ===
await page.keyboard.press('v'); await page.waitForTimeout(100)
await page.mouse.click(target.cx, target.cy); await page.waitForTimeout(300)
await shot(page, 'exp-pdf-text-edit2-A-singleclick')
console.log('A:', JSON.stringify(await snap('singleclick')))
// determine selected element tag
const aSel = await page.evaluate(() => {
  // hidden selection: vectorfeld stores selection in module; check selection-box count + try to read selected ids on DOM
  const boxes = document.querySelectorAll('[data-role="selection-box"]').length
  return { boxes }
})
console.log('A boxes:', JSON.stringify(aSel))

// === PATH B: double-click on visible heading ===
await page.mouse.dblclick(target.cx, target.cy); await page.waitForTimeout(400)
await shot(page, 'exp-pdf-text-edit2-B-dblclick')
console.log('B:', JSON.stringify(await snap('dblclick')))
await page.keyboard.type('ZZZ', { delay: 30 }); await page.waitForTimeout(200)
const bChanged = await page.evaluate((orig) => {
  const texts = Array.from(document.querySelectorAll('g[data-layer-name] text'))
  return { stillHasOriginal: texts.some(t => (t.textContent || '').includes(orig)), totalTexts: texts.length }
}, target.text.slice(0, 8))
console.log('B AFTER ZZZ:', JSON.stringify(bChanged))
await page.keyboard.press('Escape'); await page.waitForTimeout(150)

// === PATH D: recolor via inspector (the real ColorPicker) ===
await page.keyboard.press('v'); await page.waitForTimeout(80)
await page.mouse.click(720, 820); await page.waitForTimeout(80) // deselect
await page.mouse.click(target.cx, target.cy); await page.waitForTimeout(300)
console.log('D selection:', JSON.stringify(await snap('pre-recolor')))
// Discover ALL inspector inputs
const inspInputs = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('[data-testid="inspector"] input, [data-testid="inspector"] [data-testid]')).map(e => ({
    tag: e.tagName, type: e.getAttribute('type'), testid: e.getAttribute('data-testid'), val: (e.value || '').slice(0, 12),
  }))
})
console.log('D inspector inputs:', JSON.stringify(inspInputs))
// Drive the fill ColorPicker if present
const fillExists = await page.locator('[data-testid="fill"]').count()
console.log('D fill picker count:', fillExists)
if (fillExists > 0) {
  const ci = page.locator('[data-testid="fill"] input').first()
  const ciCount = await ci.count()
  console.log('D fill inputs:', ciCount)
  if (ciCount > 0) {
    await ci.evaluate(el => { el.value = '#ff0000'; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })) })
    await page.waitForTimeout(300)
  }
}
await shot(page, 'exp-pdf-text-edit2-D-recolor')
const fillAfter = await page.evaluate((t) => {
  const texts = Array.from(document.querySelectorAll('g[data-layer-name] text'))
  const el = texts.find(x => (x.textContent || '').includes(t))
  return { fill: el?.getAttribute('fill'), grandparentG: el?.closest('g[data-layer-name] > g')?.getAttribute('fill') }
}, target.text.slice(0, 8))
console.log('D FILL AFTER:', JSON.stringify(fillAfter), 'wasBeforeFill:', target.fill)
await renderExport('D-recolor')

// === PATH E: delete visible text ===
await page.keyboard.press('v'); await page.waitForTimeout(80)
await page.mouse.click(720, 820); await page.waitForTimeout(80)
const beforeDel = await page.evaluate(() => document.querySelectorAll('g[data-layer-name] text').length)
await page.mouse.click(target.cx, target.cy); await page.waitForTimeout(250)
console.log('E selection:', JSON.stringify(await snap('pre-delete')))
await page.keyboard.press('Delete'); await page.waitForTimeout(300)
await shot(page, 'exp-pdf-text-edit2-E-delete')
const afterDel = await page.evaluate(() => document.querySelectorAll('g[data-layer-name] text').length)
console.log('E DELETE textCount:', beforeDel, '->', afterDel)
await renderExport('E-delete')

dumpLog(log)
await browser.close()
console.log('DONE-2')
