import { describe, it, expect, beforeEach } from 'vitest'
import { copySelection, pasteClipboard } from './clipboard'
import { createDocumentModel, resetIdCounter } from './document'
import { CommandHistory } from './commands'
import { setSelection, clearSelection } from './selection'

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
})
