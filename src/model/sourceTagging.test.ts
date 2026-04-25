import { describe, it, expect } from 'vitest'
import {
  tagImportedLayer,
  getSourceMeta,
  isFromSource,
  getLayerSourceId,
  lookupSourceEntry,
  PRIMARY_LAYER_ID,
  SRC_PAGE_ATTR,
  SRC_LAYER_ATTR,
  LAYER_SOURCE_PDF_ID_ATTR,
} from './sourceTagging'
import { SourcePdfStore } from './sourcePdf'

const SVG_NS = 'http://www.w3.org/2000/svg'

function makeLayer(): Element {
  const layer = document.createElementNS(SVG_NS, 'g')
  layer.setAttribute('data-layer-name', 'Layer 1')
  return layer
}

function appendChild(parent: Element, tag: string, attrs: Record<string, string> = {}): Element {
  const el = document.createElementNS(SVG_NS, tag)
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
  parent.appendChild(el)
  return el
}

describe('tagImportedLayer', () => {
  it('stamps the stable layer-source-pdf-id on the layer', () => {
    const layer = makeLayer()
    tagImportedLayer(layer, { page: 0, layerId: 'Yellow BG' })
    expect(layer.getAttribute(LAYER_SOURCE_PDF_ID_ATTR)).toBe('Yellow BG')
    expect(getLayerSourceId(layer)).toBe('Yellow BG')
  })

  it('tags every taggable leaf with page + layer-id', () => {
    const layer = makeLayer()
    const text = appendChild(layer, 'text')
    appendChild(text, 'tspan')
    appendChild(layer, 'path')
    appendChild(layer, 'image')
    appendChild(layer, 'rect')
    appendChild(layer, 'circle')
    appendChild(layer, 'ellipse')
    appendChild(layer, 'line')
    appendChild(layer, 'polygon')
    appendChild(layer, 'polyline')

    tagImportedLayer(layer, { page: 0, layerId: PRIMARY_LAYER_ID })

    for (const tag of ['text', 'tspan', 'path', 'image', 'rect', 'circle', 'ellipse', 'line', 'polygon', 'polyline']) {
      const el = layer.querySelector(tag)!
      expect(el.getAttribute(SRC_PAGE_ATTR)).toBe('0')
      expect(el.getAttribute(SRC_LAYER_ATTR)).toBe(PRIMARY_LAYER_ID)
    }
  })

  it('does not tag containers (g, defs)', () => {
    const layer = makeLayer()
    const inner = appendChild(layer, 'g')
    const defs = appendChild(layer, 'defs')

    tagImportedLayer(layer, { page: 2, layerId: 'bg' })

    expect(inner.getAttribute(SRC_PAGE_ATTR)).toBeNull()
    expect(defs.getAttribute(SRC_PAGE_ATTR)).toBeNull()
  })

  it('recurses through containers to tag nested leaves', () => {
    const layer = makeLayer()
    const inner = appendChild(layer, 'g', { transform: 'translate(10 20)' })
    const path = appendChild(inner, 'path', { d: 'M0 0 L1 1' })

    tagImportedLayer(layer, { page: 5, layerId: 'deep' })

    expect(path.getAttribute(SRC_PAGE_ATTR)).toBe('5')
    expect(path.getAttribute(SRC_LAYER_ATTR)).toBe('deep')
    // Container untouched.
    expect(inner.getAttribute(SRC_PAGE_ATTR)).toBeNull()
  })

  it('preserves existing attributes on tagged elements', () => {
    const layer = makeLayer()
    const text = appendChild(layer, 'text', { x: '10', y: '20', 'font-family': 'Calibri' })

    tagImportedLayer(layer, { page: 0, layerId: PRIMARY_LAYER_ID })

    expect(text.getAttribute('x')).toBe('10')
    expect(text.getAttribute('y')).toBe('20')
    expect(text.getAttribute('font-family')).toBe('Calibri')
    expect(text.getAttribute(SRC_PAGE_ATTR)).toBe('0')
  })
})

describe('getSourceMeta', () => {
  it('round-trips what tagImportedLayer wrote', () => {
    const layer = makeLayer()
    const path = appendChild(layer, 'path')
    tagImportedLayer(layer, { page: 3, layerId: 'mark' })
    expect(getSourceMeta(path)).toEqual({ page: 3, layerId: 'mark' })
  })

  it('returns null on untagged elements', () => {
    const el = document.createElementNS(SVG_NS, 'rect')
    expect(getSourceMeta(el)).toBeNull()
  })

  it('returns null when page attr is non-numeric', () => {
    const el = document.createElementNS(SVG_NS, 'path')
    el.setAttribute(SRC_PAGE_ATTR, 'abc')
    el.setAttribute(SRC_LAYER_ATTR, 'x')
    expect(getSourceMeta(el)).toBeNull()
  })
})

describe('isFromSource', () => {
  it('true when both attrs present', () => {
    const layer = makeLayer()
    const path = appendChild(layer, 'path')
    tagImportedLayer(layer, { page: 0, layerId: 'x' })
    expect(isFromSource(path)).toBe(true)
  })

  it('false on untagged elements', () => {
    const el = document.createElementNS(SVG_NS, 'rect')
    expect(isFromSource(el)).toBe(false)
  })
})

describe('lookupSourceEntry', () => {
  it('PRIMARY_LAYER_ID resolves to store.getPrimary()', () => {
    const store = new SourcePdfStore()
    const entry = { bytes: new Uint8Array([1]), filename: 'a.pdf', pageCount: 1 }
    store.setPrimary(entry)
    expect(lookupSourceEntry(store, PRIMARY_LAYER_ID)).toBe(entry)
  })

  it('background layer-id resolves to the matching background entry', () => {
    const store = new SourcePdfStore()
    const entry = { bytes: new Uint8Array([2]), filename: 'b.pdf', pageCount: 1 }
    store.addBackground('Yellow BG', entry)
    expect(lookupSourceEntry(store, 'Yellow BG')).toBe(entry)
  })

  it('returns null when the lookup misses', () => {
    const store = new SourcePdfStore()
    expect(lookupSourceEntry(store, PRIMARY_LAYER_ID)).toBeNull()
    expect(lookupSourceEntry(store, 'no-such-bg')).toBeNull()
  })
})
