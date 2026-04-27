// Spike for vectorfeld-clw (yyj-8): does mupdf-js's
// PDFDocument.subsetFonts() rewrite already-emitted TJ glyph-index
// hex to match the post-subset GID renumbering?
//
// Risk: subsetFonts shrinks the embedded font program by retaining
// only the glyphs actually used in content streams, but glyph IDs
// in the subset are NOT preserved (they're renumbered to a contiguous
// range). Our graft engine emits TJ hex BEFORE save (and would emit
// before subsetFonts in any production wiring); if mupdf doesn't
// rewrite the TJ hex to follow the renumbering, every emitted glyph
// would point at the wrong (or .notdef) glyph in the subset.
//
// Acceptance:
//   (a) After subsetFonts + save + reopen, mupdf.asText() still
//       reads "Hello".
//   (b) pdfjs.getTextContent() still reads "Hello".
//   (c) Output bytes drop substantially (>50%) vs unsubsetted save.
//
// Verdict path:
//   - PASS → wire subsetFonts into graftExport before saveToBuffer.
//   - FAIL → skip subsetFonts; log a follow-up bead for hand-built
//     subsetting.

import * as mupdf from '../../node_modules/mupdf/dist/mupdf.js'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(here, '../..')
const CARLITO = resolve(REPO, 'src/fonts/Carlito-Regular.ttf')
const OUT_DIR = resolve(REPO, 'temp/spike-07')
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })

const log = (...a) => console.log(...a)

log('# Spike 07 — subsetFonts() vs already-emitted TJ glyph-index hex\n')

function buildDocWithText(text, fontKey, carlitoBytes) {
  const out = new mupdf.PDFDocument()
  const font = new mupdf.Font(fontKey, carlitoBytes)
  const fontRef = out.addFont(font)
  const gids = [...text].map((ch) => font.encodeCharacter(ch.codePointAt(0)))
  const hex = gids.map((g) => g.toString(16).padStart(4, '0')).join('')
  const FK = 'F1'
  const contentStr = `BT\n/${FK} 24 Tf\n50 100 Td\n<${hex}> Tj\nET\n`
  const buf = new mupdf.Buffer()
  buf.write(contentStr)
  const resources = out.newDictionary()
  const fontsDict = out.newDictionary()
  fontsDict.put(FK, fontRef)
  resources.put('Font', fontsDict)
  const pageObj = out.addPage([0, 0, 200, 200], 0, resources, buf)
  out.insertPage(0, pageObj)
  return { out, gids, hex }
}

const carlitoBytes = new Uint8Array(readFileSync(CARLITO))

// ---- 1. Build identical doc twice; subset one, leave the other.
const TEXT = 'Hello'
const A = buildDocWithText(TEXT, 'VfCarlito', carlitoBytes)
const B = buildDocWithText(TEXT, 'VfCarlito', carlitoBytes)

log(`emitted GIDs (pre-subset, from font.encodeCharacter): ${A.gids.join(',')}`)
log(`emitted Identity-H hex: <${A.hex}>`)

// Save A as-is (no subset).
const noSubsetBytes = A.out.saveToBuffer('compress=yes').asUint8Array()
writeFileSync(resolve(OUT_DIR, 'no-subset.pdf'), noSubsetBytes)
log(`\nno-subset bytes:        ${noSubsetBytes.length}`)

// Subset B then save.
B.out.subsetFonts()
const subsetBytes = B.out.saveToBuffer('compress=yes').asUint8Array()
writeFileSync(resolve(OUT_DIR, 'subset.pdf'), subsetBytes)
log(`subset bytes:           ${subsetBytes.length}`)
log(`size delta:             ${noSubsetBytes.length - subsetBytes.length} bytes (${(100 * (1 - subsetBytes.length / noSubsetBytes.length)).toFixed(1)}% smaller)`)

// ---- 2. Reopen subset, mupdf round-trip
const re = new mupdf.PDFDocument(subsetBytes)
const reText = re.loadPage(0).toStructuredText('preserve-spans').asText()
log(`\nmupdf reopen.asText(): ${JSON.stringify(reText)}`)
const mupdfOk = reText.includes(TEXT)
log(`mupdf round-trips ${JSON.stringify(TEXT)}: ${mupdfOk}`)

// ---- 3. pdfjs cross-check
const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
const pdfjsDoc = await pdfjsLib.getDocument({
  data: subsetBytes,
  disableFontFace: true,
  useSystemFonts: false,
  isEvalSupported: false,
}).promise
const tc = await (await pdfjsDoc.getPage(1)).getTextContent()
const pdfjsText = tc.items.map((it) => it.str).join('')
log(`pdfjs.getTextContent: ${JSON.stringify(pdfjsText)}`)
const pdfjsOk = pdfjsText.includes(TEXT)
log(`pdfjs round-trips ${JSON.stringify(TEXT)}: ${pdfjsOk}`)

// ---- 4. Inspect post-subset content stream — does the TJ hex still
//         point at the same GIDs we emitted, or did mupdf rewrite it?
const ascii = new TextDecoder('latin1').decode(subsetBytes)
const tjMatch = ascii.match(/<([0-9a-f]+)>\s+Tj/i)
if (tjMatch) {
  log(`\npost-subset TJ hex in saved bytes: <${tjMatch[1]}>`)
  if (tjMatch[1] === A.hex) {
    log('  → SAME hex as pre-subset emission. mupdf preserved GID numbering.')
  } else {
    log(`  → DIFFERENT hex. mupdf rewrote it from <${A.hex}> to <${tjMatch[1]}>.`)
    log('     Conclusion: mupdf is post-emission-aware AND remaps content-stream hex.')
  }
}

// ---- 5. Verdict
const subsetWorked = mupdfOk && pdfjsOk
const sizeShrunk = subsetBytes.length < noSubsetBytes.length * 0.5
log('\n=== VERDICT ===')
log('  text round-trip post-subset: ' + (subsetWorked ? '✓' : '✗'))
log('  >50% size reduction:         ' + (sizeShrunk ? '✓' : '✗'))
if (subsetWorked && sizeShrunk) {
  log('\nPASS — wire subsetFonts before saveToBuffer in graftExport.')
  process.exit(0)
}
log('\nFAIL — subsetFonts breaks something. File a follow-up bead.')
process.exit(1)
