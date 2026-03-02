import { describe, it, expect, beforeEach } from 'vitest'
import { ClipMaskCommand, ReleaseClipMaskCommand, hasClipPath } from './clipping'
import { createDocumentModel } from './document'
import { resetIdCounter } from './document'
import type { DocumentModel } from './document'

function makeSvg(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 210 297')
  // Add default layer (required by createDocumentModel → getActiveLayer)
  const layer = document.createElementNS('http://www.w3.org/2000/svg', 'g')
  layer.setAttribute('data-layer-name', 'Layer 1')
  svg.appendChild(layer)
  document.body.appendChild(svg)
  return svg
}

let svg: SVGSVGElement
let doc: DocumentModel

beforeEach(() => {
  document.body.innerHTML = ''
  resetIdCounter()
  svg = makeSvg()
  doc = createDocumentModel(svg)
})

describe('ClipMaskCommand', () => {
  it('creates clipPath in defs and sets clip-path attribute', () => {
    const layer = doc.getActiveLayer()!
    const rect = doc.addElement(layer, 'rect', { x: '10', y: '10', width: '80', height: '60' })
    const circle = doc.addElement(layer, 'ellipse', { cx: '50', cy: '40', rx: '30', ry: '20' })

    const cmd = new ClipMaskCommand(doc, rect, circle)
    cmd.execute()

    // clipPath should exist in defs
    const defs = doc.getDefs()
    const clipPath = defs.querySelector('clipPath')
    expect(clipPath).not.toBeNull()

    // target should have clip-path
    expect(rect.getAttribute('clip-path')).toContain('url(#')

    // clip shape should be removed from layer
    expect(layer.contains(circle)).toBe(false)
  })

  it('undo restores original state', () => {
    const layer = doc.getActiveLayer()!
    const rect = doc.addElement(layer, 'rect', { x: '10', y: '10', width: '80', height: '60' })
    const circle = doc.addElement(layer, 'ellipse', { cx: '50', cy: '40', rx: '30', ry: '20' })

    const cmd = new ClipMaskCommand(doc, rect, circle)
    cmd.execute()
    cmd.undo()

    // clipPath should be removed
    expect(doc.getDefs().querySelector('clipPath')).toBeNull()

    // target should not have clip-path
    expect(rect.getAttribute('clip-path')).toBeNull()

    // clip shape should be back in layer
    expect(layer.contains(circle)).toBe(true)
  })
})

describe('ReleaseClipMaskCommand', () => {
  it('releases clip mask and restores shape', () => {
    const layer = doc.getActiveLayer()!
    const rect = doc.addElement(layer, 'rect', { x: '10', y: '10', width: '80', height: '60' })
    const circle = doc.addElement(layer, 'ellipse', { cx: '50', cy: '40', rx: '30', ry: '20' })

    // Make clip mask first
    const makeCmd = new ClipMaskCommand(doc, rect, circle)
    makeCmd.execute()

    // Release it
    const releaseCmd = new ReleaseClipMaskCommand(doc, rect)
    releaseCmd.execute()

    // clip-path should be removed
    expect(rect.getAttribute('clip-path')).toBeNull()

    // clipPath should be removed from defs
    expect(doc.getDefs().querySelector('clipPath')).toBeNull()

    // A restored shape should be in the layer
    expect(layer.querySelectorAll('ellipse').length).toBe(1)
  })

  it('undo restores the clip mask', () => {
    const layer = doc.getActiveLayer()!
    const rect = doc.addElement(layer, 'rect', { x: '10', y: '10', width: '80', height: '60' })
    const circle = doc.addElement(layer, 'ellipse', { cx: '50', cy: '40', rx: '30', ry: '20' })

    const makeCmd = new ClipMaskCommand(doc, rect, circle)
    makeCmd.execute()

    const releaseCmd = new ReleaseClipMaskCommand(doc, rect)
    releaseCmd.execute()
    releaseCmd.undo()

    // clip-path should be back
    expect(rect.getAttribute('clip-path')).toContain('url(#')
    // clipPath should be back in defs
    expect(doc.getDefs().querySelector('clipPath')).not.toBeNull()
  })
})

describe('hasClipPath', () => {
  it('returns false for unclipped element', () => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    expect(hasClipPath(el)).toBe(false)
  })

  it('returns true for clipped element', () => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    el.setAttribute('clip-path', 'url(#clip1)')
    expect(hasClipPath(el)).toBe(true)
  })
})
