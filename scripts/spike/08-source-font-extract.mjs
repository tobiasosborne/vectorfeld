// Spike for vectorfeld-eb0 (source-font in-place edit): can we
// extract a source PDF's embedded font program (FontFile2 / FontFile3)
// from a grafted output, hand the bytes to fontkit, and re-shape an
// edited string with that ORIGINAL source font?
//
// Why this matters: today, "modify a source text element" routes
// through graft → redact + Carlito overlay. Carlito is not the
// source's font (e.g., Calibri), so the edit is visibly seamy.
// eb0 closes that gap by re-emitting the modified glyph stream in
// the source's own font — same metrics, same ligatures, same kerns.
//
// Riskiest unknowns this spike resolves:
//   (1) Can mupdf walk /Resources/Font/<key>/FontDescriptor/FontFile2
//       (or FontFile/FontFile3) and return the embedded font program
//       bytes?
//   (2) Does fontkit accept those bytes? Source PDFs commonly ship
//       subsetted fonts (e.g., BCDEEE+Calibri-Bold) — does fontkit
//       handle subset TTFs? Does it produce the right glyph-id
//       mapping for the chars in the source?
//   (3) Does font.encodeCharacter / font.layout work on the subset
//       font for chars that EXIST in the subset?
//   (4) For Identity-H source fonts (Type-0 / CIDFontType2), the
//       glyph-ID space matches the embedded program directly. For
//       simple-encoded TrueType (WinAnsi etc.), the encoding goes
//       byte → glyph. fontkit's glyph IDs match the program; we
//       have to be careful to route through encoding lookups, not
//       just hand strings.
//
// Acceptance:
//   (a) Extract font bytes from a real source PDF (the flyer fixture).
//   (b) fontkit.create(bytes) returns a usable Font.
//   (c) shape some text the source uses (a known fragment from the
//       PDF) → get glyph IDs that round-trip through both Identity-H
//       hex AND the source font's natural encoding.
//
// NOT in spike scope:
//   - Content-stream rewriting (the actual TJ replacement).
//   - Determining exactly which content-stream op to replace.
//   - Subset-renumbering after eb0 modifications.

import * as mupdf from '../../node_modules/mupdf/dist/mupdf.js'
import fontkit from '@pdf-lib/fontkit'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(here, '../..')
const SRC = resolve(REPO, 'test/dogfood/fixtures/Flyer Swift Vortragscoaching 15.04.2026 noheader.pdf')
const OUT_DIR = resolve(REPO, 'temp/spike-08')
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })

const log = (...a) => console.log(...a)

log('# Spike 08 — extract source font bytes for eb0\n')

const srcBytes = new Uint8Array(readFileSync(SRC))
const doc = new mupdf.PDFDocument(srcBytes)
log(`source bytes: ${srcBytes.length}`)
log(`pages: ${doc.countPages()}`)

const page = doc.findPage(0)
const resources = page.get('Resources').resolve()
const fonts = resources.get('Font')
log('\n=== Page 0 fonts ===')
const fontKeys = []
fonts.forEach((v, k) => {
  fontKeys.push(k)
  const f = v.resolve()
  const subtype = f.get('Subtype')
  const baseFont = f.get('BaseFont')
  const subtypeStr = subtype.isName() ? '/' + subtype.asName() : '?'
  const baseFontStr = baseFont.isName() ? '/' + baseFont.asName() : '?'
  log(`  /${k}: Subtype=${subtypeStr} BaseFont=${baseFontStr}`)
})

// For each font, walk to FontDescriptor.FontFile* and extract bytes.
log('\n=== Font program extraction ===')
const extracted = []
for (const key of fontKeys) {
  const f = fonts.get(key).resolve()
  const subtype = f.isDictionary() ? (f.get('Subtype').isName() ? f.get('Subtype').asName() : null) : null

  // For Type-0: descend into DescendantFonts[0] to reach the CID font's FontDescriptor.
  let descriptorHost = f
  if (subtype === 'Type0') {
    const dfs = f.get('DescendantFonts')
    if (dfs.isArray() && dfs.length > 0) {
      descriptorHost = dfs.get(0).resolve()
    }
  }

  const fontDescriptor = descriptorHost.get('FontDescriptor').resolve()
  if (!fontDescriptor.isDictionary()) {
    log(`  /${key}: no FontDescriptor — skip`)
    continue
  }

  // Try FontFile2 (TrueType), then FontFile3 (Type1C/OpenType-CFF), then FontFile (Type 1).
  const candidates = ['FontFile2', 'FontFile3', 'FontFile']
  let programStream = null
  let programKey = null
  for (const k of candidates) {
    const cand = fontDescriptor.get(k)
    if (cand.isStream()) {
      programStream = cand
      programKey = k
      break
    }
  }
  if (!programStream) {
    log(`  /${key}: no FontFile{,2,3} stream — skip`)
    continue
  }

  // mupdf's PDFObject.readStream() returns a Buffer with the
  // decoded (filter-applied) stream contents. That's the actual
  // font program bytes — what fontkit expects.
  const programBytes = programStream.readStream().asUint8Array()
  const baseFontName = (descriptorHost.get('BaseFont').isName() ? descriptorHost.get('BaseFont').asName() : 'unknown')
  log(`  /${key}: extracted ${programKey} (${programBytes.length} bytes) — BaseFont=${baseFontName}`)

  const outPath = resolve(OUT_DIR, `${key}-${baseFontName.replace(/[^a-zA-Z0-9-]/g, '_')}.bin`)
  writeFileSync(outPath, programBytes)

  extracted.push({ key, baseFont: baseFontName, programKey, bytes: programBytes, outPath })
}

if (extracted.length === 0) {
  log('\nFAIL: no font programs extracted')
  process.exit(1)
}

// Try fontkit on each. For TrueType (FontFile2) it should work straight.
// FontFile3 is OpenType-CFF — fontkit usually handles it too.
log('\n=== fontkit acceptance ===')
let bestForLayout = null
for (const e of extracted) {
  try {
    const f = fontkit.create(e.bytes)
    log(`  ${e.baseFont} (${e.programKey}): fontkit OK · postscriptName=${f.postscriptName} · numGlyphs=${f.numGlyphs} · unitsPerEm=${f.unitsPerEm}`)
    // Pick the largest font (most glyphs) for the layout test —
    // most likely to have the chars we'll throw at it.
    if (!bestForLayout || f.numGlyphs > bestForLayout.font.numGlyphs) {
      bestForLayout = { entry: e, font: f }
    }
  } catch (err) {
    log(`  ${e.baseFont} (${e.programKey}): fontkit REJECTED — ${err.message}`)
  }
}

if (!bestForLayout) {
  log('\nFAIL: fontkit rejected every extracted font')
  process.exit(1)
}

log(`\nUsing ${bestForLayout.entry.baseFont} for layout test (${bestForLayout.font.numGlyphs} glyphs).`)

// Layout test — grab a string the source PDF actually uses, run it
// through layout, verify glyph IDs are returned for chars present
// in the subset.
const PROBE = 'Vortrag'
log(`\n=== fontkit.layout(${JSON.stringify(PROBE)}) ===`)
const run = bestForLayout.font.layout(PROBE)
log(`glyphs: ${run.glyphs.length}`)
let allHit = true
for (let i = 0; i < run.glyphs.length; i++) {
  const g = run.glyphs[i]
  log(`  [${i}] gid=${g.id} cps=[${g.codePoints.map((c) => c.toString(16)).join(',')}] aw=${g.advanceWidth}`)
  if (g.id === 0) allHit = false // .notdef = char missing from subset
}

if (!allHit) {
  log('\nWARN: some glyphs are .notdef — char missing from this subset. ')
  log('This is expected for subset fonts (only chars seen at PDF-build time are present).')
  log('eb0 must check coverage and either fall back to Carlito or refuse the edit.')
}

// Emission round-trip: build a tiny PDF using the extracted font
// (registered via mupdf.addFont) and a TJ stream of the layout's
// glyph IDs, save+reopen, verify pdfjs reads back our PROBE string.
log(`\n=== End-to-end emission round-trip ===`)
const out = new mupdf.PDFDocument()
const mupdfFont = new mupdf.Font(bestForLayout.entry.baseFont, bestForLayout.entry.bytes)
const fontRef = out.addFont(mupdfFont)
const FK = 'F1'
const hex = run.glyphs.map((g) => g.id.toString(16).padStart(4, '0')).join('')
const cs = `BT\n/${FK} 24 Tf\n50 100 Td\n<${hex}> Tj\nET\n`
const buf = new mupdf.Buffer()
buf.write(cs)
const resources2 = out.newDictionary()
const fontsDict2 = out.newDictionary()
fontsDict2.put(FK, fontRef)
resources2.put('Font', fontsDict2)
const pageObj = out.addPage([0, 0, 200, 200], 0, resources2, buf)
out.insertPage(0, pageObj)
out.subsetFonts()
const outBytes = out.saveToBuffer('compress=yes').asUint8Array()
writeFileSync(resolve(OUT_DIR, 'roundtrip.pdf'), outBytes)
log(`output bytes: ${outBytes.length}`)

const re = new mupdf.PDFDocument(outBytes)
const reText = re.loadPage(0).toStructuredText('preserve-spans').asText()
log(`mupdf re-read: ${JSON.stringify(reText)}`)
const mupdfRT = reText.includes(PROBE)
log(`mupdf round-trip ${JSON.stringify(PROBE)}: ${mupdfRT}`)

const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
const pdfjsDoc = await pdfjsLib.getDocument({ data: outBytes, useSystemFonts: false }).promise
const tc = await (await pdfjsDoc.getPage(1)).getTextContent()
const pdfjsText = tc.items.map((it) => it.str).join('')
log(`pdfjs.getTextContent: ${JSON.stringify(pdfjsText)}`)
const pdfjsRT = pdfjsText.includes(PROBE)
log(`pdfjs round-trip ${JSON.stringify(PROBE)}: ${pdfjsRT}`)

log('\n=== VERDICT ===')
log(`  font extraction:        ${extracted.length}/${fontKeys.length}`)
log(`  fontkit acceptance:     ${bestForLayout ? '✓' : '✗'}`)
log(`  layout produces glyphs: ${run.glyphs.length > 0 ? '✓' : '✗'}`)
log(`  mupdf round-trip:       ${mupdfRT ? '✓' : '✗'}`)
log(`  pdfjs round-trip:       ${pdfjsRT ? '✓' : '✗'}`)
const pass = extracted.length > 0 && bestForLayout && mupdfRT && pdfjsRT
log(pass ? '\nPASS — eb0 is feasible. Source font extraction + fontkit + emission round-trip all work.' :
          '\nFAIL — eb0 has a hard wall at one of the steps above.')
process.exit(pass ? 0 : 1)
