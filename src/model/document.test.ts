import { describe, it, expect, beforeEach } from 'vitest'
import { createDocumentModel, resetIdCounter } from './document'
import type { DocumentModel } from './document'

function makeSvg(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 210 297')
  const layer = document.createElementNS('http://www.w3.org/2000/svg', 'g')
  layer.setAttribute('data-layer-name', 'Layer 1')
  svg.appendChild(layer)
  document.body.appendChild(svg)
  return svg
}

describe('DocumentModel', () => {
  let doc: DocumentModel
  let svg: SVGSVGElement

  beforeEach(() => {
    document.body.innerHTML = ''
    resetIdCounter()
    svg = makeSvg()
    doc = createDocumentModel(svg)
  })

  describe('addElement', () => {
    it('adds an SVG element to a parent', () => {
      const layer = doc.getActiveLayer()!
      const el = doc.addElement(layer, 'rect', { width: '50', height: '30' })
      expect(el.tagName).toBe('rect')
      expect(el.getAttribute('width')).toBe('50')
      expect(layer.contains(el)).toBe(true)
    })

    it('assigns an auto-generated id', () => {
      const layer = doc.getActiveLayer()!
      const el = doc.addElement(layer, 'line', { x1: '0', y1: '0', x2: '10', y2: '10' })
      expect(el.getAttribute('id')).toBe('vf-1')
    })

    it('uses provided id if given', () => {
      const layer = doc.getActiveLayer()!
      const el = doc.addElement(layer, 'circle', { id: 'my-circle', r: '5' })
      expect(el.getAttribute('id')).toBe('my-circle')
    })

    it('generates sequential ids', () => {
      const layer = doc.getActiveLayer()!
      const el1 = doc.addElement(layer, 'rect', {})
      const el2 = doc.addElement(layer, 'rect', {})
      expect(el1.getAttribute('id')).toBe('vf-1')
      expect(el2.getAttribute('id')).toBe('vf-2')
    })
  })

  describe('removeElement', () => {
    it('removes an element from its parent', () => {
      const layer = doc.getActiveLayer()!
      const el = doc.addElement(layer, 'rect', {})
      expect(layer.children.length).toBe(1)
      doc.removeElement(el)
      expect(layer.children.length).toBe(0)
    })

    it('returns the parent and next sibling for undo', () => {
      const layer = doc.getActiveLayer()!
      const el1 = doc.addElement(layer, 'rect', {})
      const el2 = doc.addElement(layer, 'rect', {})
      const result = doc.removeElement(el1)
      expect(result.parent).toBe(layer)
      expect(result.nextSibling).toBe(el2)
    })
  })

  describe('setAttribute', () => {
    it('sets an attribute and returns the old value', () => {
      const layer = doc.getActiveLayer()!
      const el = doc.addElement(layer, 'rect', { fill: 'red' })
      const old = doc.setAttribute(el, 'fill', 'blue')
      expect(old).toBe('red')
      expect(el.getAttribute('fill')).toBe('blue')
    })

    it('returns null if attribute did not exist', () => {
      const layer = doc.getActiveLayer()!
      const el = doc.addElement(layer, 'rect', {})
      const old = doc.setAttribute(el, 'stroke', 'black')
      expect(old).toBeNull()
    })
  })

  describe('getElement', () => {
    it('finds element by id', () => {
      const layer = doc.getActiveLayer()!
      const el = doc.addElement(layer, 'rect', { id: 'test-rect' })
      expect(doc.getElement('test-rect')).toBe(el)
    })

    it('returns null for non-existent id', () => {
      expect(doc.getElement('nonexistent')).toBeNull()
    })
  })

  describe('serialize', () => {
    it('produces an SVG string', () => {
      const layer = doc.getActiveLayer()!
      doc.addElement(layer, 'rect', { width: '50', height: '30' })
      const output = doc.serialize()
      expect(output).toContain('<svg')
      expect(output).toContain('<rect')
      expect(output).toContain('width="50"')
    })
  })

  describe('layers', () => {
    it('returns layer elements', () => {
      const layers = doc.getLayerElements()
      expect(layers).toHaveLength(1)
      expect(layers[0].getAttribute('data-layer-name')).toBe('Layer 1')
    })

    it('returns the first layer as active layer', () => {
      const active = doc.getActiveLayer()
      expect(active).not.toBeNull()
      expect(active!.getAttribute('data-layer-name')).toBe('Layer 1')
    })
  })
})
