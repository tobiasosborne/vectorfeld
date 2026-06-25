// vectorfeld-3yu.23 — bold/italic overlay text must NOT collapse to
// Carlito-Regular. Injects regular + bold + italic <text> (font-family
// 'sans-serif', the app's text-tool default) over an imported source PDF,
// exports through the REAL app path (exportPdf → exportPdfBytes, which now
// threads Carlito-Regular/Bold/Italic into the graft engine), then reopens
// the output PDF and asserts THREE DISTINCT font descriptors — i.e. the
// bold and italic runs resolved to their own CID fonts via the family-alias
// stage, not the regular fallback.
//
// PREPARED, not run by the implementing agent. Orchestrator runs against a
// live `npm run dev` build on localhost:5173.

import { openApp, shot, dumpLog, FIXTURES } from '../_driver.mjs'
import { resolve } from 'node:path'
import { readFileSync, writeFileSync } from 'node:fs'

const FG = resolve(FIXTURES, 'Flyer Swift Vortragscoaching 15.04.2026 noheader.pdf')
const { browser, page, log } = await openApp()

async function openPdf(menuItem, file) {
  const fc = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'File', exact: true }).click()
  await page.getByRole('button', { name: menuItem, exact: true }).last().click()
  const chooser = await fc
  await chooser.setFiles(file)
  await page.waitForFunction(() => {
    const ls = document.querySelectorAll('g[data-layer-name]')
    return ls.length >= 1 && Array.from(ls).some((l) => l.children.length > 0)
  }, { timeout: 40000 }).catch(() => {})
  await page.waitForTimeout(800)
}

await openPdf('Open PDF...', FG)

// Inject three NEW <text> runs (regular / bold / italic) onto the foundation
// layer. They are NOT snapshot-tagged, so classifyLayer treats them as new
// overlay content and emitText routes them via the Carlito family-alias.
const injected = await page.evaluate(() => {
  const NS = 'http://www.w3.org/2000/svg'
  const layer = document.querySelector('g[data-layer-name]')
  if (!layer) return { ok: false, reason: 'no layer' }
  const mk = (y, label, attrs) => {
    const t = document.createElementNS(NS, 'text')
    t.setAttribute('x', '20')
    t.setAttribute('y', String(y))
    t.setAttribute('font-size', '8')
    t.setAttribute('font-family', 'sans-serif')
    t.setAttribute('fill', '#1020c0')
    for (const [k, v] of Object.entries(attrs)) t.setAttribute(k, v)
    t.textContent = label
    layer.appendChild(t)
  }
  mk(40, 'Regular run', {})
  mk(55, 'Bold run', { 'font-weight': 'bold' })
  mk(70, 'Italic run', { 'font-style': 'italic' })
  return { ok: true, count: layer.querySelectorAll('text').length }
})
console.log('INJECTED:', JSON.stringify(injected))
await shot(page, 'overlay-bi-01-injected')

// Export through the production button (no opts → loads all 3 Carlito faces).
const dl = page.waitForEvent('download', { timeout: 60000 })
await page.getByRole('button', { name: 'Export PDF', exact: true }).last().click()
const download = await dl.catch(() => null)

let pass = false
if (!download) {
  console.log('EXPORT FAILED: no download event')
} else {
  const outPath = resolve(process.cwd(), 'test/review/shots/overlay-bold-italic.pdf')
  await download.saveAs(outPath)
  const bytes = new Uint8Array(readFileSync(outPath))

  // Reopen with the standalone mupdf package (NOT the app's TS wrapper — node
  // can't resolve its extensionless relative imports) and inspect page-0
  // /Resources/Font. Each registered overlay face is a distinct CID font with a
  // distinct (often subset-prefixed) BaseFont; assert three Carlito faces with
  // bold + italic variants are present and distinct.
  const mupdf = await import('mupdf')
  const doc = mupdf.PDFDocument.openDocument(bytes, 'application/pdf')
  try {
    const pageObj = doc.loadPage(0).getObject()
    const resources = pageObj.get('Resources')
    const fontsDict = resources && !resources.isNull() ? resources.get('Font') : null
    const descriptors = {}
    if (fontsDict && !fontsDict.isNull() && fontsDict.isDictionary()) {
      fontsDict.forEach((v, k) => {
        const font = v && v.isIndirect && v.isIndirect() ? v.resolve() : v
        let baseFont = ''
        try { baseFont = String(font.get('BaseFont')) } catch { /* noop */ }
        descriptors[String(k)] = baseFont
      })
    }
    console.log('FONT DESCRIPTORS:', JSON.stringify(descriptors, null, 2))

    // Robust to subset prefixes ("ABCDEF+VfCarlitoBold") and resource-name vs
    // registered-key differences: look across ALL basefonts for Carlito faces.
    const allBase = Object.values(descriptors)
    const carlito = allBase.filter((b) => /carlito/i.test(b))
    const distinctCarlito = new Set(carlito).size
    const hasBold = carlito.some((b) => /bold/i.test(b))
    const hasItal = carlito.some((b) => /italic|oblique/i.test(b))
    const hasReg = carlito.some((b) => !/bold|italic|oblique/i.test(b))

    pass = distinctCarlito >= 3 && hasReg && hasBold && hasItal
    console.log('ASSERT regular Carlito face  :', hasReg)
    console.log('ASSERT bold Carlito face     :', hasBold)
    console.log('ASSERT italic Carlito face   :', hasItal)
    console.log('ASSERT >=3 distinct Carlito  :', distinctCarlito >= 3, `(got ${distinctCarlito})`)
  } finally {
    doc.destroy && doc.destroy()
  }

  // Visual render for eyeballing weight/slant.
  try {
    const { renderPdfPageToPng } = await import('../../roundtrip/helpers/renderPdf.ts')
    const png = await renderPdfPageToPng(bytes, { page: 1, scale: 2 })
    writeFileSync(resolve(process.cwd(), 'test/review/shots/overlay-bi-02-export-render.png'), png)
    console.log('rendered bold/italic export')
  } catch (e) {
    console.log('render failed', e.message)
  }
}

dumpLog(log)
await browser.close()
console.log(pass ? 'OVERLAY-BOLD-ITALIC PASS' : 'OVERLAY-BOLD-ITALIC FAIL')
process.exit(pass ? 0 : 1)
