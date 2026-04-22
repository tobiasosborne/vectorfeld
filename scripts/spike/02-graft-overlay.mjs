// Spike 2/3 for vectorfeld-kgz: can we append NEW content onto a grafted
// page that references the grafted Resources/Font dict?
//
// If this works, it means: (a) the source's fonts remain usable after graft,
// (b) we can overlay new user edits on top of the preserved source bytes
// without breaking font references. This is the linchpin of the export
// architecture.
//
// Run from repo root: node scripts/spike/02-graft-overlay.mjs

import * as mupdf from '../../node_modules/mupdf/dist/mupdf.js'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { execSync } from 'node:child_process'

const here = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(here, '../..')
const SRC = resolve(REPO, 'temp/Flyer Swift Vortragscoaching yellow BG bluer Border.pdf')
const OUT = resolve(REPO, 'temp/spike-02-overlay.pdf')
const VERDICT = resolve(REPO, 'temp/spike-02-verdict.md')
const SHOT_DIR = resolve(REPO, 'temp/spike-02-shots')
if (!existsSync(SHOT_DIR)) mkdirSync(SHOT_DIR, { recursive: true })

const findings = []
const log = (s) => { console.log(s); findings.push(s) }

log(`# Spike 02 — graftPage + append overlay content stream\n`)

// ---- Graft
const srcBytes = new Uint8Array(readFileSync(SRC))
const srcDoc = new mupdf.PDFDocument(srcBytes)
const newDoc = new mupdf.PDFDocument()
newDoc.graftPage(-1, srcDoc, 0)
srcDoc.destroy()
log(`## Graft\n- Grafted page 0; new page count: ${newDoc.countPages()}\n`)

// ---- Find a font name in Resources/Font
const page0 = newDoc.findPage(0)
const resources = page0.get('Resources')
const fontsDict = resources.get('Font')
log(`## Font dict inspection`)
log(`- Resources/Font is dict: ${fontsDict.isDictionary()}`)

// Enumerate font entries. Source fonts are subsetted — only glyphs actually
// used by source content are present. Pick the font whose BaseFont name
// contains "Calibri" (the body-text font) — its subset covers a wide range
// of the Latin alphabet because the source uses long prose in it.
let chosenFontKey = null
let fontCatalog = []
fontsDict.forEach((val, key) => {
  const resolved = val.resolve()
  const enc = resolved.get('Encoding')
  const encName = enc.isName() ? enc.asName() : (enc.isDictionary() ? 'dict' : 'other')
  const baseFont = resolved.get('BaseFont').asName()
  fontCatalog.push({ key, baseFont, encName })
  // Prefer a WinAnsi Calibri (body workhorse — broadest glyph subset).
  if (encName === 'WinAnsiEncoding' && /Calibri(?!-Bold)/.test(baseFont)) {
    chosenFontKey = key
  }
})
// Fallback: any WinAnsi font if Calibri isn't present.
if (!chosenFontKey) {
  fontsDict.forEach((val, key) => {
    const enc = val.resolve().get('Encoding')
    const encName = enc.isName() ? enc.asName() : null
    if (!chosenFontKey && encName === 'WinAnsiEncoding') chosenFontKey = key
  })
}
log(`- Font catalog:`)
for (const f of fontCatalog) log(`  - \`${f.key}\` → ${f.baseFont} (encoding: ${f.encName})`)
log(`- Chosen font key for overlay: \`${chosenFontKey}\``)
if (!chosenFontKey) {
  log(`\n## ❌ FAIL: no WinAnsi font found in grafted resources. Would need 2-byte CID encoding or a new embedded font.`)
  writeFileSync(VERDICT, findings.join('\n') + '\n')
  process.exit(1)
}

// ---- Build new content stream
// PDF content: save state, place text cursor, draw (hello spike), restore.
// Coordinates are in PDF points (bottom-up). 72pt from bottom ≈ 1in up.
// Page is A4 (595 × 842 pt). Put the overlay at (72, 72) — bottom-left corner-ish.
// Use text whose glyphs are GUARANTEED to be in the source subset — the
// body-text already contains these chars. If the spike works, this text
// will render in the source's actual Calibri.
const OVERLAY_TEXT = 'Kurzfristige Hilfe'
const csString = `q
BT
/${chosenFontKey} 36 Tf
72 60 Td
1 0 0 rg
(${OVERLAY_TEXT}) Tj
ET
Q
`
log(`\n## Overlay content stream\n\`\`\`\n${csString}\`\`\`\n`)

const csBuf = new mupdf.Buffer()
csBuf.write(csString)
// addStream(buf, dict): dict = stream's info dict (empty here; /Length is auto-set)
const csDict = newDoc.newDictionary()
const csRef = newDoc.addStream(csBuf, csDict)
log(`- Added content stream; new indirect: ${csRef.asIndirect()}`)

// ---- Append to page's /Contents
const contents = page0.get('Contents').resolve()
log(`- Page /Contents is: array=${contents.isArray()}, stream=${contents.isStream()}, indirect=${contents.isIndirect()}`)
if (contents.isArray()) {
  contents.push(csRef)
  log(`- Pushed overlay ref into existing /Contents array (now length ${contents.length})`)
} else {
  // Wrap single stream in an array; page.Contents was one ref
  const arr = newDoc.newArray()
  arr.push(page0.get('Contents'))  // keep original indirect reference
  arr.push(csRef)
  page0.put('Contents', arr)
  log(`- Wrapped single /Contents stream in array with the new overlay appended (length ${arr.length})`)
}

// ---- Save
const outBuf = newDoc.saveToBuffer('compress=yes')
writeFileSync(OUT, new Uint8Array(outBuf.asUint8Array()))
newDoc.destroy()
log(`\n## Save\n- Wrote ${OUT}\n`)

// ---- Verify via pdftotext
function sh(cmd) {
  try { return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }
  catch (err) { return `ERROR: ${err.message}` }
}
const outText = sh(`pdftotext -layout "${OUT}" -`)
const hasSource = outText.includes('swift') && outText.includes('LinguistiK')
const hasOverlay = (outText.match(/Kurzfristige\s+Hilfe/g) || []).length >= 2
  // The source already has "Kurzfristige Hilfe" once, so overlay success = seeing it TWICE.
log(`## pdftotext extraction`)
log(`- Source text (\`swift\` + \`LinguistiK\`) present: **${hasSource}**`)
log(`- Overlay text (\`hello spike\`) present: **${hasOverlay}**`)

// ---- Render and screenshot
execSync(`pdftoppm -r 150 -f 1 -l 1 -png "${OUT}" ${SHOT_DIR}/spike-02-overlay`)
log(`\n## Screenshot\n- ${SHOT_DIR}/spike-02-overlay-1.png`)

const verdict = hasSource && hasOverlay ? 'PASS' : 'FAIL'
log(`\n## Verdict\n**${verdict}** — source preserved: ${hasSource}, overlay rendered: ${hasOverlay}`)

writeFileSync(VERDICT, findings.join('\n') + '\n')
console.log(`\n[spike-02] Verdict: ${verdict}`)
console.log(`[spike-02] Output: ${OUT}`)
console.log(`[spike-02] Verdict doc: ${VERDICT}`)
process.exit(verdict === 'PASS' ? 0 : 1)
