// Spike 1/3 for vectorfeld-u9d: can mupdf.js duplicate a page verbatim?
//
// Loads a source PDF, grafts page 0 into a fresh PDFDocument, saves, and
// diffs the result against the source using pdftotext + pdfinfo + pdfimages.
// PASS = fonts / text / images / dims round-trip intact at the command-line
// diagnostic level. FAIL = we need a different architecture.
//
// Run from repo root: node scripts/spike/01-graft-clone.mjs

import * as mupdf from '../../node_modules/mupdf/dist/mupdf.js'
import { readFileSync, writeFileSync, statSync, mkdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { execSync } from 'node:child_process'

const here = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(here, '../..')
const SRC = resolve(REPO, 'temp/Flyer Swift Vortragscoaching yellow BG bluer Border.pdf')
const OUT = resolve(REPO, 'temp/spike-01-graft.pdf')
const VERDICT = resolve(REPO, 'temp/spike-01-verdict.md')
const DIFF_DIR = resolve(REPO, 'temp/spike-01-diff')

if (!existsSync(DIFF_DIR)) mkdirSync(DIFF_DIR, { recursive: true })

const findings = []
const log = (s) => { console.log(s); findings.push(s) }

log(`# Spike 01 — mupdf.js graftPage verdict\n`)
log(`Source: \`${SRC}\`  (${statSync(SRC).size} bytes)\n`)

// ---- Step 1: load source
const srcBytes = new Uint8Array(readFileSync(SRC))
const srcDoc = new mupdf.PDFDocument(srcBytes)
const srcPageCount = srcDoc.countPages()
log(`## Load\n- Source loaded, page count: ${srcPageCount}\n`)

// ---- Step 2: create new doc, graft page 0
const newDoc = new mupdf.PDFDocument()
log(`## Graft\n- Empty new PDFDocument created (pages: ${newDoc.countPages()})`)
newDoc.graftPage(-1, srcDoc, 0) // to=-1 means append (mupdf convention)
log(`- graftPage(-1, srcDoc, 0) completed; new page count: ${newDoc.countPages()}\n`)

// ---- Step 3: save
const outBuf = newDoc.saveToBuffer('compress=yes')
const outBytes = new Uint8Array(outBuf.asUint8Array())
writeFileSync(OUT, outBytes)
log(`## Save\n- Wrote ${OUT} (${outBytes.length} bytes)\n`)

// Release mupdf
srcDoc.destroy()
newDoc.destroy()

// ---- Step 4: command-line diagnostics
function sh(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (err) {
    return `ERROR: ${err.message}`
  }
}

log(`## Text comparison (pdftotext)`)
const srcText = sh(`pdftotext -layout "${SRC}" -`)
const outText = sh(`pdftotext -layout "${OUT}" -`)
writeFileSync(resolve(DIFF_DIR, 'src.txt'), srcText)
writeFileSync(resolve(DIFF_DIR, 'out.txt'), outText)
const textIdentical = srcText === outText
log(`- Text identical: **${textIdentical}**`)
if (!textIdentical) {
  log(`- src len: ${srcText.length}, out len: ${outText.length}`)
  // Show first differing region
  let diffAt = -1
  for (let i = 0; i < Math.min(srcText.length, outText.length); i++) {
    if (srcText[i] !== outText[i]) { diffAt = i; break }
  }
  log(`- First difference at char offset: ${diffAt}`)
  if (diffAt >= 0) {
    const start = Math.max(0, diffAt - 30)
    log(`  src: \`${JSON.stringify(srcText.slice(start, diffAt + 30))}\``)
    log(`  out: \`${JSON.stringify(outText.slice(start, diffAt + 30))}\``)
  }
}

log(`\n## Page dims (pdfinfo)`)
const srcInfo = sh(`pdfinfo "${SRC}"`)
const outInfo = sh(`pdfinfo "${OUT}"`)
const srcSize = srcInfo.match(/Page size:\s+(.+)/)?.[1]
const outSize = outInfo.match(/Page size:\s+(.+)/)?.[1]
log(`- Source: \`${srcSize}\``)
log(`- Output: \`${outSize}\``)
log(`- Dims match: **${srcSize === outSize}**`)

log(`\n## Font preservation (pdffonts)`)
const srcFonts = sh(`pdffonts "${SRC}"`)
const outFonts = sh(`pdffonts "${OUT}"`)
writeFileSync(resolve(DIFF_DIR, 'src.fonts.txt'), srcFonts)
writeFileSync(resolve(DIFF_DIR, 'out.fonts.txt'), outFonts)
log(`\nSource fonts:\n\`\`\`\n${srcFonts}\`\`\`\n`)
log(`Output fonts:\n\`\`\`\n${outFonts}\`\`\`\n`)

log(`\n## Embedded image check (pdfimages -list)`)
const srcImgs = sh(`pdfimages -list "${SRC}"`)
const outImgs = sh(`pdfimages -list "${OUT}"`)
writeFileSync(resolve(DIFF_DIR, 'src.images.txt'), srcImgs)
writeFileSync(resolve(DIFF_DIR, 'out.images.txt'), outImgs)
log(`Source images:\n\`\`\`\n${srcImgs}\`\`\`\n`)
log(`Output images:\n\`\`\`\n${outImgs}\`\`\`\n`)

log(`\n## File size\n- Source: ${statSync(SRC).size}  /  Output: ${statSync(OUT).size}`)
log(`  (significant bloat vs source = graft is copying more than strictly needed; within 10% = clean)`)

// ---- Write verdict
writeFileSync(VERDICT, findings.join('\n') + '\n')
console.log(`\n[spike-01] Verdict written to ${VERDICT}`)
console.log(`[spike-01] Artifacts in ${DIFF_DIR}/`)
