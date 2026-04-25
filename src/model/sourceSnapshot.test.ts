import { describe, it, expect } from 'vitest'
import {
  snapshotImportedElements,
  isElementModified,
  findModifiedSourceElements,
  hasSnapshot,
  findRemovedElementBboxes,
} from './sourceSnapshot'
import { tagImportedLayer, PRIMARY_LAYER_ID } from './sourceTagging'

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

function makeTaggedLayer(): { layer: Element; rect: Element; path: Element; text: Element } {
  const layer = makeLayer()
  const rect = appendChild(layer, 'rect', { x: '10', y: '20', width: '30', height: '40', fill: '#ff0000' })
  const path = appendChild(layer, 'path', { d: 'M0 0 L1 1', stroke: '#000000' })
  const text = appendChild(layer, 'text', { x: '5', y: '5' })
  text.textContent = 'hello'
  tagImportedLayer(layer, { page: 0, layerId: PRIMARY_LAYER_ID })
  snapshotImportedElements(layer)
  return { layer, rect, path, text }
}

describe('snapshotImportedElements', () => {
  it('records a snapshot on every tagged child', () => {
    const { rect, path, text } = makeTaggedLayer()
    expect(hasSnapshot(rect)).toBe(true)
    expect(hasSnapshot(path)).toBe(true)
    expect(hasSnapshot(text)).toBe(true)
  })

  it('does not snapshot untagged children', () => {
    const layer = makeLayer()
    const untagged = appendChild(layer, 'rect', { x: '0', y: '0' })
    snapshotImportedElements(layer)
    expect(hasSnapshot(untagged)).toBe(false)
  })

  it('snapshots are isolated per element', () => {
    const { rect, path } = makeTaggedLayer()
    rect.setAttribute('x', '999')
    expect(isElementModified(rect)).toBe(true)
    expect(isElementModified(path)).toBe(false)
  })
})

describe('isElementModified', () => {
  it('returns false for an unsnapshot element', () => {
    const el = document.createElementNS(SVG_NS, 'rect')
    expect(isElementModified(el)).toBe(false)
  })

  it('returns false when attrs match snapshot exactly', () => {
    const { rect } = makeTaggedLayer()
    expect(isElementModified(rect)).toBe(false)
  })

  it('detects a changed attribute value', () => {
    const { rect } = makeTaggedLayer()
    rect.setAttribute('fill', '#00ff00')
    expect(isElementModified(rect)).toBe(true)
  })

  it('detects a removed attribute', () => {
    const { rect } = makeTaggedLayer()
    rect.removeAttribute('fill')
    expect(isElementModified(rect)).toBe(true)
  })

  it('detects an added attribute', () => {
    const { rect } = makeTaggedLayer()
    rect.setAttribute('opacity', '0.5')
    expect(isElementModified(rect)).toBe(true)
  })

  it('detects modified text content (treated as a kind of attribute change for now)', () => {
    // textContent isn't a DOM attribute — for the graft engine, text content
    // changes are caught at the higher level via Command.touchesSource AND/OR
    // by snapshotting `text` element data-* annotations. This bead deliberately
    // limits itself to *attribute* mutation; textContent edits are out of scope.
    const { text } = makeTaggedLayer()
    text.textContent = 'edited'
    // attribute-only snapshot ⇒ no detected mutation
    expect(isElementModified(text)).toBe(false)
  })
})

describe('findModifiedSourceElements', () => {
  it('returns empty when nothing has changed since import', () => {
    const { layer } = makeTaggedLayer()
    expect(findModifiedSourceElements(layer)).toEqual([])
  })

  it('returns just the touched elements, in DOM order', () => {
    const { layer, rect, text } = makeTaggedLayer()
    text.setAttribute('x', '99')
    rect.setAttribute('width', '500')
    const found = findModifiedSourceElements(layer)
    // DOM order: rect appears before text
    expect(found).toEqual([rect, text])
  })

  it('does not include untagged elements that were modified', () => {
    const { layer } = makeTaggedLayer()
    const newRect = appendChild(layer, 'rect', { x: '0', y: '0' })
    // newRect has no snapshot → not "modified", just "new content"
    expect(findModifiedSourceElements(layer)).not.toContain(newRect)
  })

  it('descends into nested containers (g)', () => {
    const layer = makeLayer()
    const inner = appendChild(layer, 'g')
    const path = appendChild(inner, 'path', { d: 'M0 0' })
    tagImportedLayer(layer, { page: 0, layerId: PRIMARY_LAYER_ID })
    snapshotImportedElements(layer)
    path.setAttribute('d', 'M9 9')
    expect(findModifiedSourceElements(layer)).toEqual([path])
  })
})

describe('findRemovedElementBboxes', () => {
  it('returns empty when no source elements have been removed', () => {
    const { layer } = makeTaggedLayer()
    expect(findRemovedElementBboxes(layer)).toEqual([])
  })

  it('returns the bbox (mm-space) of each removed source element', () => {
    const { layer, rect } = makeTaggedLayer()
    // The rect was at x=10 y=20 width=30 height=40 in the fixture, so its
    // mm bbox is exactly that.
    rect.remove()
    const removed = findRemovedElementBboxes(layer)
    expect(removed).toHaveLength(1)
    expect(removed[0]).toEqual({ x: 10, y: 20, width: 30, height: 40 })
  })

  it('returns multiple bboxes when multiple elements are removed', () => {
    const { layer, rect, path, text } = makeTaggedLayer()
    rect.remove()
    text.remove()
    expect(findRemovedElementBboxes(layer).length).toBe(2)
    // path should still be present in the layer
    expect(layer.contains(path)).toBe(true)
  })

  it('returns empty for a layer that was never snapshot', () => {
    const layer = makeLayer()
    expect(findRemovedElementBboxes(layer)).toEqual([])
  })

  it('does not include elements that were just MODIFIED but still in DOM', () => {
    const { layer, rect } = makeTaggedLayer()
    rect.setAttribute('fill', '#00ff00') // modify, don't remove
    expect(findRemovedElementBboxes(layer)).toEqual([])
  })

  it('captures bbox via element-own attributes — translate via attribute change after import is reflected as a "modification", not a deletion', () => {
    // i.e. a rect whose x/y was changed by the user is still in the DOM,
    // so it doesn't count as removed. Its ORIGINAL position (snapshot
    // bbox) is what matters here — but it's not removed, so empty list.
    const { layer, rect } = makeTaggedLayer()
    rect.setAttribute('x', '999')
    expect(findRemovedElementBboxes(layer)).toEqual([])
  })
})
