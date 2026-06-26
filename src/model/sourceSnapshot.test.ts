import { describe, it, expect } from 'vitest'
import {
  snapshotImportedElements,
  isElementModified,
  findModifiedSourceElements,
  hasSnapshot,
  findRemovedElementBboxes,
  getSnapshotBboxMm,
  wasTextContentModified,
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

  it('detects modified text content with byte-identical attributes', () => {
    // Load-bearing for in-place text edits (vectorfeld-3yu.2): the editor
    // mutates only the tspan subtree, leaving the <text>'s attributes
    // unchanged. textContent is the only signal that flips it to "modified"
    // so the graft engine re-emits the run instead of grafting original bytes.
    const { text } = makeTaggedLayer()
    text.textContent = 'edited'
    expect(isElementModified(text)).toBe(true)
  })

  it('stays unmodified when textContent is restored to its snapshot', () => {
    const { text } = makeTaggedLayer()
    text.textContent = 'edited'
    expect(isElementModified(text)).toBe(true)
    text.textContent = 'hello' // back to the import-time content
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

  it('returns a <text> whose CONTENT was edited (attributes unchanged)', () => {
    // Guards the load-bearing gap (vectorfeld-3yu.2): a content-only edit must
    // surface the <text> for graft re-emission even though no attribute moved.
    const { layer, text } = makeTaggedLayer()
    text.textContent = 'edited'
    expect(findModifiedSourceElements(layer)).toEqual([text])
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

// vectorfeld-3yu.2: the graft redaction must cover a content-edited run's
// ORIGINAL footprint (not its shrunken live bbox), and pad only true content
// edits (not recolors). These helpers drive that decision.
describe('redaction snapshot helpers (3yu.2)', () => {
  it('getSnapshotBboxMm returns a bbox for a snapshotted element, null otherwise', () => {
    const { text } = makeTaggedLayer()
    expect(getSnapshotBboxMm(text)).not.toBeNull()
    const orphan = document.createElementNS(SVG_NS, 'text')
    expect(getSnapshotBboxMm(orphan)).toBeNull()
  })

  it('getSnapshotBboxMm stays at the import-time value after the live bbox shrinks', () => {
    const { text } = makeTaggedLayer()
    const orig = getSnapshotBboxMm(text)
    text.textContent = 'x' // an edit that would shrink the live bbox
    expect(getSnapshotBboxMm(text)).toEqual(orig) // redaction uses the original footprint
  })

  it('wasTextContentModified flips only on a content change', () => {
    const { text } = makeTaggedLayer()
    expect(wasTextContentModified(text)).toBe(false)
    text.textContent = 'goodbye'
    expect(wasTextContentModified(text)).toBe(true)
    text.textContent = 'hello' // restored to snapshot
    expect(wasTextContentModified(text)).toBe(false)
  })

  it('wasTextContentModified is false for an attribute-only change (recolor stays unpadded)', () => {
    const { text } = makeTaggedLayer()
    text.setAttribute('fill', '#00ff00')
    expect(wasTextContentModified(text)).toBe(false)
    expect(isElementModified(text)).toBe(true) // still classified modified, just not padded
  })
})
