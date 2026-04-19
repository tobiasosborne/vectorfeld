// Dump MuPDF's SVG output for a PDF, mirroring vectorfeld's importPdf flow.
// Usage: node dump-svg.mjs <input.pdf> <output.svg>

import { readFileSync, writeFileSync } from 'node:fs'
import * as mupdf from 'mupdf'

const [, , inPath, outPath] = process.argv
if (!inPath || !outPath) {
  console.error('Usage: node dump-svg.mjs <input.pdf> <output.svg>')
  process.exit(1)
}

const PT_TO_MM = 25.4 / 72

function postProcessPdfSvg(s) {
  s = s.replace(/viewBox="([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)"/, (_, x, y, w, h) => {
    const mx = parseFloat(x) * PT_TO_MM
    const my = parseFloat(y) * PT_TO_MM
    const mw = parseFloat(w) * PT_TO_MM
    const mh = parseFloat(h) * PT_TO_MM
    return `viewBox="${mx.toFixed(2)} ${my.toFixed(2)} ${mw.toFixed(2)} ${mh.toFixed(2)}"`
  })
  s = s.replace(/<title[^>]*>[\s\S]*?<\/title>/gi, '')
  s = s.replace(/<desc[^>]*>[\s\S]*?<\/desc>/gi, '')
  s = s.replace(/<metadata[^>]*>[\s\S]*?<\/metadata>/gi, '')
  s = s.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
  return s
}

const pdfData = readFileSync(inPath)
const doc = mupdf.Document.openDocument(pdfData, 'application/pdf')
const pageCount = doc.countPages()
console.log(`PDF: ${inPath}`)
console.log(`Pages: ${pageCount}`)

const page = doc.loadPage(0)
const bounds = page.getBounds()
console.log(`Page 0 bounds (pt): [${bounds.join(', ')}]`)

const buf = new mupdf.Buffer()
const opts = process.argv[4] ?? ''
console.log(`Writer options: '${opts}'`)
const writer = new mupdf.DocumentWriter(buf, 'svg', opts)
const device = writer.beginPage(bounds)
page.run(device, mupdf.Matrix.identity)
writer.endPage()
writer.close()

const rawSvg = buf.asString()
const processedSvg = postProcessPdfSvg(rawSvg)

writeFileSync(outPath + '.raw.svg', rawSvg)
writeFileSync(outPath, processedSvg)

// Quick stats
const elementCount = (s) => (s.match(/<\w[^>/!?]*?>/g) || []).length
const tagCount = (s, tag) => (s.match(new RegExp(`<${tag}\\b`, 'g')) || []).length

console.log(`\nRaw SVG: ${(rawSvg.length / 1024).toFixed(1)} KB`)
console.log(`Processed SVG: ${(processedSvg.length / 1024).toFixed(1)} KB`)
console.log(`Total opening tags: ${elementCount(rawSvg)}`)
console.log(`<text> elements:    ${tagCount(rawSvg, 'text')}`)
console.log(`<path> elements:    ${tagCount(rawSvg, 'path')}`)
console.log(`<image> elements:   ${tagCount(rawSvg, 'image')}`)
console.log(`<rect> elements:    ${tagCount(rawSvg, 'rect')}`)
console.log(`<g> elements:       ${tagCount(rawSvg, 'g')}`)
console.log(`<use> elements:     ${tagCount(rawSvg, 'use')}`)
console.log(`<symbol> elements:  ${tagCount(rawSvg, 'symbol')}`)
console.log(`<defs> elements:    ${tagCount(rawSvg, 'defs')}`)
console.log(`<style> elements:   ${tagCount(rawSvg, 'style')}`)
console.log(`<font-face>:        ${tagCount(rawSvg, 'font-face')}`)

page.destroy()
doc.destroy()
