// Spike for vectorfeld-yio (yyj-1): does mupdf-js's
// PDFDocument.addFont(font) build a Type-0 / CID-keyed font with
// Identity-H encoding AND a /ToUnicode CMap, and does a TJ glyph-index
// content stream round-trip through both mupdf and pdfjs?
//
// If yes, vectorfeld-yyj plan A holds: graft's emitText rewrites to
// fontkit-shape → addFont → emit TJ <gid hex> ops, and we get full
// OpenType (GSUB ligatures, GPOS kerning, contextual alternates) with
// reliable text extraction. The mupdf binding hint is strong —
// `addFont` calls `_wasm_pdf_add_cid_font` (mupdf.js:1911) — but the
// spike confirms (a) the produced font dict actually has /Type0 +
// /Encoding /Identity-H + /ToUnicode, and (b) both the mupdf and pdfjs
// extractors map the GIDs back to the source string.
//
// Acceptance: print font-dict shape; both round-trips pass for
// 'Hello'; verdict PASS. If the dict is missing /ToUnicode (or is a
// SimpleFont), spike still completes — its output documents what
// addFont DID produce so yyj-5 can decide whether to hand-build the
// CMap.

import * as mupdf from '../../node_modules/mupdf/dist/mupdf.js'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(here, '../..')
const CARLITO = resolve(REPO, 'src/fonts/Carlito-Regular.ttf')
const OUT_DIR = resolve(REPO, 'temp/spike-05')
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })
const OUT = resolve(OUT_DIR, 'addfont-roundtrip.pdf')

const log = (...a) => console.log(...a)

log('# Spike 05 — addFont() Type-0 + TJ glyph-index roundtrip\n')

// ---- 1. Build empty doc, embed Carlito via addFont
const out = new mupdf.PDFDocument()
const carlitoBytes = new Uint8Array(readFileSync(CARLITO))
const font = new mupdf.Font('VfCarlito', carlitoBytes)
log('font.getName():', font.getName())

const fontRef = out.addFont(font)
log('addFont() returned indirect ref:', fontRef.asIndirect())

// ---- 2. Inspect the font object dict
const fontObj = fontRef.resolve()
log('\nFont obj is dict:', fontObj.isDictionary())

const dictKeys = []
fontObj.forEach((v, k) => {
  const r = v.resolve()
  let summary
  if (r.isDictionary()) summary = '<<dict>>'
  else if (r.isArray()) summary = `[array len=${r.length}]`
  else if (r.isStream()) summary = '<<stream>>'
  else if (r.isName()) summary = '/' + r.asName()
  else summary = r.toString(true)
  dictKeys.push(`  /${k} = ${summary}`)
})
log('Font dict keys:')
log(dictKeys.join('\n'))

const subtype = fontObj.get('Subtype')
const encoding = fontObj.get('Encoding')
const toUnicode = fontObj.get('ToUnicode')
const descendants = fontObj.get('DescendantFonts')
const baseFont = fontObj.get('BaseFont')

const subtypeName = subtype.isName() ? subtype.asName() : null
const encodingName = encoding.isName() ? encoding.asName() : null
const baseFontName = baseFont.isName() ? baseFont.asName() : null

log('\nKey acceptance fields:')
log('  /Subtype       =', subtypeName ? '/' + subtypeName : '(not a name)')
log('  /Encoding      =', encodingName ? '/' + encodingName : '(not a name)')
log('  /BaseFont      =', baseFontName ? '/' + baseFontName : '(not a name)')
log('  /ToUnicode present?       ', !toUnicode.isNull())
log('  /DescendantFonts present? ', !descendants.isNull())

// Walk into DescendantFonts[0] if present
if (!descendants.isNull() && descendants.isArray() && descendants.length > 0) {
  const cidfont = descendants.get(0).resolve()
  log('\n  DescendantFonts[0] dict keys:')
  cidfont.forEach((v, k) => {
    const r = v.resolve()
    let summary
    if (r.isDictionary()) summary = '<<dict>>'
    else if (r.isArray()) summary = `[array len=${r.length}]`
    else if (r.isStream()) summary = '<<stream>>'
    else if (r.isName()) summary = '/' + r.asName()
    else summary = r.toString(true)
    log(`    /${k} = ${summary}`)
  })
}

const isType0 = subtypeName === 'Type0'
const isIdentityH = encodingName === 'Identity-H'
const hasToUnicode = !toUnicode.isNull()

log('\nDict shape:', { isType0, isIdentityH, hasToUnicode })

// ---- 3. Build a TJ-glyph-index content stream for "Hello"
const TEXT = 'Hello'
const gids = [...TEXT].map((ch) => font.encodeCharacter(ch.codePointAt(0)))
log('\nGIDs for', JSON.stringify(TEXT), ':', gids)
if (gids.some((g) => g === 0)) {
  log('WARN: at least one .notdef GID (0) — encoding lookup failed for some char.')
}
// Identity-H = 2 bytes per glyph, big-endian.
const hex = gids.map((g) => g.toString(16).padStart(4, '0')).join('')
log('Identity-H hex:', hex)

const FONT_KEY = 'F1'
const contentStr = `BT
/${FONT_KEY} 24 Tf
50 100 Td
<${hex}> Tj
ET
`
log('\nContent stream:\n' + contentStr.trim())

const contentBuf = new mupdf.Buffer()
contentBuf.write(contentStr)

// Resources dict referencing the font under /F1
const resources = out.newDictionary()
const fontsDict = out.newDictionary()
fontsDict.put(FONT_KEY, fontRef)
resources.put('Font', fontsDict)

// ---- 4. Add page (200x200 pt, no rotation, our resources, our content)
const pageObj = out.addPage([0, 0, 200, 200], 0, resources, contentBuf)
out.insertPage(0, pageObj)
log('\npages after insert:', out.countPages())

// ---- 5. Save uncompressed for inspection
const savedBytes = out.saveToBuffer('compress=no').asUint8Array()
writeFileSync(OUT, savedBytes)
log('wrote', OUT, '·', savedBytes.length, 'bytes')

// Dump the font dict region so we can eyeball it manually if needed.
const ascii = new TextDecoder('latin1').decode(savedBytes)
const idxBaseFont = ascii.indexOf('/BaseFont')
if (idxBaseFont > 0) {
  log('\n--- saved-bytes excerpt around /BaseFont ---')
  log(ascii.slice(Math.max(0, idxBaseFont - 40), idxBaseFont + 240))
  log('--- end excerpt ---')
}

// ---- 6. Mupdf round-trip
const re = new mupdf.PDFDocument(savedBytes)
const reText = re.loadPage(0).toStructuredText('preserve-spans').asText()
log('\nmupdf reopen toStructuredText.asText():', JSON.stringify(reText))
const mupdfHasHello = reText.includes(TEXT)
log('mupdf round-trips', JSON.stringify(TEXT) + ':', mupdfHasHello)

// ---- 7. pdfjs cross-check
const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
const pdfjsDoc = await pdfjsLib.getDocument({ data: savedBytes, useSystemFonts: false }).promise
const tc = await (await pdfjsDoc.getPage(1)).getTextContent()
const pdfjsText = tc.items.map((it) => it.str).join('')
log('pdfjs getTextContent joined:', JSON.stringify(pdfjsText))
const pdfjsHasHello = pdfjsText.includes(TEXT)
log('pdfjs round-trips', JSON.stringify(TEXT) + ':', pdfjsHasHello)

// ---- 8. Verdict
const planA = isType0 && isIdentityH && hasToUnicode && mupdfHasHello && pdfjsHasHello
log('\n=== VERDICT ===')
log('Plan A — addFont produces Type-0 + Identity-H + /ToUnicode and TJ glyph-index round-trips:')
log('  Type-0 dict          :', isType0 ? '✓' : '✗')
log('  Identity-H encoding  :', isIdentityH ? '✓' : '✗')
log('  /ToUnicode attached  :', hasToUnicode ? '✓' : '✗')
log('  mupdf round-trip     :', mupdfHasHello ? '✓' : '✗')
log('  pdfjs round-trip     :', pdfjsHasHello ? '✓' : '✗')
log(planA ? '\nPASS — plan A holds. Proceed with yyj-2 + yyj-3.' :
            '\nFAIL — plan A needs fallback. yyj-5 (ToUnicode hand-build) becomes load-bearing.')
process.exit(planA ? 0 : 1)
