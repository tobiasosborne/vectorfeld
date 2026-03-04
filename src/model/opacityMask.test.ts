import { describe, it, expect, beforeEach } from 'vitest'
import { makeOpacityMask, releaseOpacityMask, hasMask } from './opacityMask'
import { createDocumentModel } from './document'
import { CommandHistory } from './commands'

function makeSvg() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 210 297')
  const layer = document.createElementNS('http://www.w3.org/2000/svg', 'g')
  layer.setAttribute('data-layer-name', 'Layer 1')
  svg.appendChild(layer)
  return svg
}

describe('opacityMask', () => {
  let svg: SVGSVGElement
  let doc: ReturnType<typeof createDocumentModel>
  let history: CommandHistory

  beforeEach(() => {
    svg = makeSvg() as unknown as SVGSVGElement
    doc = createDocumentModel(svg)
    history = new CommandHistory()
  })

  it('makes opacity mask from two elements', () => {
    const layer = svg.querySelector('g[data-layer-name]')!
    const target = doc.addElement(layer, 'rect', { x: '10', y: '10', width: '80', height: '60' })
    const maskShape = doc.addElement(layer, 'circle', { cx: '50', cy: '40', r: '30', fill: 'white' })

    makeOpacityMask(doc, history, [target, maskShape])

    expect(hasMask(target)).toBe(true)
    expect(target.getAttribute('mask')).toMatch(/url\(#vf-/)
    // Mask shape should be removed from layer
    expect(layer.contains(maskShape)).toBe(false)
    // Mask element should exist in defs
    const maskId = target.getAttribute('mask')!.match(/url\(#([^)]+)\)/)![1]
    expect(svg.querySelector(`#${maskId}`)).not.toBeNull()
  })

  it('releases opacity mask', () => {
    const layer = svg.querySelector('g[data-layer-name]')!
    const target = doc.addElement(layer, 'rect', { x: '10', y: '10', width: '80', height: '60' })
    const maskShape = doc.addElement(layer, 'circle', { cx: '50', cy: '40', r: '30', fill: 'white' })

    makeOpacityMask(doc, history, [target, maskShape])
    releaseOpacityMask(doc, history, target)

    expect(hasMask(target)).toBe(false)
    // A restored shape should be back in the layer
    expect(layer.children.length).toBe(2) // target + restored shape
  })

  it('undo restores original state', () => {
    const layer = svg.querySelector('g[data-layer-name]')!
    const target = doc.addElement(layer, 'rect', { x: '10', y: '10', width: '80', height: '60' })
    doc.addElement(layer, 'circle', { cx: '50', cy: '40', r: '30', fill: 'white' })

    expect(layer.children.length).toBe(2)
    makeOpacityMask(doc, history, [target, layer.children[1]])
    expect(layer.children.length).toBe(1)

    history.undo()
    expect(layer.children.length).toBe(2)
    expect(hasMask(target)).toBe(false)
  })

  it('hasMask returns false for unmasked elements', () => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    expect(hasMask(el)).toBe(false)
  })
})
