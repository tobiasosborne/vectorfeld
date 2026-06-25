import { describe, it, expect, beforeEach } from 'vitest'
import { copySelection, pasteClipboard } from './clipboard'
import { createDocumentModel, resetIdCounter } from './document'
import { CommandHistory } from './commands'
import { setSelection, clearSelection } from './selection'

/** Collect all id attribute values from el and all its descendants. */
function collectIds(el: Element): string[] {
  const ids: string[] = []
  if (el.hasAttribute('id')) ids.push(el.getAttribute('id')!)
  for (const child of el.querySelectorAll('[id]')) {
    ids.push(child.getAttribute('id')!)
  }
  return ids
}

function makeSvg(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  const layer = document.createElementNS('http://www.w3.org/2000/svg', 'g')
  layer.setAttribute('data-layer-name', 'Layer 1')
  svg.appendChild(layer)
  document.body.appendChild(svg)
  return svg
}

describe('clipboard — pasteClipboard', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    resetIdCounter()
    clearSelection()
  })

  it('default paste shifts pasted copy by 5mm offset (Illustrator-style duplicate)', () => {
    const svg = makeSvg()
    const doc = createDocumentModel(svg)
    const layer = doc.getActiveLayer()!
    const rect = doc.addElement(layer, 'rect', { x: '10', y: '20', width: '30', height: '40' })

    setSelection([rect])
    const history = new CommandHistory()
    const clipboardRef = { current: copySelection() }
    pasteClipboard(clipboardRef, history, doc)

    const rects = layer.querySelectorAll('rect')
    expect(rects.length).toBe(2)
    const pasted = rects[1]
    expect(pasted.getAttribute('x')).toBe('15')
    expect(pasted.getAttribute('y')).toBe('25')
  })

  it('paste-in-place (offset=0) preserves source coordinates exactly (vectorfeld-2ss)', () => {
    const svg = makeSvg()
    const doc = createDocumentModel(svg)
    const layer = doc.getActiveLayer()!
    const rect = doc.addElement(layer, 'rect', { x: '10', y: '20', width: '30', height: '40' })

    setSelection([rect])
    const history = new CommandHistory()
    const clipboardRef = { current: copySelection() }
    pasteClipboard(clipboardRef, history, doc, 0)

    const rects = layer.querySelectorAll('rect')
    expect(rects.length).toBe(2)
    const pasted = rects[1]
    expect(pasted.getAttribute('x')).toBe('10')
    expect(pasted.getAttribute('y')).toBe('20')
  })

  it('paste-in-place pastes a fresh id so original and copy are distinguishable', () => {
    const svg = makeSvg()
    const doc = createDocumentModel(svg)
    const layer = doc.getActiveLayer()!
    const rect = doc.addElement(layer, 'rect', { x: '0', y: '0', width: '10', height: '10' })

    setSelection([rect])
    const history = new CommandHistory()
    const clipboardRef = { current: copySelection() }
    pasteClipboard(clipboardRef, history, doc, 0)

    const rects = layer.querySelectorAll('rect')
    expect(rects[0].getAttribute('id')).not.toBe(rects[1].getAttribute('id'))
  })

  // ---- vectorfeld-3yu.13: duplicate-id regression tests ----

  it('pasting a <g> with two child rects yields no duplicate ids across both subtrees', () => {
    const svg = makeSvg()
    const doc = createDocumentModel(svg)
    const layer = doc.getActiveLayer()!

    // Build a group with two children that have explicit ids
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    group.setAttribute('id', 'vf-100')
    const r1 = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    r1.setAttribute('id', 'vf-101')
    const r2 = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    r2.setAttribute('id', 'vf-102')
    group.appendChild(r1)
    group.appendChild(r2)
    layer.appendChild(group)

    setSelection([group])
    const history = new CommandHistory()
    const clipboardRef = { current: copySelection() }
    pasteClipboard(clipboardRef, history, doc)

    // Collect ids from original subtree
    const originalIds = collectIds(group)
    // Collect ids from pasted subtree (the new <g>)
    const groups = layer.querySelectorAll('g')
    const pastedGroup = groups[groups.length - 1]
    const pastedIds = collectIds(pastedGroup)

    // All ids across BOTH subtrees must be unique
    const allIds = [...originalIds, ...pastedIds]
    const uniqueSet = new Set(allIds)
    expect(uniqueSet.size).toBe(allIds.length)

    // Pasted child ids must differ from original child ids
    const pastedChildIds = Array.from(pastedGroup.querySelectorAll('[id]')).map(e => e.getAttribute('id')!)
    expect(pastedChildIds).not.toContain('vf-101')
    expect(pastedChildIds).not.toContain('vf-102')
  })

  it('intra-subtree url(#id) ref is remapped after paste; original is unchanged', () => {
    const svg = makeSvg()
    const doc = createDocumentModel(svg)
    const layer = doc.getActiveLayer()!

    // Build a group containing an inline gradient def and a rect referencing it
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    group.setAttribute('id', 'vf-200')
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs')
    const grad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient')
    grad.setAttribute('id', 'inner-grad')
    defs.appendChild(grad)
    group.appendChild(defs)
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    rect.setAttribute('id', 'vf-201')
    rect.setAttribute('fill', 'url(#inner-grad)')
    group.appendChild(rect)
    layer.appendChild(group)

    setSelection([group])
    const history = new CommandHistory()
    const clipboardRef = { current: copySelection() }
    pasteClipboard(clipboardRef, history, doc)

    // Locate the pasted group (last <g> child of layer)
    const groups = Array.from(layer.children).filter(e => e.tagName === 'g')
    const pastedGroup = groups[groups.length - 1] as Element

    // The pasted gradient must have a new id
    const pastedGrad = pastedGroup.querySelector('linearGradient')!
    const pastedGradId = pastedGrad.getAttribute('id')!
    expect(pastedGradId).not.toBe('inner-grad')

    // The pasted rect's fill must reference the NEW gradient id
    const pastedRect = pastedGroup.querySelector('rect')!
    expect(pastedRect.getAttribute('fill')).toBe(`url(#${pastedGradId})`)

    // The original rect's fill must still reference the original id
    expect(rect.getAttribute('fill')).toBe('url(#inner-grad)')
  })

  it('ref to a shared-defs id outside the subtree is left untouched after paste', () => {
    const svg = makeSvg()
    const doc = createDocumentModel(svg)
    const layer = doc.getActiveLayer()!

    // Add a shared marker in the SVG defs (outside the group — simulates vf-marker-*)
    const svgDefs = document.createElementNS('http://www.w3.org/2000/svg', 'defs')
    const sharedMarker = document.createElementNS('http://www.w3.org/2000/svg', 'marker')
    sharedMarker.setAttribute('id', 'vf-marker-arrow')
    svgDefs.appendChild(sharedMarker)
    svg.insertBefore(svgDefs, layer)

    // Build a group with a line that references the shared marker
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    group.setAttribute('id', 'vf-300')
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
    line.setAttribute('id', 'vf-301')
    line.setAttribute('marker-end', 'url(#vf-marker-arrow)')
    group.appendChild(line)
    layer.appendChild(group)

    setSelection([group])
    const history = new CommandHistory()
    const clipboardRef = { current: copySelection() }
    pasteClipboard(clipboardRef, history, doc)

    // Locate the pasted group
    const groups = Array.from(layer.children).filter(e => e.tagName === 'g')
    const pastedGroup = groups[groups.length - 1] as Element
    const pastedLine = pastedGroup.querySelector('line')!

    // The shared marker ref must be preserved unchanged
    expect(pastedLine.getAttribute('marker-end')).toBe('url(#vf-marker-arrow)')
  })
})
