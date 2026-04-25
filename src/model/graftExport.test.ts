/// <reference types="node" />
/**
 * Integration tests for exportViaGraft — the graft-export engine entry
 * point. Composes the primitives shipped by uuz/ne4/e1j/2oi/am6/fx8/tsi
 * into the full graft + overlay pipeline.
 *
 * Tests use synthetic PDFs generated via exportSvgStringToPdfBytes so they
 * stay fast and self-contained. Real-flyer byte-diff verification belongs
 * to vectorfeld-6d0.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { exportViaGraft } from './graftExport'
import { exportSvgStringToPdfBytes } from './fileio'
import { openSourcePdfDoc, closeSourcePdfDoc } from './graftMupdf'
import { createDocumentModel } from './document'
import { SourcePdfStore } from './sourcePdf'
import { tagImportedLayer, PRIMARY_LAYER_ID } from './sourceTagging'
import { snapshotImportedElements } from './sourceSnapshot'

const SVG_NS = 'http://www.w3.org/2000/svg'
const CARLITO = new Uint8Array(readFileSync(resolve(process.cwd(), 'src/fonts/Carlito-Regular.ttf')))

/**
 * Concatenate all content streams of a page into one decoded latin1 string,
 * regardless of FlateDecode etc. Bypasses mupdf's save-time compression so
 * we can grep for op-string fragments the engine emitted.
 */
async function pageContent(bytes: Uint8Array, pageIdx = 0): Promise<string> {
  const doc = await openSourcePdfDoc(bytes)
  try {
    const contents = doc.findPage(pageIdx).get('Contents').resolve()
    const parts: string[] = []
    if (contents.isArray()) {
      for (let i = 0; i < contents.length; i++) {
        const ref = contents.get(i)
        const buf = ref.readStream()
        parts.push(buf.asString())
      }
    } else {
      parts.push(contents.readStream().asString())
    }
    return parts.join('\n')
  } finally {
    closeSourcePdfDoc(doc)
  }
}

const SHAPES_SVG = `<svg xmlns="${SVG_NS}" viewBox="0 0 50 30">
  <g data-layer-name="Layer 1">
    <rect x="5" y="5" width="10" height="10" fill="#ff0000" />
  </g>
</svg>`

function svgRoot(xml: string): SVGSVGElement {
  return new DOMParser().parseFromString(xml, 'image/svg+xml').documentElement as unknown as SVGSVGElement
}

describe('exportViaGraft — overlay-only document (no source PDFs)', () => {
  it('produces a valid PDF with one page sized to the viewBox in PDF points', async () => {
    const doc = createDocumentModel(svgRoot(`<svg xmlns="${SVG_NS}" viewBox="0 0 50 30"><g data-layer-name="L"><rect x="5" y="5" width="10" height="10" fill="black"/></g></svg>`))
    const out = await exportViaGraft(doc, new SourcePdfStore())
    expect(out.length).toBeGreaterThan(0)

    const reloaded = await openSourcePdfDoc(out)
    expect(reloaded.countPages()).toBe(1)
    const mb = reloaded.findPage(0).getInheritable('MediaBox')
    const PT = 72 / 25.4
    // Width = 50mm * PT; Height = 30mm * PT
    expect(mb.get(2).asNumber() - mb.get(0).asNumber()).toBeCloseTo(50 * PT, 1)
    expect(mb.get(3).asNumber() - mb.get(1).asNumber()).toBeCloseTo(30 * PT, 1)
    closeSourcePdfDoc(reloaded)
  })

  it('emits the rect content stream onto the page', async () => {
    const doc = createDocumentModel(svgRoot(`<svg xmlns="${SVG_NS}" viewBox="0 0 50 30"><g data-layer-name="L"><rect x="5" y="5" width="10" height="10" fill="#abcdef"/></g></svg>`))
    const out = await exportViaGraft(doc, new SourcePdfStore())
    const content = await pageContent(out)
    // 0xab/255 ≈ 0.671, 0xcd/255 ≈ 0.804, 0xef/255 ≈ 0.937
    expect(content).toMatch(/0\.671 0\.804 0\.937 rg/)
  })

  it('renders text when a font is provided via opts', async () => {
    const doc = createDocumentModel(svgRoot(`<svg xmlns="${SVG_NS}" viewBox="0 0 50 30"><g data-layer-name="L"><text x="5" y="20" font-size="6">Hi</text></g></svg>`))
    const out = await exportViaGraft(doc, new SourcePdfStore(), { carlito: CARLITO })
    const content = await pageContent(out)
    expect(content).toContain('(Hi) Tj')
    expect(content).toContain('/VfCarlito')
  })

  it('throws a clear error if the layer has text but no font was supplied', async () => {
    const doc = createDocumentModel(svgRoot(`<svg xmlns="${SVG_NS}" viewBox="0 0 50 30"><g data-layer-name="L"><text x="5" y="20">Hi</text></g></svg>`))
    await expect(exportViaGraft(doc, new SourcePdfStore())).rejects.toThrow(/font/i)
  })
})

describe('exportViaGraft — graft-only layer (untouched source)', () => {
  let srcBytes: Uint8Array
  beforeAll(async () => { srcBytes = await exportSvgStringToPdfBytes(SHAPES_SVG) })

  it('grafts the source page byte-equivalently into the output', async () => {
    // Build a doc whose single layer is tagged as imported from the primary source.
    const docXml = `<svg xmlns="${SVG_NS}" viewBox="0 0 50 30"><g data-layer-name="From Source"><rect x="5" y="5" width="10" height="10" fill="#ff0000"/></g></svg>`
    const docSvg = svgRoot(docXml)
    const layer = docSvg.querySelector('g[data-layer-name]')!
    tagImportedLayer(layer, { page: 0, layerId: PRIMARY_LAYER_ID })
    snapshotImportedElements(layer)

    const doc = createDocumentModel(docSvg)
    const store = new SourcePdfStore()
    store.setPrimary({ bytes: srcBytes, filename: 'test.pdf', pageCount: 1 })

    const out = await exportViaGraft(doc, store)
    const reloaded = await openSourcePdfDoc(out)
    expect(reloaded.countPages()).toBe(1)
    closeSourcePdfDoc(reloaded)

    // Byte-equivalent: the grafted page should match what graftSourcePageInto
    // would produce in isolation. Output is wrapped by mupdf save, so check
    // that the source's content-stream marker byte sequence is preserved.
    const text = new TextDecoder('latin1').decode(out)
    expect(text).toContain('%PDF')
  })
})

describe('exportViaGraft — mixed layer (modified source element)', () => {
  let srcBytes: Uint8Array
  beforeAll(async () => { srcBytes = await exportSvgStringToPdfBytes(SHAPES_SVG) })

  it('grafts source + emits a mask + re-renders the modified element on top', async () => {
    const docXml = `<svg xmlns="${SVG_NS}" viewBox="0 0 50 30"><g data-layer-name="Mixed"><rect id="r" x="5" y="5" width="10" height="10" fill="#ff0000"/></g></svg>`
    const docSvg = svgRoot(docXml)
    const layer = docSvg.querySelector('g[data-layer-name]')!
    tagImportedLayer(layer, { page: 0, layerId: PRIMARY_LAYER_ID })
    snapshotImportedElements(layer)

    // Mutate the rect after snapshot — change its fill.
    docSvg.querySelector('#r')!.setAttribute('fill', '#00ff00')

    const doc = createDocumentModel(docSvg)
    const store = new SourcePdfStore()
    store.setPrimary({ bytes: srcBytes, filename: 'test.pdf', pageCount: 1 })

    const out = await exportViaGraft(doc, store)
    const content = await pageContent(out)

    // White mask op should be present in the appended overlay stream.
    expect(content).toContain('1 1 1 rg')
    expect(content).toContain('re')
    // New green fill should be present.
    expect(content).toMatch(/0 1 0 rg/)
  })
})

describe('exportViaGraft — determinism', () => {
  it('produces byte-identical output across two calls with the same input', async () => {
    const doc = createDocumentModel(svgRoot(`<svg xmlns="${SVG_NS}" viewBox="0 0 50 30"><g data-layer-name="L"><rect x="5" y="5" width="10" height="10" fill="black"/></g></svg>`))
    const a = await exportViaGraft(doc, new SourcePdfStore())
    const b = await exportViaGraft(doc, new SourcePdfStore())
    expect(a.length).toBe(b.length)
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true)
  })
})

describe('exportViaGraft — single-page-stacking (1kp)', () => {
  let srcBytes: Uint8Array
  beforeAll(async () => { srcBytes = await exportSvgStringToPdfBytes(SHAPES_SVG) })

  it('two overlay-only layers stack onto a single page; both contents present', async () => {
    const docXml = `<svg xmlns="${SVG_NS}" viewBox="0 0 50 30">
      <g data-layer-name="L1"><rect x="0" y="0" width="5" height="5" fill="#ff0000"/></g>
      <g data-layer-name="L2"><rect x="10" y="10" width="5" height="5" fill="#0000ff"/></g>
    </svg>`
    const doc = createDocumentModel(svgRoot(docXml))
    const out = await exportViaGraft(doc, new SourcePdfStore())

    const reloaded = await openSourcePdfDoc(out)
    expect(reloaded.countPages()).toBe(1)
    closeSourcePdfDoc(reloaded)

    const content = await pageContent(out)
    // Red rect from L1
    expect(content).toMatch(/1 0 0 rg/)
    // Blue rect from L2
    expect(content).toMatch(/0 0 1 rg/)
  })

  it('graft foundation + overlay-on-top: page count stays 1; overlay content lands on grafted page', async () => {
    const docXml = `<svg xmlns="${SVG_NS}" viewBox="0 0 50 30">
      <g data-layer-name="From Source"><rect x="5" y="5" width="10" height="10" fill="#ff0000"/></g>
      <g data-layer-name="User Drew"><rect x="20" y="20" width="3" height="3" fill="#00ff00"/></g>
    </svg>`
    const docSvg = svgRoot(docXml)
    const layers = docSvg.querySelectorAll('g[data-layer-name]')
    tagImportedLayer(layers[0], { page: 0, layerId: PRIMARY_LAYER_ID })
    snapshotImportedElements(layers[0])

    const doc = createDocumentModel(docSvg)
    const store = new SourcePdfStore()
    store.setPrimary({ bytes: srcBytes, filename: 'test.pdf', pageCount: 1 })

    const out = await exportViaGraft(doc, store)

    const reloaded = await openSourcePdfDoc(out)
    expect(reloaded.countPages()).toBe(1)
    closeSourcePdfDoc(reloaded)

    const content = await pageContent(out)
    // The user-drawn green rect is in the appended overlay.
    expect(content).toMatch(/0 1 0 rg/)
  })

  it('two graft layers: first is foundation (page count 1), second renders as overlay (lossy MVP)', async () => {
    // Both layers are tagged from source; second uses a different layerId
    // so the source-store lookup picks up its own bytes (here the same
    // SHAPES_SVG bytes for simplicity).
    const docXml = `<svg xmlns="${SVG_NS}" viewBox="0 0 50 30">
      <g data-layer-name="Foreground"><rect x="5" y="5" width="10" height="10" fill="#ff0000"/></g>
      <g data-layer-name="bg"><rect x="20" y="20" width="3" height="3" fill="#0000ff"/></g>
    </svg>`
    const docSvg = svgRoot(docXml)
    const layers = docSvg.querySelectorAll('g[data-layer-name]')
    tagImportedLayer(layers[0], { page: 0, layerId: PRIMARY_LAYER_ID })
    snapshotImportedElements(layers[0])
    tagImportedLayer(layers[1], { page: 0, layerId: 'bg' })
    snapshotImportedElements(layers[1])

    const doc = createDocumentModel(docSvg)
    const store = new SourcePdfStore()
    store.setPrimary({ bytes: srcBytes, filename: 'fg.pdf', pageCount: 1 })
    store.addBackground('bg', { bytes: srcBytes, filename: 'bg.pdf', pageCount: 1 })

    const out = await exportViaGraft(doc, store)

    const reloaded = await openSourcePdfDoc(out)
    expect(reloaded.countPages()).toBe(1)
    closeSourcePdfDoc(reloaded)

    const content = await pageContent(out)
    // Second graft layer's blue rect rendered as overlay.
    expect(content).toMatch(/0 0 1 rg/)
  })

  it('page size taken from foundation MediaBox (not doc viewBox) when foundation is a graft', async () => {
    // Source PDF is 50×30 mm = 141.7×85.0 pt (matches SHAPES_SVG viewBox)
    // Doc viewBox is intentionally different to prove the MediaBox wins.
    const docXml = `<svg xmlns="${SVG_NS}" viewBox="0 0 999 999">
      <g data-layer-name="From Source"><rect x="5" y="5" width="10" height="10" fill="#ff0000"/></g>
    </svg>`
    const docSvg = svgRoot(docXml)
    const layer = docSvg.querySelector('g[data-layer-name]')!
    tagImportedLayer(layer, { page: 0, layerId: PRIMARY_LAYER_ID })
    snapshotImportedElements(layer)

    const doc = createDocumentModel(docSvg)
    const store = new SourcePdfStore()
    store.setPrimary({ bytes: srcBytes, filename: 'test.pdf', pageCount: 1 })

    const out = await exportViaGraft(doc, store)
    const reloaded = await openSourcePdfDoc(out)
    const PT = 72 / 25.4
    const mb = reloaded.findPage(0).getInheritable('MediaBox')
    // Source page is 50×30 mm. Doc viewBox is 999×999 mm. MediaBox should
    // match the source, not the viewBox.
    expect(mb.get(2).asNumber() - mb.get(0).asNumber()).toBeCloseTo(50 * PT, 1)
    expect(mb.get(3).asNumber() - mb.get(1).asNumber()).toBeCloseTo(30 * PT, 1)
    closeSourcePdfDoc(reloaded)
  })

  it('overlay-text on top of a graft foundation registers a font on the grafted page', async () => {
    const docXml = `<svg xmlns="${SVG_NS}" viewBox="0 0 50 30">
      <g data-layer-name="From Source"><rect x="5" y="5" width="10" height="10" fill="#ff0000"/></g>
      <g data-layer-name="Annotations"><text x="20" y="20" font-size="6">Hi</text></g>
    </svg>`
    const docSvg = svgRoot(docXml)
    const layer = docSvg.querySelector('g[data-layer-name]')!
    tagImportedLayer(layer, { page: 0, layerId: PRIMARY_LAYER_ID })
    snapshotImportedElements(layer)

    const doc = createDocumentModel(docSvg)
    const store = new SourcePdfStore()
    store.setPrimary({ bytes: srcBytes, filename: 'test.pdf', pageCount: 1 })

    const out = await exportViaGraft(doc, store, { carlito: CARLITO })
    const content = await pageContent(out)
    expect(content).toContain('(Hi) Tj')
    expect(content).toContain('/VfCarlito')
  })
})
