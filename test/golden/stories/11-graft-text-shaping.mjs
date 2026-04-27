// Story 11: Open a source PDF, add new shaped text, export through
// the graft engine.
//
// Locks the vectorfeld-yyj contract:
//   - new text emitted via emitText goes through fontkit shaping
//     (GSUB ligatures, GPOS kerning), embedded as Type-0 / Identity-H
//     Carlito;
//   - mupdf.addFont auto-attaches /ToUnicode so pdfjs decodes the
//     ligature glyph back to its source codepoints.
//
// Two defense-in-depth assertions on top of the byte-match:
//   (1) pdfjs.getTextContent() decodes "office" cleanly (proves
//       /ToUnicode is intact end-to-end).
//   (2) The PDF content stream for the overlay contains a TJ array
//       (`[<...>] TJ`) — proves we took the shaped path and didn't
//       silently fall back to simple-encoded `(text) Tj`.
//
// Why open a source PDF: routing in fileio.shouldUseGraftEngine
// requires a primary source for graft to fire. Adding a NEW text
// element to a source-imported layer routes through graft post-
// vectorfeld-87h (yyj-6). A fully overlay-only doc would gate to
// pdf-lib and miss the contract under test.

import { existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const FIXTURE = resolve(here, '..', '..', 'dogfood', 'fixtures', 'Flyer Swift Vortragscoaching 15.04.2026 noheader.pdf')

const NEW_TEXT = 'office Ta WA'

export const name = '11-graft-text-shaping'

export async function run(page, h) {
  if (!existsSync(FIXTURE)) {
    throw new Error(`fixture missing: ${FIXTURE}`)
  }

  // 1. Import the source PDF so the engine routes through graft.
  const fcPromise = page.waitForEvent('filechooser')
  await h.openFileMenu()
  await page.getByText('Open PDF...', { exact: true }).click()
  const fc = await fcPromise
  await fc.setFiles(FIXTURE)
  await page.waitForFunction(
    () => {
      const layers = document.querySelectorAll('g[data-layer-name]')
      return layers.length >= 1 && (layers[0]?.children.length || 0) > 20
    },
    { timeout: 30000 },
  )

  // 2. Add a new text element with content that exercises shaping:
  //    "office" — has 'ffi' ligature in Carlito's GSUB liga set.
  //    "Ta"     — classic GPOS kern pair (xAdvance < advanceWidth).
  //    "WA"     — another standard kern pair.
  //
  //    DOM-direct insertion (matching gates 06 and 10's pattern)
  //    until the SelectTool's group-drill-in lands. Mounted into
  //    the same source layer, untagged → counts as "new" content
  //    per collectNewLeaves → engine routes through graft (mixed-
  //    with-additions allowed post-yyj-6).
  await h.clickTool('select')
  const placed = await page.evaluate((text) => {
    const layer = document.querySelector('g[data-layer-name]')
    if (!layer) return false
    const SVG_NS = 'http://www.w3.org/2000/svg'
    const t = document.createElementNS(SVG_NS, 'text')
    // Pick a position near the bottom of the page in mm-space — the
    // source PDF is 210×297; place at (20, 280) so the overlay sits
    // in a clear area. Font-family Carlito so the registry resolves
    // correctly; size 8 pt-equivalent (mm-space).
    t.setAttribute('x', '20')
    t.setAttribute('y', '280')
    t.setAttribute('font-size', '6')
    t.setAttribute('font-family', 'Carlito')
    t.setAttribute('fill', '#0033cc')
    t.textContent = text
    layer.appendChild(t)
    return true
  }, NEW_TEXT)
  if (!placed) throw new Error('11: failed to insert new text element into the imported layer')

  const svg = await h.captureExportSvg()
  const pdf = await h.captureExportPdf()
  const pdfBytes = new Uint8Array(pdf)

  // 3+4. Defense-in-depth: open the PDF once via pdfjs and run both
  //      assertions in the same session (pdfjs detaches the input
  //      buffer on getDocument, so a second getDocument call would
  //      need a fresh copy — keep it to one pass).
  //      (a) pdfjs reads "office" cleanly via /ToUnicode.
  //      (b) The op list contains showSpacedText (pdfjs's name for
  //          TJ), proving emitText took the shaped path. A regression
  //          to simple `(text) Tj` would canonicalize to showText.
  const doc = await pdfjsLib.getDocument({ data: pdfBytes, useSystemFonts: false }).promise
  try {
    const p = await doc.getPage(1)
    const tc = await p.getTextContent()
    const joined = tc.items.map((it) => it.str || '').join('')
    if (!joined.includes('office')) {
      throw new Error(
        `11: pdfjs.getTextContent did not decode "office" — /ToUnicode CMap regression. ` +
        `Got: ${JSON.stringify(joined.slice(-100))}`,
      )
    }
    if (!joined.includes('Ta') || !joined.includes('WA')) {
      throw new Error(
        `11: pdfjs missing kern-pair text — got ${JSON.stringify(joined.slice(-100))}`,
      )
    }
    // pdfjs canonicalizes both `Tj` and `TJ` as `showText` at the op
    // name level; the difference is in args. A simple `(text) Tj`
    // produces a showText whose single arg is a single text run; a
    // shaped `[<hex>(num)<hex>] TJ` produces a showText whose arg
    // is an array containing multiple runs interspersed with numeric
    // kern adjustments. We detect the shaped path by finding any
    // showText op whose args[0] is an array containing at least one
    // numeric element — proves a kern adjustment landed inline.
    //
    // Notes on robustness: with "Ta" and "WA" both being known
    // tightening pairs in Carlito's GPOS table, AT LEAST one numeric
    // element should appear. If shaping regresses to literal-string
    // Tj, args[0] becomes a single object (no numerics), this check
    // fires.
    const opList = await p.getOperatorList()
    const fnMap = Object.entries(pdfjsLib.OPS).reduce((acc, [k, v]) => { acc[v] = k; return acc }, {})
    let foundKernedShowText = false
    for (let i = 0; i < opList.fnArray.length; i++) {
      const opName = fnMap[opList.fnArray[i]]
      if (opName !== 'showText') continue
      const args = opList.argsArray[i] || []
      const arr = Array.isArray(args[0]) ? args[0] : null
      if (arr && arr.some((x) => typeof x === 'number')) {
        foundKernedShowText = true
        break
      }
    }
    if (!foundKernedShowText) {
      throw new Error(
        `11: no shaped TJ with inline kern adjustment found — emitText regressed to simple Tj`,
      )
    }
  } finally {
    await doc.destroy()
  }

  return { svg, pdf }
}
