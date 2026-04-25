import { describe, it, expect } from 'vitest'
import { classifyLayer } from './graftClassify'
import { SourcePdfStore, type SourcePdfEntry } from './sourcePdf'
import { tagImportedLayer, PRIMARY_LAYER_ID } from './sourceTagging'
import { snapshotImportedElements } from './sourceSnapshot'

const SVG_NS = 'http://www.w3.org/2000/svg'

function entry(filename = 'a.pdf'): SourcePdfEntry {
  return { bytes: new Uint8Array([0]), filename, pageCount: 1 }
}

function makeUntaggedLayer(): Element {
  const layer = document.createElementNS(SVG_NS, 'g')
  layer.setAttribute('data-layer-name', 'Drawing')
  return layer
}

function appendChild(parent: Element, tag: string, attrs: Record<string, string> = {}): Element {
  const el = document.createElementNS(SVG_NS, tag)
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
  parent.appendChild(el)
  return el
}

/** Shapes a freshly-imported source layer: tags, then snapshots. */
function makeImportedLayer(layerId: string = PRIMARY_LAYER_ID): { layer: Element; rect: Element; path: Element } {
  const layer = document.createElementNS(SVG_NS, 'g')
  layer.setAttribute('data-layer-name', layerId === PRIMARY_LAYER_ID ? 'Layer 1' : layerId)
  const rect = appendChild(layer, 'rect', { x: '0', y: '0', width: '10', height: '10', fill: '#ff0000' })
  const path = appendChild(layer, 'path', { d: 'M0 0 L1 1' })
  tagImportedLayer(layer, { page: 0, layerId })
  snapshotImportedElements(layer)
  return { layer, rect, path }
}

describe('classifyLayer', () => {
  it('returns kind="overlay" when the layer has no data-source-pdf-id', () => {
    const layer = makeUntaggedLayer()
    appendChild(layer, 'rect', { x: '0', y: '0', width: '5', height: '5' })
    const store = new SourcePdfStore()
    const c = classifyLayer(layer, store)
    expect(c.kind).toBe('overlay')
  })

  it('returns kind="overlay" when the layer has source-pdf-id but the store has no entry', () => {
    const { layer } = makeImportedLayer('Yellow BG')
    const store = new SourcePdfStore()
    // intentionally NOT registered in store
    const c = classifyLayer(layer, store)
    expect(c.kind).toBe('overlay')
  })

  it('returns kind="graft" when every tagged element matches its snapshot and no new leaves were added', () => {
    const { layer } = makeImportedLayer()
    const store = new SourcePdfStore()
    const e = entry('flyer.pdf')
    store.setPrimary(e)
    const c = classifyLayer(layer, store)
    expect(c.kind).toBe('graft')
    if (c.kind === 'graft') {
      expect(c.sourceEntry).toBe(e)
    }
  })

  it('returns kind="mixed" with the modified element listed when an attr changed', () => {
    const { layer, rect } = makeImportedLayer()
    rect.setAttribute('fill', '#00ff00')
    const store = new SourcePdfStore()
    const e = entry()
    store.setPrimary(e)
    const c = classifyLayer(layer, store)
    expect(c.kind).toBe('mixed')
    if (c.kind === 'mixed') {
      expect(c.sourceEntry).toBe(e)
      expect(c.modifiedElements).toEqual([rect])
      expect(c.newElements).toEqual([])
    }
  })

  it('returns kind="mixed" with new graphical leaves listed when user adds untagged content', () => {
    const { layer } = makeImportedLayer()
    const newRect = appendChild(layer, 'rect', { x: '5', y: '5', width: '3', height: '3' })
    const store = new SourcePdfStore()
    const e = entry()
    store.setPrimary(e)
    const c = classifyLayer(layer, store)
    expect(c.kind).toBe('mixed')
    if (c.kind === 'mixed') {
      expect(c.modifiedElements).toEqual([])
      expect(c.newElements).toEqual([newRect])
    }
  })

  it('returns kind="mixed" with both lists populated when user modified existing AND added new', () => {
    const { layer, path } = makeImportedLayer()
    path.setAttribute('d', 'M9 9')
    const newText = appendChild(layer, 'text', { x: '0', y: '0' })
    newText.textContent = 'note'
    const store = new SourcePdfStore()
    store.setPrimary(entry())
    const c = classifyLayer(layer, store)
    expect(c.kind).toBe('mixed')
    if (c.kind === 'mixed') {
      expect(c.modifiedElements).toEqual([path])
      expect(c.newElements).toEqual([newText])
    }
  })

  it('does not treat container <g> as a "new" graphical leaf', () => {
    // A container that itself wraps tagged source content shouldn't count
    // as new content. Only graphical LEAVES count.
    const layer = document.createElementNS(SVG_NS, 'g')
    layer.setAttribute('data-layer-name', 'Layer 1')
    const innerG = document.createElementNS(SVG_NS, 'g')
    layer.appendChild(innerG)
    const path = appendChild(innerG, 'path', { d: 'M0 0' })
    void path
    tagImportedLayer(layer, { page: 0, layerId: PRIMARY_LAYER_ID })
    snapshotImportedElements(layer)
    const store = new SourcePdfStore()
    store.setPrimary(entry())
    const c = classifyLayer(layer, store)
    expect(c.kind).toBe('graft')
  })

  it('looks up the source entry by data-source-pdf-id (background layer name)', () => {
    const { layer } = makeImportedLayer('Yellow BG')
    const store = new SourcePdfStore()
    const bgEntry = entry('yellow.pdf')
    store.addBackground('Yellow BG', bgEntry)
    const c = classifyLayer(layer, store)
    expect(c.kind).toBe('graft')
    if (c.kind === 'graft') {
      expect(c.sourceEntry).toBe(bgEntry)
    }
  })
})
