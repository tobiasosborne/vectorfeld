import { describe, it, expect } from 'vitest'
import { postProcessPdfSvg, flattenAndScalePdfLayer } from './pdfImport'

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
