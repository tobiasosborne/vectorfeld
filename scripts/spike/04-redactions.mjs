// Spike for vectorfeld-qu1 (enf-1): validate that mupdf-js's
// PDFPage.applyRedactions() actually rewrites the source content
// stream — removes Tj/TJ operators inside the marked rect — rather
// than just rendering a black box on top of unapplied annots.
//
// If this works, vectorfeld-enf becomes a 6-bead implementation
// instead of a 12+ -bead custom-tokenizer effort. The mupdf C API
// definitely rewrites the stream; this spike confirms the JS binding
// preserves that behavior.
//
// Acceptance: re-opened doc's structured-text on page 0 does NOT
// contain the largest-font headline string. Print stream-length
// delta and OK on success.

import * as mupdf from '../../node_modules/mupdf/dist/mupdf.js'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(here, '../..')
const SRC = resolve(REPO, 'test/dogfood/fixtures/Flyer Swift Vortragscoaching 15.04.2026 noheader.pdf')
const OUT_DIR = resolve(REPO, 'temp/spike-04')
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })

const log = (s) => console.log(s)

log(`# Spike 04 — applyRedactions content-stream rewrite\n`)

// ---- 1. Open source PDF
const srcBytes = new Uint8Array(readFileSync(SRC))
const srcDoc = new mupdf.PDFDocument(srcBytes)
log(`source bytes: ${srcBytes.length}`)
log(`source pages: ${srcDoc.countPages()}`)

const page = srcDoc.loadPage(0)

// ---- 2. Find the headline: walk structured text, collect chars at
//        the maximum font size, union their quads.
const stext = page.toStructuredText('preserve-spans')
const fullText = stext.asText()
log(`\npre-redact toStructuredText.asText() length: ${fullText.length}`)
log(`pre-redact first line: ${JSON.stringify(fullText.split('\n')[0])}`)

let maxSize = 0
const charsBySize = new Map()
stext.walk({
  onChar(c, _origin, _font, size, quad) {
    const key = size.toFixed(2)
    if (!charsBySize.has(key)) charsBySize.set(key, [])
    charsBySize.get(key).push({ c, quad })
    if (size > maxSize) maxSize = size
  },
})
const headlineChars = charsBySize.get(maxSize.toFixed(2)) || []
log(`max font size: ${maxSize}; chars at that size: ${headlineChars.length}`)
log(`headline string: ${JSON.stringify(headlineChars.map((h) => h.c).join(''))}`)
const HEADLINE = headlineChars.map((h) => h.c).join('').trim()
if (!HEADLINE || HEADLINE.length < 3) {
  log('FAIL: could not extract a meaningful headline string')
  process.exit(1)
}

// Union of all headline quads → bbox rect [x0, y0, x1, y1].
// Quad is a flat 8-tuple: [ul.x, ul.y, ur.x, ur.y, ll.x, ll.y, lr.x, lr.y].
let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
for (const { quad } of headlineChars) {
  for (let i = 0; i < 8; i += 2) {
    const x = quad[i]
    const y = quad[i + 1]
    if (x < x0) x0 = x
    if (y < y0) y0 = y
    if (x > x1) x1 = x
    if (y > y1) y1 = y
  }
}
// Pad slightly so stroked / borderline glyphs are fully inside the rect.
const PAD = 0.5
x0 -= PAD; y0 -= PAD; x1 += PAD; y1 += PAD
log(`headline bbox: [${x0.toFixed(2)}, ${y0.toFixed(2)}, ${x1.toFixed(2)}, ${y1.toFixed(2)}]`)

// ---- 3. Pre-redact stream length (measure the band-aid alternative scope)
const preStreamBytes = page.getObject().get('Contents').readStream().asUint8Array()
log(`pre-redact content stream length: ${preStreamBytes.length}`)

// ---- 4. Create a Redact annot, set rect, applyRedactions
const annot = page.createAnnotation('Redact')
annot.setRect([x0, y0, x1, y1])
log(`\ncreated Redact annot at headline bbox`)

// black_boxes=false → don't paint visible black rect over redacted area.
// REDACT_IMAGE_NONE=0, REDACT_LINE_ART_NONE=0, REDACT_TEXT_REMOVE=0.
page.applyRedactions(false, 0, 0, 0)
log(`applyRedactions(false, 0, 0, 0) returned`)

// ---- 5. Save and re-open from the saved bytes
const outBytes = srcDoc.saveToBuffer('compress=yes').asUint8Array()
log(`\npost-redact saved bytes: ${outBytes.length}`)
const outPath = resolve(OUT_DIR, 'redacted.pdf')
writeFileSync(outPath, outBytes)
log(`wrote ${outPath}`)

const reopen = new mupdf.PDFDocument(outBytes)
const reopenPage = reopen.loadPage(0)
const reopenStext = reopenPage.toStructuredText('preserve-spans')
const reopenText = reopenStext.asText()
log(`\npost-redact toStructuredText.asText() length: ${reopenText.length}`)
log(`post-redact first line: ${JSON.stringify(reopenText.split('\n')[0])}`)

const postStreamBytes = reopenPage.getObject().get('Contents').readStream().asUint8Array()
log(`post-redact content stream length: ${postStreamBytes.length}`)
log(`stream length delta: ${postStreamBytes.length - preStreamBytes.length} bytes`)

// ---- 6. Acceptance assertion
log(`\nAcceptance: headline ${JSON.stringify(HEADLINE)} must be absent from post-redact text`)
if (reopenText.includes(HEADLINE)) {
  log(`FAIL: headline still present in post-redact text. Plan A is dead — fall to Plan B.`)
  process.exit(1)
}
// Also check: at least one un-redacted text element survived (sanity — make sure we didn't nuke the whole page)
const survivedSomething = reopenText.trim().length > 10
if (!survivedSomething) {
  log(`FAIL: redaction nuked the entire page text. Bbox too greedy or applyRedactions too aggressive.`)
  process.exit(1)
}

log(`\nmupdf says headline is gone. Cross-checking with pdfjs (the path the gate uses)...`)

// pdfjs cross-check: the golden gate uses pdfjs-dist getTextContent().
// If mupdf says gone but pdfjs still finds it, the gate would still fail.
const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
const loading = pdfjsLib.getDocument({ data: outBytes, useSystemFonts: false })
const pdfjsDoc = await loading.promise
const pdfjsPage = await pdfjsDoc.getPage(1)
const tc = await pdfjsPage.getTextContent()
const pdfjsText = tc.items.map((it) => it.str).join('')
log(`pdfjs getTextContent joined length: ${pdfjsText.length}`)
log(`pdfjs sample: ${JSON.stringify(pdfjsText.slice(0, 80))}`)
if (pdfjsText.includes(HEADLINE)) {
  log(`FAIL: pdfjs still finds the headline. Plan A is NOT enough — pdfjs and mupdf disagree on what 'redacted' means.`)
  process.exit(1)
}
// Spot-check: a known un-redacted bullet phrase should still be in pdfjs output.
// (Picks any 6+ char run from non-headline structured text.)
const surviving = reopenText.split('\n').find((l) => l.trim().length > 6 && !l.includes(HEADLINE))?.trim()
if (surviving && !pdfjsText.replace(/\s+/g, ' ').includes(surviving.replace(/\s+/g, ' ').slice(0, 6))) {
  log(`WARN: pdfjs missed surviving content "${surviving.slice(0, 30)}…" — possible font/encoding mismatch but headline removal still confirmed.`)
}

log(`\nOK — applyRedactions removed the headline at the content-stream level.`)
log(`Verified by mupdf.asText() AND pdfjs.getTextContent(). Plan A holds.`)
log(`Proceed with enf-2 (graftMupdf primitive).`)
