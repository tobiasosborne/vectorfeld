// Canonicalize emitted SVG and PDF bytes into stable text forms that two
// runs of the same user story produce byte-identical output (barring real
// regressions). Byte-match on the canonical form is the gate; PNG dumps
// of the PDF are written alongside only as debugging artifacts on failure.
//
// SVG canonicalization mirrors test/roundtrip/helpers/normalizeSvg.ts:
//   - strip id="…" attributes (counter-based but session-relative)
//   - strip xmlns/xmlns:* duplicates re-emitted by XMLSerializer
//   - strip <title>, <desc>, <metadata>
//   - round numeric tokens to 2dp everywhere (attr values, path d, transform)
//   - alphabetize each element's attributes
//
// PDF canonicalization extracts a semantic view via pdfjs-dist:
//   - page count + page sizes (pt, rounded to 2dp)
//   - every text item (str, transform[6], width, height, fontName)
//   - every operator stream (op name + numeric args rounded to 2dp)
//   - image count per page (raw bytes not hashed — embedded image bytes can
//     be re-encoded by pdfjs; a bug that changes image count WILL be caught)
// We emit that as JSON.stringify(obj, null, 2) so diffs are line-oriented.
//
// Why not raw PDF bytes? pdf-lib object numbering and xref offsets shift
// with any internal change; font subset prefixes (BAAAAA+) rotate across
// saves. The pdfjs extract is what a human would call "the same document".

import { JSDOM } from '/home/tobias/Projects/vectorfeld/node_modules/jsdom/lib/api.js'

const DECIMAL_RE = /-?\d+\.\d+(?:[eE][-+]?\d+)?/g
const STRIP_TAGS = new Set(['title', 'desc', 'metadata'])

function round2Str(s) {
  return String(s).replace(DECIMAL_RE, (m) => {
    const n = parseFloat(m)
    if (!Number.isFinite(n)) return m
    const fixed = n.toFixed(2)
    return fixed.replace(/\.?0+$/, '') || '0'
  })
}

function round2Num(n) {
  if (!Number.isFinite(n)) return n
  return Math.round(n * 100) / 100
}

// Namespaces we need to round-trip through setAttributeNS. XMLSerializer
// re-emits xmlns/xmlns:xlink from these; setAttribute on a name with a
// colon throws in jsdom (strict XML semantics).
const NS = {
  xml: 'http://www.w3.org/XML/1998/namespace',
  xlink: 'http://www.w3.org/1999/xlink',
  xmlns: 'http://www.w3.org/2000/xmlns/',
}

// Inside each function-call in a transform attribute, collapse
// whitespace/comma argument separators to a single ", " so
// `rotate(45 110 140)` and `rotate(45, 110, 140)` normalize to the
// same string.
function normalizeTransformArgs(s) {
  return s.replace(/\(([^)]*)\)/g, (_, inner) => {
    const parts = inner.trim().split(/[\s,]+/).filter(Boolean)
    return `(${parts.join(', ')})`
  })
}

function walkAndStrip(el) {
  const survivors = []
  for (const attr of Array.from(el.attributes)) {
    if (attr.name === 'id') continue
    if (attr.name === 'xmlns' || attr.name.startsWith('xmlns:')) continue
    let val = round2Str(attr.value)
    if (attr.name === 'transform') val = normalizeTransformArgs(val)
    survivors.push([attr.name, val])
  }
  for (const a of Array.from(el.attributes)) {
    if (a.namespaceURI) el.removeAttributeNS(a.namespaceURI, a.localName)
    else el.removeAttribute(a.name)
  }
  survivors.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  for (const [name, value] of survivors) {
    const colon = name.indexOf(':')
    if (colon > 0) {
      const prefix = name.slice(0, colon)
      const ns = NS[prefix]
      if (ns) {
        el.setAttributeNS(ns, name, value)
        continue
      }
    }
    el.setAttribute(name, value)
  }

  for (const child of Array.from(el.children)) {
    if (STRIP_TAGS.has(child.tagName.toLowerCase())) {
      child.remove()
      continue
    }
    walkAndStrip(child)
  }
}

// Collapse inter-element whitespace so pretty-printed input and
// single-line XMLSerializer output both canonicalize to the same string.
// This does not affect whitespace inside <text>/<tspan> (preserved by
// the DOM as text nodes, which outerHTML emits without the collapse).
function collapseInterElementWhitespace(s) {
  return s.replace(/>\s+</g, '><')
}

export function canonicalizeSvg(svgString) {
  const dom = new JSDOM(svgString, { contentType: 'image/svg+xml' })
  const root = dom.window.document.documentElement
  // Drop whitespace-only text nodes between elements so re-serialization
  // produces a canonical single-line form.
  const walker = dom.window.document.createTreeWalker(root, 4 /* SHOW_TEXT */)
  const drop = []
  let n = walker.currentNode
  while (n) {
    const text = /** @type {Text} */ (n)
    if (text.parentElement && text.parentElement.tagName !== 'text' && text.parentElement.tagName !== 'tspan') {
      if (/^\s*$/.test(text.data)) drop.push(text)
    }
    n = walker.nextNode()
  }
  for (const t of drop) t.remove()
  walkAndStrip(root)
  return collapseInterElementWhitespace(dom.window.document.documentElement.outerHTML)
}

// ---- PDF canonicalization via pdfjs-dist ----
// Lazy import so this module still loads in environments without pdfjs;
// tests use Node and pdfjs is a devDep.

async function loadPdfjs() {
  const mod = await import('/home/tobias/Projects/vectorfeld/node_modules/pdfjs-dist/legacy/build/pdf.mjs')
  return mod
}

export async function canonicalizePdf(pdfBytes) {
  const pdfjs = await loadPdfjs()
  const loadingTask = pdfjs.getDocument({
    data: pdfBytes,
    disableFontFace: true,
    useSystemFonts: false,
    isEvalSupported: false,
  })
  const doc = await loadingTask.promise
  const out = {
    pageCount: doc.numPages,
    pages: [],
  }
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const vp = page.getViewport({ scale: 1 })
    const textContent = await page.getTextContent()
    const opList = await page.getOperatorList()
    const fnMap = Object.entries(pdfjs.OPS).reduce((acc, [k, v]) => { acc[v] = k; return acc }, {})

    let imageCount = 0
    const ops = []
    for (let j = 0; j < opList.fnArray.length; j++) {
      const opName = fnMap[opList.fnArray[j]] || String(opList.fnArray[j])
      const args = (opList.argsArray[j] || []).map(a => {
        if (Array.isArray(a)) return a.map(x => typeof x === 'number' ? round2Num(x) : String(x))
        if (typeof a === 'number') return round2Num(a)
        if (a && typeof a === 'object') return '[obj]'
        return a
      })
      if (opName === 'paintImageXObject' || opName === 'paintInlineImageXObject' || opName === 'paintJpegXObject') {
        imageCount++
      }
      ops.push({ op: opName, args })
    }

    out.pages.push({
      width: round2Num(vp.width),
      height: round2Num(vp.height),
      text: textContent.items.map(it => ({
        str: it.str,
        transform: (it.transform || []).map(round2Num),
        width: round2Num(it.width),
        height: round2Num(it.height),
        // pdfjs tags fonts as "g_d{docId}_f{idx}" — docId is a process-scope
        // counter that changes on every load, so strip it. The fontIdx is
        // meaningful (distinguishes fonts within the same PDF).
        fontName: (it.fontName || '').replace(/^g_d\d+_/, 'g_') || null,
      })),
      imageCount,
      ops,
    })
  }
  await doc.destroy()
  // Final sweep: any `g_d<N>_` token that leaked into op args (setFont
  // references font keys by their pdfjs-internal id) → normalize. Done on
  // the serialized string so we catch every site without enumerating them.
  return JSON.stringify(out, null, 2).replace(/g_d\d+_/g, 'g_')
}
