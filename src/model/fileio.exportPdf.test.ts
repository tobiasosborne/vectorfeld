/// <reference types="node" />
/**
 * Tests for exportPdfBytes — the engine-routing layer between the
 * production `exportPdf` download trigger and the two PDF engines
 * (pdf-lib for pure-SVG / composite, graftExport for single-source
 * documents).
 *
 * The conservative MVP routing rule (vectorfeld-u7r): graft engine
 * fires only when a single primary source PDF is set with no
 * background-layer composites. Anything else falls back to the
 * pdf-lib engine. Backgrounds today render as Carlito-text overlays
 * (loses source-font fidelity), which is a regression vs. the pdf-lib
 * pipeline; defer enabling the composite path until multi-graft-per-
 * page support lands.
 */

import { describe, it, expect, beforeEach, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { exportPdfBytes, exportSvgStringToPdfBytes } from './fileio'
import { createDocumentModel } from './document'
import { SourcePdfStore, setActiveSourcePdfStore } from './sourcePdf'
import { tagImportedLayer, PRIMARY_LAYER_ID } from './sourceTagging'
import { snapshotImportedElements } from './sourceSnapshot'
import { openSourcePdfDoc, closeSourcePdfDoc } from './graftMupdf'

const SVG_NS = 'http://www.w3.org/2000/svg'
const CARLITO = new Uint8Array(readFileSync(resolve(process.cwd(), 'src/fonts/Carlito-Regular.ttf')))

function svgRoot(xml: string): SVGSVGElement {
  return new DOMParser().parseFromString(xml, 'image/svg+xml').documentElement as unknown as SVGSVGElement
}

const DOC_VIEWBOX_50_30 = `<svg xmlns="${SVG_NS}" viewBox="0 0 50 30">
  <g data-layer-name="L"><rect x="5" y="5" width="10" height="10" fill="#ff0000"/></g>
</svg>`

// Source PDF whose page is 80×60 mm — different from the doc viewBox so
// the routing test can distinguish "graft used the source size" vs
// "pdf-lib used the doc viewBox".
const SOURCE_VIEWBOX_80_60 = `<svg xmlns="${SVG_NS}" viewBox="0 0 80 60">
  <g data-layer-name="L"><rect x="0" y="0" width="20" height="20" fill="#ff0000"/></g>
</svg>`

function pageSizePt(reloaded: import('mupdf').PDFDocument, pageIdx = 0): { w: number; h: number } {
  const mb = reloaded.findPage(pageIdx).getInheritable('MediaBox')
  return {
    w: mb.get(2).asNumber() - mb.get(0).asNumber(),
    h: mb.get(3).asNumber() - mb.get(1).asNumber(),
  }
}

beforeEach(() => {
  // Each test gets a fresh empty store.
  setActiveSourcePdfStore(new SourcePdfStore())
})

describe('exportPdfBytes — engine routing', () => {
  it('uses pdf-lib path when no source PDFs are registered', async () => {
    const doc = createDocumentModel(svgRoot(DOC_VIEWBOX_50_30))
    const out = await exportPdfBytes(doc, { fonts: {} })
    const reloaded = await openSourcePdfDoc(out)
    expect(reloaded.countPages()).toBe(1)
    // pdf-lib emits the page sized to the SVG viewBox.
    const PT = 72 / 25.4
    const { w, h } = pageSizePt(reloaded)
    expect(w).toBeCloseTo(50 * PT, 1)
    expect(h).toBeCloseTo(30 * PT, 1)
    closeSourcePdfDoc(reloaded)
  })

  describe('with primary source set, no backgrounds', () => {
    let srcBytes: Uint8Array
    beforeAll(async () => { srcBytes = await exportSvgStringToPdfBytes(SOURCE_VIEWBOX_80_60) })

    it('uses graft engine — page MediaBox follows the source PDF, NOT the doc viewBox', async () => {
      // Doc viewBox is 50×30; source PDF is 80×60. If graft fired, the
      // output page is 80×60. If pdf-lib fired, it'd be 50×30.
      const docSvg = svgRoot(DOC_VIEWBOX_50_30)
      const layer = docSvg.querySelector('g[data-layer-name]')!
      tagImportedLayer(layer, { page: 0, layerId: PRIMARY_LAYER_ID })
      snapshotImportedElements(layer)

      const store = new SourcePdfStore()
      store.setPrimary({ bytes: srcBytes, filename: 'src.pdf', pageCount: 1 })
      setActiveSourcePdfStore(store)

      const doc = createDocumentModel(docSvg)
      const out = await exportPdfBytes(doc, { carlito: CARLITO, fonts: {} })

      const reloaded = await openSourcePdfDoc(out)
      const PT = 72 / 25.4
      const { w, h } = pageSizePt(reloaded)
      expect(w).toBeCloseTo(80 * PT, 1)
      expect(h).toBeCloseTo(60 * PT, 1)
      closeSourcePdfDoc(reloaded)
    })
  })

  describe('with primary AND background sources (composite case)', () => {
    let srcBytes: Uint8Array
    beforeAll(async () => { srcBytes = await exportSvgStringToPdfBytes(SOURCE_VIEWBOX_80_60) })

    it('falls back to pdf-lib — page MediaBox follows the doc viewBox, NOT the source', async () => {
      // Same setup as above but with a background also registered. The
      // conservative MVP gate skips graft when backgrounds are present.
      const docSvg = svgRoot(DOC_VIEWBOX_50_30)
      const layer = docSvg.querySelector('g[data-layer-name]')!
      tagImportedLayer(layer, { page: 0, layerId: PRIMARY_LAYER_ID })
      snapshotImportedElements(layer)

      const store = new SourcePdfStore()
      store.setPrimary({ bytes: srcBytes, filename: 'fg.pdf', pageCount: 1 })
      store.addBackground('bg', { bytes: srcBytes, filename: 'bg.pdf', pageCount: 1 })
      setActiveSourcePdfStore(store)

      const doc = createDocumentModel(docSvg)
      const out = await exportPdfBytes(doc, { fonts: {} })

      const reloaded = await openSourcePdfDoc(out)
      const PT = 72 / 25.4
      const { w, h } = pageSizePt(reloaded)
      expect(w).toBeCloseTo(50 * PT, 1)
      expect(h).toBeCloseTo(30 * PT, 1)
      closeSourcePdfDoc(reloaded)
    })
  })

  describe('with primary source AND user edits', () => {
    let srcBytes: Uint8Array
    beforeAll(async () => { srcBytes = await exportSvgStringToPdfBytes(SOURCE_VIEWBOX_80_60) })

    it('falls back to pdf-lib when an imported element was MODIFIED (graft can mask but mixed not yet wired through gate)', async () => {
      const docSvg = svgRoot(DOC_VIEWBOX_50_30)
      const layer = docSvg.querySelector('g[data-layer-name]')!
      tagImportedLayer(layer, { page: 0, layerId: PRIMARY_LAYER_ID })
      snapshotImportedElements(layer)
      // Modify the rect's fill — this changes findModifiedSourceElements.
      docSvg.querySelector('rect')!.setAttribute('fill', '#00ff00')

      const store = new SourcePdfStore()
      store.setPrimary({ bytes: srcBytes, filename: 'src.pdf', pageCount: 1 })
      setActiveSourcePdfStore(store)

      const doc = createDocumentModel(docSvg)
      const out = await exportPdfBytes(doc, { fonts: {} })

      const reloaded = await openSourcePdfDoc(out)
      const PT = 72 / 25.4
      const { w, h } = pageSizePt(reloaded)
      // pdf-lib output → page sized to doc viewBox (50×30), not source.
      expect(w).toBeCloseTo(50 * PT, 1)
      expect(h).toBeCloseTo(30 * PT, 1)
      closeSourcePdfDoc(reloaded)
    })

    it('falls back to pdf-lib when an imported element was DELETED (mask bbox is unreliable for tspan-wrapped text)', async () => {
      const docSvg = svgRoot(DOC_VIEWBOX_50_30)
      const layer = docSvg.querySelector('g[data-layer-name]')!
      tagImportedLayer(layer, { page: 0, layerId: PRIMARY_LAYER_ID })
      snapshotImportedElements(layer)
      // Remove the rect from DOM. classifyLayer now returns kind='mixed'
      // with removedBboxes populated. d3o ships the mask emission, but
      // the conservative gate doesn't yet activate it because graftBbox.
      // textBox over-approximates / mis-locates bboxes for MuPDF-imported
      // tspan-wrapped text. Stays on pdf-lib until that's rebuilt.
      docSvg.querySelector('rect')!.remove()

      const store = new SourcePdfStore()
      store.setPrimary({ bytes: srcBytes, filename: 'src.pdf', pageCount: 1 })
      setActiveSourcePdfStore(store)

      const doc = createDocumentModel(docSvg)
      const out = await exportPdfBytes(doc, { fonts: {} })

      const reloaded = await openSourcePdfDoc(out)
      const PT = 72 / 25.4
      const { w, h } = pageSizePt(reloaded)
      // pdf-lib output → page sized to doc viewBox.
      expect(w).toBeCloseTo(50 * PT, 1)
      expect(h).toBeCloseTo(30 * PT, 1)
      closeSourcePdfDoc(reloaded)
    })

    it('falls back to pdf-lib when a NEW user element was added to the imported layer', async () => {
      const docSvg = svgRoot(DOC_VIEWBOX_50_30)
      const layer = docSvg.querySelector('g[data-layer-name]')!
      tagImportedLayer(layer, { page: 0, layerId: PRIMARY_LAYER_ID })
      snapshotImportedElements(layer)
      // Add a new untagged child — counts as "new" content per
      // collectNewLeaves.
      const newRect = docSvg.ownerDocument!.createElementNS(SVG_NS, 'rect')
      newRect.setAttribute('x', '0')
      newRect.setAttribute('y', '0')
      newRect.setAttribute('width', '5')
      newRect.setAttribute('height', '5')
      newRect.setAttribute('fill', '#0000ff')
      layer.appendChild(newRect)

      const store = new SourcePdfStore()
      store.setPrimary({ bytes: srcBytes, filename: 'src.pdf', pageCount: 1 })
      setActiveSourcePdfStore(store)

      const doc = createDocumentModel(docSvg)
      const out = await exportPdfBytes(doc, { fonts: {} })

      const reloaded = await openSourcePdfDoc(out)
      const PT = 72 / 25.4
      const { w, h } = pageSizePt(reloaded)
      expect(w).toBeCloseTo(50 * PT, 1)
      expect(h).toBeCloseTo(30 * PT, 1)
      closeSourcePdfDoc(reloaded)
    })
  })

  describe('with backgrounds only (no primary)', () => {
    let srcBytes: Uint8Array
    beforeAll(async () => { srcBytes = await exportSvgStringToPdfBytes(SOURCE_VIEWBOX_80_60) })

    it('falls back to pdf-lib — graft only fires for "single primary, no backgrounds"', async () => {
      const docSvg = svgRoot(DOC_VIEWBOX_50_30)
      const layer = docSvg.querySelector('g[data-layer-name]')!
      tagImportedLayer(layer, { page: 0, layerId: 'bg' })
      snapshotImportedElements(layer)

      const store = new SourcePdfStore()
      store.addBackground('bg', { bytes: srcBytes, filename: 'bg.pdf', pageCount: 1 })
      setActiveSourcePdfStore(store)

      const doc = createDocumentModel(docSvg)
      const out = await exportPdfBytes(doc, { fonts: {} })

      const reloaded = await openSourcePdfDoc(out)
      const PT = 72 / 25.4
      const { w, h } = pageSizePt(reloaded)
      expect(w).toBeCloseTo(50 * PT, 1)
      expect(h).toBeCloseTo(30 * PT, 1)
      closeSourcePdfDoc(reloaded)
    })
  })
})
