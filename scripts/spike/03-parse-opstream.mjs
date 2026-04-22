// Spike 3/3 for vectorfeld-jew: read + tokenize content-stream operators.
//
// For Phase 3 (in-place text edits on source content), we need to locate a
// specific Tj/TJ operator and rewrite its operand. This spike answers:
//   (1) Does mupdf.js expose a ready-made content-stream operator iterator?
//   (2) If not, how hairy is rolling our own? What's the byte cost (~LOC)?
//   (3) On a real PDF content stream, can we locate an op whose string
//       operand contains "Kurzfristige"?
// Writes findings to temp/spike-03-findings.md.

import * as mupdf from '../../node_modules/mupdf/dist/mupdf.js'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(here, '../..')
const SRC = resolve(REPO, 'temp/Flyer Swift Vortragscoaching 15.04.2026 noheader.pdf')
const OUT_DIR = resolve(REPO, 'temp/spike-03')
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })
const FINDINGS = resolve(REPO, 'temp/spike-03-findings.md')

const findings = []
const log = (s) => { console.log(s); findings.push(s) }

log(`# Spike 03 — content-stream operator parsing via mupdf.js\n`)

// ---- 1. Check mupdf API surface for ready-made parsers
log(`## (1) mupdf.js API surface audit`)
// The only iteration primitive we saw in the .d.ts for operators is via a
// Device subclass (runPage fires ops to a device). That's semantic-level
// (showGlyph, showString) — it's a RENDER path, not a syntactic op parser.
// What we want for EDITING is the raw stream bytes + offsets of specific ops.
//
// Confirmed surface:
//   - PDFObject.readStream(): Buffer — decoded content stream bytes
//   - PDFObject.readRawStream(): Buffer — raw (possibly compressed) bytes
//   - PDFObject.writeStream(buf): write decoded bytes back
//   - PDFPage.run(device, matrix): render through a Device — no offsets
// NOT found:
//   - PDFContentStream / PDFOperator classes
//   - processOperators / forEachOperator / similar iterators with offsets
log(`- mupdf.js exposes readStream()/writeStream() on PDFObject`)
log(`- NO public operator-parser with byte-offset tracking`)
log(`- Device.showString() fires during render but gives you a matrix, not a byte offset`)
log(`- Conclusion: **we need our own tokenizer** for the edit path.\n`)

// ---- 2. How gnarly is the tokenizer?
log(`## (2) Tokenizer complexity (implement inline to measure)`)
// Content-stream grammar (PDF spec §7.8.2) is small:
//   - Whitespace: \0 \t \n \f \r space
//   - Comment: % ... EOL
//   - Number: [+-]? \d+ (\.\d+)? | \.\d+
//   - Name: /name
//   - String (literal): (...) with () escaping + \n,\r,\t,\b,\f,\\,\(,\) escapes
//   - String (hex): <hex>
//   - Array: [...]
//   - Dict: <<...>>
//   - Operator: 1-3 letter token (q, Q, Tf, Tj, TJ, cm, ...)
// Full PDF literal string handling including balanced parens + escapes is ~60 LOC.

const srcDoc = new mupdf.PDFDocument(new Uint8Array(readFileSync(SRC)))
const pageObj = srcDoc.findPage(0)
const contentsRef = pageObj.get('Contents')  // as-stored (may be indirect)
const contents = contentsRef.resolve()
log(`- Page 0 Contents (resolved): array=${contents.isArray()}, stream=${contents.isStream()}, indirect=${contents.isIndirect()}, isDict=${contents.isDictionary()}`)

// Contents is documented to be a stream or array of streams. resolve() should
// give us the actual value. Use readStream on the resolved object when it's
// a stream; iterate when it's an array.
function collectStreams() {
  const parts = []
  if (contents.isArray()) {
    contents.forEach((ref) => {
      const s = ref.resolve()
      parts.push(s.readStream())
    })
  } else if (contents.isStream()) {
    parts.push(contents.readStream())
  } else {
    // Try the unresolved reference — readStream auto-resolves in some builds.
    try {
      parts.push(contentsRef.readStream())
    } catch (e) {
      throw new Error(`Contents is neither array nor stream. isDict=${contents.isDictionary()} isBool=${contents.isBoolean()}. Err: ${e.message}`)
    }
  }
  const arrays = parts.map((b) => new Uint8Array(b.asUint8Array()))
  const total = arrays.reduce((a, b) => a + b.length, 0)
  const joined = new Uint8Array(total)
  let o = 0
  for (const a of arrays) { joined.set(a, o); o += a.length }
  return joined
}
const stream = collectStreams()
log(`- Concatenated content stream: ${stream.length} bytes\n`)

// Save for reference
writeFileSync(resolve(OUT_DIR, 'content-stream-raw.bin'), stream)
// Also a readable ASCII dump
const printable = new Uint8Array(stream.length)
for (let i = 0; i < stream.length; i++) {
  const b = stream[i]
  printable[i] = (b >= 0x20 && b < 0x7f) || b === 0x0a || b === 0x0d || b === 0x09 ? b : 0x2e // '.'
}
writeFileSync(resolve(OUT_DIR, 'content-stream-ascii.txt'), Buffer.from(printable))

// ---- Tokenizer (PDF spec §7.8.2 subset: enough for text-op location)
const WS = new Set([0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20])
const DELIM = new Set([0x28, 0x29, 0x3c, 0x3e, 0x5b, 0x5d, 0x7b, 0x7d, 0x2f, 0x25]) // ()<>[]{}/%

function tokenize(buf) {
  const tokens = []
  let i = 0
  const emit = (type, value, start, end) => tokens.push({ type, value, start, end })
  while (i < buf.length) {
    const b = buf[i]
    if (WS.has(b)) { i++; continue }
    if (b === 0x25) {
      // Comment to EOL
      while (i < buf.length && buf[i] !== 0x0a && buf[i] !== 0x0d) i++
      continue
    }
    const start = i
    if (b === 0x28) {
      // Literal string: ( ... ) with balanced unescaped parens + \escapes
      let depth = 1
      i++
      const s = []
      while (i < buf.length && depth > 0) {
        const c = buf[i]
        if (c === 0x5c) { // backslash escape
          i++
          if (i < buf.length) {
            const esc = buf[i]
            if (esc === 0x6e) s.push(0x0a)       // \n
            else if (esc === 0x72) s.push(0x0d)  // \r
            else if (esc === 0x74) s.push(0x09)  // \t
            else if (esc === 0x62) s.push(0x08)  // \b
            else if (esc === 0x66) s.push(0x0c)  // \f
            else if (esc === 0x5c) s.push(0x5c)  // \\
            else if (esc === 0x28) s.push(0x28)  // \(
            else if (esc === 0x29) s.push(0x29)  // \)
            else if (esc >= 0x30 && esc <= 0x37) {
              // Octal 1-3 digits
              let n = esc - 0x30
              let k = 0
              while (k < 2 && i + 1 < buf.length && buf[i+1] >= 0x30 && buf[i+1] <= 0x37) {
                i++; k++
                n = n * 8 + (buf[i] - 0x30)
              }
              s.push(n & 0xff)
            } else s.push(esc)
            i++
          }
        } else if (c === 0x28) { depth++; s.push(c); i++ }
        else if (c === 0x29) { depth--; if (depth > 0) s.push(c); i++ }
        else { s.push(c); i++ }
      }
      emit('string', new Uint8Array(s), start, i)
    } else if (b === 0x3c && buf[i+1] === 0x3c) {
      // Dict — skip to matching >>. Enough to move past it for op-location.
      emit('dict-open', null, i, i+2); i += 2
    } else if (b === 0x3e && buf[i+1] === 0x3e) {
      emit('dict-close', null, i, i+2); i += 2
    } else if (b === 0x3c) {
      // Hex string
      let j = i + 1
      while (j < buf.length && buf[j] !== 0x3e) j++
      emit('hex-string', Buffer.from(buf.subarray(i+1, j)).toString(), start, j+1)
      i = j + 1
    } else if (b === 0x5b) { emit('array-open', null, i, i+1); i++ }
    else if (b === 0x5d) { emit('array-close', null, i, i+1); i++ }
    else if (b === 0x2f) {
      // Name
      i++
      const nStart = i
      while (i < buf.length && !WS.has(buf[i]) && !DELIM.has(buf[i])) i++
      emit('name', Buffer.from(buf.subarray(nStart, i)).toString('utf8'), start, i)
    } else {
      // Number or operator — collect until whitespace/delim
      const aStart = i
      while (i < buf.length && !WS.has(buf[i]) && !DELIM.has(buf[i])) i++
      const raw = Buffer.from(buf.subarray(aStart, i)).toString('utf8')
      // Classify: number if matches [+-]?\d+(\.\d+)? | \.\d+
      if (/^[+-]?(\d+(\.\d+)?|\.\d+)$/.test(raw)) {
        emit('number', parseFloat(raw), start, i)
      } else {
        emit('operator', raw, start, i)
      }
    }
  }
  return tokens
}

const t0 = Date.now()
const tokens = tokenize(stream)
const parseMs = Date.now() - t0
log(`## (3) Tokenizer results`)
log(`- Tokenized ${stream.length} bytes into ${tokens.length} tokens in ${parseMs}ms`)
const opCounts = {}
for (const t of tokens) {
  if (t.type === 'operator') opCounts[t.value] = (opCounts[t.value] || 0) + 1
}
log(`- Operator histogram (top 15):`)
const sorted = Object.entries(opCounts).sort((a, b) => b[1] - a[1]).slice(0, 15)
for (const [op, n] of sorted) log(`  - \`${op}\`: ${n}`)

// ---- 4. Locate a Tj with "Kurzfristige" in its string operand
log(`\n## (4) Locate Tj with "Kurzfristige" substring`)
let found = 0
const decoder = new TextDecoder('latin1')
for (let i = 1; i < tokens.length; i++) {
  const tok = tokens[i]
  if (tok.type === 'operator' && tok.value === 'Tj') {
    const prev = tokens[i - 1]
    if (prev.type === 'string') {
      const asStr = decoder.decode(prev.value)
      if (asStr.toLowerCase().includes('kurz')) {
        found++
        log(`- **Found**: Tj op at byte [${tok.start}, ${tok.end}), string = \`${JSON.stringify(asStr)}\` (latin1-decoded; real chars depend on font encoding)`)
      }
    }
  }
}
if (found === 0) {
  log(`- No Tj found with 'kurz' substring in latin1-decoded operand.`)
  log(`- This is EXPECTED for CID (Identity-H) fonts: the string operand is 2-byte glyph indices, not characters. We'd need the font's ToUnicode CMap to decode them.`)
  // Probe: any Tj at all?
  let tjCount = 0
  let firstFewTjStrings = []
  for (let i = 1; i < tokens.length; i++) {
    const tok = tokens[i]
    if (tok.type === 'operator' && tok.value === 'Tj') {
      tjCount++
      if (firstFewTjStrings.length < 3) {
        const prev = tokens[i - 1]
        if (prev.type === 'string') {
          firstFewTjStrings.push(Array.from(prev.value).slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join(' '))
        }
      }
    }
  }
  log(`- Total \`Tj\` operators in stream: ${tjCount}`)
  log(`- First 3 Tj operand bytes (hex, first 12 bytes each): ${JSON.stringify(firstFewTjStrings)}`)
  log(`- Verdict: op-location works; **decoding** to user-visible text requires the per-font ToUnicode CMap (a follow-up parse, tractable but +~100 LOC).`)
}

// ---- 5. Similarly count TJ ops (positioned text runs)
let tjArrayCount = 0
for (const t of tokens) {
  if (t.type === 'operator' && t.value === 'TJ') tjArrayCount++
}
log(`\n- TJ (array form, per-char positioning) count: ${tjArrayCount}`)
log(`  This is the op MuPDF emits for per-char-x-array tspans in its SVG. Preserved intact through graft.`)

log(`\n## Summary`)
log(`- **No ready-made operator iterator** in mupdf.js. Roll our own.`)
log(`- **Tokenizer complexity**: ~120 LOC of straightforward table-driven parser. Runs at ${parseMs}ms for a ${stream.length}-byte stream — fast enough.`)
log(`- **Finding a specific text op requires** ToUnicode CMap decoding when the font is CID (Identity-H). Additional ~100 LOC to parse the CMap per font.`)
log(`- Phase 3 (in-place text edits) total cost: ~250 LOC for tokenizer + CMap decoder + rewrite path. Tractable.`)

srcDoc.destroy()
writeFileSync(FINDINGS, findings.join('\n') + '\n')
console.log(`\n[spike-03] findings: ${FINDINGS}`)
