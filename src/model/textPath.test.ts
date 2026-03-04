import { describe, it, expect, beforeEach } from 'vitest'
import { placeTextOnPath, releaseTextFromPath, hasTextPath } from './textPath'
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

describe('textPath', () => {
  let svg: SVGSVGElement
  let doc: ReturnType<typeof createDocumentModel>
  let history: CommandHistory

  beforeEach(() => {
    svg = makeSvg() as unknown as SVGSVGElement
    doc = createDocumentModel(svg)
    history = new CommandHistory()
  })

  it('hasTextPath returns false for plain text', () => {
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    text.textContent = 'Hello'
    expect(hasTextPath(text)).toBe(false)
  })

  it('hasTextPath returns true for text with textPath child', () => {
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    const tp = document.createElementNS('http://www.w3.org/2000/svg', 'textPath')
    tp.setAttribute('href', '#path1')
    tp.textContent = 'Hello'
    text.appendChild(tp)
    expect(hasTextPath(text)).toBe(true)
  })

  it('placeTextOnPath creates textPath element', () => {
    const layer = svg.querySelector('g[data-layer-name]')!
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    text.textContent = 'Hello World'
    text.setAttribute('font-size', '16')
    layer.appendChild(text)

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('id', 'vf-1')
    path.setAttribute('d', 'M0 0 C50 50 100 50 150 0')
    layer.appendChild(path)

    placeTextOnPath(doc, history, text, path)

    // Original text should be removed
    expect(layer.querySelector('text:not(:has(textPath))')).toBeNull()
    // New text with textPath should exist
    const newText = layer.querySelector('text')
    expect(newText).not.toBeNull()
    const textPathEl = newText?.querySelector('textPath')
    expect(textPathEl).not.toBeNull()
    expect(textPathEl?.getAttribute('href')).toBe('#vf-1')
    expect(textPathEl?.textContent).toBe('Hello World')
  })

  it('releaseTextFromPath converts back to plain text', () => {
    const layer = svg.querySelector('g[data-layer-name]')!

    // Create text on path manually
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    text.setAttribute('font-size', '16')
    const tp = document.createElementNS('http://www.w3.org/2000/svg', 'textPath')
    tp.setAttribute('href', '#path1')
    tp.textContent = 'On Path'
    text.appendChild(tp)
    layer.appendChild(text)

    releaseTextFromPath(doc, history, text)

    const plainText = layer.querySelector('text')
    expect(plainText).not.toBeNull()
    expect(plainText?.querySelector('textPath')).toBeNull()
    expect(plainText?.textContent).toBe('On Path')
  })

  it('hasTextPath returns false for non-text elements', () => {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    expect(hasTextPath(rect)).toBe(false)
  })

  it('placeTextOnPath preserves font attributes', () => {
    const layer = svg.querySelector('g[data-layer-name]')!
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    text.textContent = 'Styled'
    text.setAttribute('font-size', '24')
    text.setAttribute('font-family', 'serif')
    layer.appendChild(text)

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('id', 'vf-2')
    path.setAttribute('d', 'M0 0 L100 0')
    layer.appendChild(path)

    placeTextOnPath(doc, history, text, path)

    const newText = layer.querySelector('text')
    expect(newText?.getAttribute('font-size')).toBe('24')
    expect(newText?.getAttribute('font-family')).toBe('serif')
  })
})
