import { describe, it, expect } from 'vitest'
import { postProcessPdfSvg, flattenAndScalePdfLayer, applyParsedAsBackgroundLayer, sanitizeLayerNameFromFile } from './pdfImport'
import { createDocumentModel } from './document'
import type { ParsedSvg } from './fileio'

function makeDoc(): ReturnType<typeof createDocumentModel> {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 210 297')
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs')
  svg.appendChild(defs)
  const layer = document.createElementNS('http://www.w3.org/2000/svg', 'g')
  layer.setAttribute('data-layer-name', 'Layer 1')
  svg.appendChild(layer)
  const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'g')
  overlay.setAttribute('data-role', 'overlay')
  svg.appendChild(overlay)
  return createDocumentModel(svg)
}

function fakeParsed(children: string): ParsedSvg {
  const doc = new DOMParser().parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg"><g>${children}</g></svg>`,
    'image/svg+xml',
  )
  // parseSvgString would synthesize a Layer 1 wrapper since there's no data-layer-name;
  // emulate that here.
  const synthetic = doc.createElementNS('http://www.w3.org/2000/svg', 'g')
  synthetic.setAttribute('data-layer-name', 'Layer 1')
  const wrapper = doc.documentElement.firstElementChild!
  synthetic.appendChild(wrapper)
  return { viewBox: '0 0 595 842', defs: [], layers: [synthetic] }
}

function layerFromHtml(inner: string): Element {
  const doc = new DOMParser().parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg"><g data-layer-name="Layer 1">${inner}</g></svg>`,
    'image/svg+xml',
  )
  return doc.documentElement.querySelector('g[data-layer-name]')!
}

describe('postProcessPdfSvg', () => {
  it('converts viewBox from points to millimeters', () => {
    const svg = '<svg viewBox="0 0 612 792"><rect/></svg>'
    const result = postProcessPdfSvg(svg)
    // 612pt = 215.9mm (US Letter width), 792pt = 279.4mm
    expect(result).toContain('viewBox="0.00 0.00 215.90 279.40"')
  })

  it('strips metadata elements', () => {
    const svg = '<svg viewBox="0 0 100 100"><title>Test</title><desc>Desc</desc><metadata>Meta</metadata><rect/></svg>'
    const result = postProcessPdfSvg(svg)
    expect(result).not.toContain('<title')
    expect(result).not.toContain('<desc')
    expect(result).not.toContain('<metadata')
    expect(result).toContain('<rect/>')
  })

  it('preserves <text> elements (text=text mode)', () => {
    const svg = '<svg viewBox="0 0 100 100"><text font-family="LMRoman10" font-size="12"><tspan x="10" y="20">hello</tspan></text></svg>'
    const result = postProcessPdfSvg(svg)
    expect(result).toContain('<text')
    expect(result).toContain('font-family="LMRoman10"')
    expect(result).toContain('hello')
  })

  it('preserves path elements and structure', () => {
    const svg = '<svg viewBox="0 0 595 842"><g><path d="M10 20 L30 40"/><rect x="5" y="5" width="10" height="10"/></g></svg>'
    const result = postProcessPdfSvg(svg)
    expect(result).toContain('d="M10 20 L30 40"')
    expect(result).toContain('<rect')
    expect(result).toContain('<g>')
  })

  it('handles SVG without viewBox gracefully', () => {
    const svg = '<svg><rect/></svg>'
    const result = postProcessPdfSvg(svg)
    expect(result).toContain('<rect/>')
  })
})

describe('flattenAndScalePdfLayer', () => {
  it('unwraps MuPDF anonymous <g> wrapper and applies scale to each grandchild', () => {
    const layer = layerFromHtml(
      '<g><text x="10" y="20">A</text><path d="M0 0 L1 1"/><image href="x" x="0" y="0" width="10" height="10"/></g>',
    )
    flattenAndScalePdfLayer(layer, 0.5)

    expect(layer.childElementCount).toBe(3)
    const kids = Array.from(layer.children)
    expect(kids.map(c => c.tagName.toLowerCase())).toEqual(['text', 'path', 'image'])
    for (const k of kids) {
      expect(k.getAttribute('transform')).toBe('scale(0.5)')
    }
  })

  it('composes wrapper.transform with the scale prefix on each grandchild', () => {
    const layer = layerFromHtml('<g transform="translate(10 20)"><path d="M0 0"/></g>')
    flattenAndScalePdfLayer(layer, 2)

    expect(layer.childElementCount).toBe(1)
    const p = layer.firstElementChild!
    expect(p.tagName.toLowerCase()).toBe('path')
    // scale applied first (outer), then wrapper translate, then existing (none)
    expect(p.getAttribute('transform')).toBe('scale(2) translate(10 20)')
  })

  it('preserves a grandchild transform by appending after the composed prefix', () => {
    const layer = layerFromHtml('<g transform="translate(10 20)"><path d="M0 0" transform="rotate(45)"/></g>')
    flattenAndScalePdfLayer(layer, 1)

    const p = layer.firstElementChild!
    // Order in SVG is right-to-left: the path's own rotate stays innermost.
    expect(p.getAttribute('transform')).toBe('scale(1) translate(10 20) rotate(45)')
  })

  it('does not unwrap a <g> that has an id (semantic)', () => {
    const layer = layerFromHtml('<g id="preserved"><path d="M0 0"/></g>')
    flattenAndScalePdfLayer(layer, 0.5)

    expect(layer.childElementCount).toBe(1)
    expect(layer.firstElementChild!.id).toBe('preserved')
    // Scale applied to the top-level child (the preserved <g>), not the path inside.
    expect(layer.firstElementChild!.getAttribute('transform')).toBe('scale(0.5)')
  })

  it('does not unwrap when layer has multiple top-level children', () => {
    const layer = layerFromHtml('<path d="M0 0"/><rect x="1" y="1" width="2" height="2"/>')
    flattenAndScalePdfLayer(layer, 2)

    expect(layer.childElementCount).toBe(2)
    expect(layer.children[0].getAttribute('transform')).toBe('scale(2)')
    expect(layer.children[1].getAttribute('transform')).toBe('scale(2)')
  })

  it('does not unwrap a non-<g> single child (e.g. a <path> directly)', () => {
    const layer = layerFromHtml('<path d="M0 0"/>')
    flattenAndScalePdfLayer(layer, 3)

    expect(layer.childElementCount).toBe(1)
    expect(layer.firstElementChild!.tagName.toLowerCase()).toBe('path')
    expect(layer.firstElementChild!.getAttribute('transform')).toBe('scale(3)')
  })

  it('is idempotent-safe under no content', () => {
    const layer = layerFromHtml('')
    flattenAndScalePdfLayer(layer, 1)
    expect(layer.childElementCount).toBe(0)
  })
})

describe('sanitizeLayerNameFromFile', () => {
  it('strips trailing .pdf (case-insensitive)', () => {
    expect(sanitizeLayerNameFromFile('Report.pdf')).toBe('Report')
    expect(sanitizeLayerNameFromFile('Report.PDF')).toBe('Report')
  })

  it('truncates long names with ellipsis', () => {
    const long = 'a'.repeat(60) + '.pdf'
    const result = sanitizeLayerNameFromFile(long)
    expect(result.length).toBeLessThanOrEqual(40)
    expect(result.endsWith('...')).toBe(true)
  })

  it('falls back to Background for empty/whitespace', () => {
    expect(sanitizeLayerNameFromFile('.pdf')).toBe('Background')
    expect(sanitizeLayerNameFromFile('  .pdf')).toBe('Background')
  })
})

describe('applyParsedAsBackgroundLayer', () => {
  it('inserts the new layer BEFORE existing content layers (bottom of z-stack)', () => {
    const doc = makeDoc()
    const before = doc.getLayerElements()
    expect(before.length).toBe(1)
    expect(before[0].getAttribute('data-layer-name')).toBe('Layer 1')

    applyParsedAsBackgroundLayer(doc, fakeParsed('<path d="M0 0"/>'), 'Flyer.pdf')

    const after = doc.getLayerElements()
    expect(after.length).toBe(2)
    // The NEW layer is the bottom one (rendered first = behind).
    expect(after[0].getAttribute('data-layer-name')).toBe('Flyer')
    expect(after[1].getAttribute('data-layer-name')).toBe('Layer 1')
  })

  it('does not clear existing layers or their children', () => {
    const doc = makeDoc()
    const firstLayer = doc.getLayerElements()[0]
    const existingRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    firstLayer.appendChild(existingRect)

    applyParsedAsBackgroundLayer(doc, fakeParsed('<path d="M0 0"/>'), 'Flyer.pdf')

    const layerAfter = doc.getLayerElements().find(l => l.getAttribute('data-layer-name') === 'Layer 1')
    expect(layerAfter).toBeTruthy()
    expect(layerAfter!.querySelector('rect')).toBe(existingRect)
  })

  it('does not change the document viewBox', () => {
    const doc = makeDoc()
    expect(doc.svg.getAttribute('viewBox')).toBe('0 0 210 297')

    applyParsedAsBackgroundLayer(doc, fakeParsed('<path d="M0 0"/>'), 'Flyer.pdf')

    expect(doc.svg.getAttribute('viewBox')).toBe('0 0 210 297')
  })

  it('applies pt→mm scale to the imported content (via flatten helper)', () => {
    const doc = makeDoc()
    applyParsedAsBackgroundLayer(doc, fakeParsed('<path d="M0 0"/>'), 'Flyer.pdf')

    const newLayer = doc.getLayerElements().find(l => l.getAttribute('data-layer-name') === 'Flyer')!
    const path = newLayer.querySelector('path')!
    // flattenAndScalePdfLayer prepends scale(PT_TO_MM) — ≈ scale(0.35277...)
    expect(path.getAttribute('transform')).toMatch(/^scale\(0\.35/)
  })

  it('falls back to Background when filename has no stem', () => {
    const doc = makeDoc()
    applyParsedAsBackgroundLayer(doc, fakeParsed('<path d="M0 0"/>'), '.pdf')

    expect(doc.getLayerElements().some(l => l.getAttribute('data-layer-name') === 'Background')).toBe(true)
  })
})
