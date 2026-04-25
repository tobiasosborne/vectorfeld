// @vitest-environment node
/// <reference types="node" />
/**
 * Real-flyer round-trip integration test for the graft engine
 * (vectorfeld-6d0). Exports the noheader flyer through the graft
 * pipeline with ZERO edits, then verifies the result is visually
 * indistinguishable from the source via a `pdftoppm` raster + pngjs +
 * pixelmatch pixel diff. Strict threshold (≤0.5% mismatch) — graft
 * is supposed to be byte-equivalent at the page-content level so any
 * drift is news.
 *
 * Bypasses the production import path (which uses Vite ?worker
 * imports for MuPDF) by constructing the graft-engine input state
 * directly: tagged-but-empty layer + source bytes in the store. The
 * graft engine doesn't read SVG content for pure-graft layers — it
 * byte-copies source page 0 — so the SVG content is irrelevant.
 *
 * Uses pdftoppm (poppler) rather than pdfjs-dist for rendering
 * because pdfjs's node-canvas backend can't draw inline images via
 * its drawImageAtIntegerCoords path; the flyer has an inline UK-flag
 * image that triggers the bug. Same workaround the spike-01 harness
 * uses.
 *
 * Runs in node env. DOM is provided by JSDOM so the model code's
 * Element + querySelector + DOMParser usage works.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs'
import { resolve } from 'node:path'
import { execSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { PNG } from 'pngjs'
import pixelmatch from 'pixelmatch'
import { JSDOM } from 'jsdom'

import { exportPdfBytes } from '../../src/model/fileio'
import { createDocumentModel } from '../../src/model/document'
import { SourcePdfStore, setActiveSourcePdfStore } from '../../src/model/sourcePdf'
import { tagImportedLayer, PRIMARY_LAYER_ID } from '../../src/model/sourceTagging'
import { snapshotImportedElements } from '../../src/model/sourceSnapshot'

const SVG_NS = 'http://www.w3.org/2000/svg'
const FLYER_PATH = resolve(
  process.cwd(),
  'test/dogfood/fixtures/Flyer Swift Vortragscoaching 15.04.2026 noheader.pdf',
)
const TMP_DIR = resolve(tmpdir(), 'vf-graft-roundtrip')

let flyerBytes: Uint8Array

beforeAll(() => {
  flyerBytes = new Uint8Array(readFileSync(FLYER_PATH))
  if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true })
  // Hoist a JSDOM document onto the global scope so the production
  // model code (DOMParser, Element, document.createElementNS, …)
  // works in the node test environment.
  const dom = new JSDOM(
    `<svg xmlns="${SVG_NS}"/>`,
    { contentType: 'image/svg+xml' },
  )
  ;(globalThis as unknown as { document: Document }).document = dom.window.document
  ;(globalThis as unknown as { DOMParser: typeof DOMParser }).DOMParser = dom.window.DOMParser
  ;(globalThis as unknown as { XMLSerializer: typeof XMLSerializer }).XMLSerializer = dom.window.XMLSerializer
  ;(globalThis as unknown as { Element: typeof Element }).Element = dom.window.Element
  ;(globalThis as unknown as { Node: typeof Node }).Node = dom.window.Node
})

function setupGraftDoc(): import('../../src/model/document').DocumentModel {
  const docSvg = new (globalThis as unknown as { DOMParser: typeof DOMParser })
    .DOMParser()
    .parseFromString(
      `<svg xmlns="${SVG_NS}" viewBox="0 0 210 297"><g data-layer-name="Imported"/></svg>`,
      'image/svg+xml',
    ).documentElement as unknown as SVGSVGElement
  const layer = docSvg.querySelector('g[data-layer-name]')!
  tagImportedLayer(layer, { page: 0, layerId: PRIMARY_LAYER_ID })
  snapshotImportedElements(layer)

  const store = new SourcePdfStore()
  store.setPrimary({ bytes: flyerBytes, filename: 'flyer.pdf', pageCount: 1 })
  setActiveSourcePdfStore(store)

  return createDocumentModel(docSvg)
}

/** Render PDF page 1 to a PNG file via pdftoppm and return the PNG bytes.
 *  Higher-fidelity than pdfjs+node-canvas for PDFs containing inline
 *  images (which the pdfjs node backend can't paint). */
function rasterize(pdfBytes: Uint8Array, label: string, dpi = 100): Uint8Array {
  const pdfPath = resolve(TMP_DIR, `${label}.pdf`)
  const pngPrefix = resolve(TMP_DIR, `${label}-render`)
  writeFileSync(pdfPath, pdfBytes)
  execSync(`pdftoppm -r ${dpi} -f 1 -l 1 -png "${pdfPath}" "${pngPrefix}"`, {
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const pngPath = `${pngPrefix}-1.png`
  const bytes = new Uint8Array(readFileSync(pngPath))
  // Cleanup transient files; keep no test detritus in /tmp.
  unlinkSync(pdfPath)
  unlinkSync(pngPath)
  return bytes
}

describe('graftRoundtrip — real flyer fixture', () => {
  it('exports with zero edits and renders ≤0.5% pixel-different from source', { timeout: 120_000 }, async () => {
    const doc = setupGraftDoc()
    const out = await exportPdfBytes(doc, { fonts: {}, carlito: new Uint8Array(0) })
    expect(out.length).toBeGreaterThan(0)

    const sourcePng = rasterize(flyerBytes, 'src')
    const outPng = rasterize(out, 'graft')

    const src = PNG.sync.read(Buffer.from(sourcePng))
    const dst = PNG.sync.read(Buffer.from(outPng))
    expect(dst.width).toBe(src.width)
    expect(dst.height).toBe(src.height)

    const diff = new PNG({ width: src.width, height: src.height })
    const mismatch = pixelmatch(
      src.data,
      dst.data,
      diff.data,
      src.width,
      src.height,
      { threshold: 0.1 },
    )
    const total = src.width * src.height
    const pct = (mismatch / total) * 100
    // Spike-01 verified 0.0000% on this fixture against the same DPI.
    // Allow some headroom for poppler version drift.
    expect(pct).toBeLessThan(0.5)
  })

  it('graft engine output is significantly smaller than a re-rendered re-export of the source would be', async () => {
    // Sanity check that the graft path actually fired: graft preserves
    // source compression, while pdf-lib re-renders into typically larger
    // streams (especially when fonts get re-embedded). Source flyer is
    // ~700KB; graft output should be in the same ballpark, definitely not
    // 5x larger as pdf-lib re-renders tend to be.
    const doc = setupGraftDoc()
    const out = await exportPdfBytes(doc, { fonts: {}, carlito: new Uint8Array(0) })
    // 2x source size as the loose bound.
    expect(out.length).toBeLessThan(flyerBytes.length * 2)
  })
})
