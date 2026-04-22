// Spike 2 follow-up: can we embed OUR own font (Carlito) into the grafted
// doc and use it in an overlay content stream? This is what production needs
// for arbitrary new user text that isn't glyph-covered by the source subsets.
import * as mupdf from '../../node_modules/mupdf/dist/mupdf.js'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { execSync } from 'node:child_process'

const here = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(here, '../..')
const SRC = resolve(REPO, 'temp/Flyer Swift Vortragscoaching yellow BG bluer Border.pdf')
const CARLITO = resolve(REPO, 'src/fonts/Carlito-Regular.ttf')
const OUT = resolve(REPO, 'temp/spike-02b-embed.pdf')
const SHOT = resolve(REPO, 'temp/spike-02b-shot-1.png')

// Graft page 0 from source
const srcBytes = new Uint8Array(readFileSync(SRC))
const srcDoc = new mupdf.PDFDocument(srcBytes)
const newDoc = new mupdf.PDFDocument()
newDoc.graftPage(-1, srcDoc, 0)
srcDoc.destroy()

// Load Carlito as a mupdf Font, then addSimpleFont to the doc
const carlitoBytes = readFileSync(CARLITO)
const carlitoFont = new mupdf.Font('CarlitoRegular', new Uint8Array(carlitoBytes))
const fontRef = newDoc.addSimpleFont(carlitoFont, 'Latin')
console.log('[02b] added Carlito to new doc; indirect ref:', fontRef.asIndirect())

// Register it in the grafted page's Resources/Font dict under a fresh name
const page0 = newDoc.findPage(0)
const resources = page0.get('Resources').resolve()
const fontsDict = resources.get('Font')
// Pick a name that doesn't collide with existing keys
const newFontKey = 'VfCarlito'
fontsDict.put(newFontKey, fontRef)
console.log(`[02b] registered /${newFontKey} in page Resources/Font`)

// Append overlay content stream using the new font
const OVERLAY = 'NEW TEXT: fix a typo via graft'
const cs = `q
BT
/${newFontKey} 18 Tf
72 60 Td
0 0.3 0 rg
(${OVERLAY}) Tj
ET
Q
`
const csBuf = new mupdf.Buffer()
csBuf.write(cs)
const csRef = newDoc.addStream(csBuf, newDoc.newDictionary())

const contents = page0.get('Contents').resolve()
if (contents.isArray()) contents.push(csRef)
else {
  const arr = newDoc.newArray()
  arr.push(page0.get('Contents'))
  arr.push(csRef)
  page0.put('Contents', arr)
}

const outBuf = newDoc.saveToBuffer('compress=yes')
writeFileSync(OUT, new Uint8Array(outBuf.asUint8Array()))
newDoc.destroy()

// Verify
const extracted = execSync(`pdftotext -layout "${OUT}" -`, { encoding: 'utf8' })
const sourceOk = extracted.includes('swift') && extracted.includes('LinguistiK')
const overlayOk = extracted.includes('NEW TEXT') && extracted.includes('fix a typo via graft')
console.log('[02b] source preserved:', sourceOk)
console.log('[02b] overlay extracted intact:', overlayOk)

execSync(`pdftoppm -r 150 -f 1 -l 1 -png "${OUT}" ${SHOT.replace('-1.png', '')}`)
console.log('[02b] shot:', SHOT)
console.log('[02b] verdict:', sourceOk && overlayOk ? 'PASS' : 'FAIL')
process.exit(sourceOk && overlayOk ? 0 : 1)
