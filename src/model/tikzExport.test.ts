import { describe, it, expect } from 'vitest'
import { hexToTikzColor, elementToTikz, svgToTikz } from './tikzExport'

function makeEl(tag: string, attrs: Record<string, string>): Element {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag)
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
  return el
}

describe('hexToTikzColor', () => {
  it('converts 6-digit hex', () => {
    expect(hexToTikzColor('#ff0000')).toBe('{rgb,255:red,255;green,0;blue,0}')
  })

  it('converts 3-digit hex', () => {
    expect(hexToTikzColor('#f00')).toBe('{rgb,255:red,255;green,0;blue,0}')
  })

  it('returns empty for none', () => {
    expect(hexToTikzColor('none')).toBe('')
  })
})

describe('elementToTikz', () => {
  const maxY = 297 // A4

  it('converts rect', () => {
    const el = makeEl('rect', { x: '10', y: '20', width: '50', height: '30', stroke: '#000000', fill: 'none' })
    const tikz = elementToTikz(el, maxY)
    expect(tikz).toContain('\\draw')
    expect(tikz).toContain('rectangle')
    expect(tikz).toContain('10.00mm')
  })

  it('converts ellipse', () => {
    const el = makeEl('ellipse', { cx: '50', cy: '50', rx: '20', ry: '15', stroke: '#000000', fill: 'none' })
    const tikz = elementToTikz(el, maxY)
    expect(tikz).toContain('ellipse')
    expect(tikz).toContain('20.00mm and 15.00mm')
  })

  it('converts line', () => {
    const el = makeEl('line', { x1: '10', y1: '20', x2: '100', y2: '80', stroke: '#000000' })
    const tikz = elementToTikz(el, maxY)
    expect(tikz).toContain('--')
    expect(tikz).toContain('10.00mm')
  })

  it('converts text with LaTeX escaping', () => {
    const el = makeEl('text', { x: '10', y: '50' })
    el.textContent = 'Hello & World $5'
    const tikz = elementToTikz(el, maxY)
    expect(tikz).toContain('\\node')
    expect(tikz).toContain('Hello \\& World \\$5')
  })

  it('converts path with L segments', () => {
    const el = makeEl('path', { d: 'M10 20 L100 20 L100 80', stroke: '#000000', fill: 'none' })
    const tikz = elementToTikz(el, maxY)
    expect(tikz).toContain('\\draw')
    expect(tikz).toContain('--')
  })

  it('converts path with C segments', () => {
    const el = makeEl('path', { d: 'M0 0 C10 0 20 10 20 20', stroke: '#000000', fill: 'none' })
    const tikz = elementToTikz(el, maxY)
    expect(tikz).toContain('controls')
  })

  it('includes fill and stroke options', () => {
    const el = makeEl('rect', { x: '0', y: '0', width: '10', height: '10', stroke: '#ff0000', fill: '#00ff00', 'stroke-width': '2' })
    const tikz = elementToTikz(el, maxY)
    expect(tikz).toContain('fill=')
    expect(tikz).toContain('draw=')
    expect(tikz).toContain('line width=2mm')
  })

  it('y-axis is inverted', () => {
    // A point at SVG y=0 should become TikZ y=297 (maxY)
    const el = makeEl('line', { x1: '0', y1: '0', x2: '10', y2: '0', stroke: '#000000' })
    const tikz = elementToTikz(el, maxY)
    expect(tikz).toContain('297.00mm')
  })
})

describe('svgToTikz', () => {
  it('produces complete tikzpicture', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', '0 0 210 297')
    const layer = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    layer.setAttribute('data-layer-name', 'Layer 1')
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    rect.setAttribute('x', '10')
    rect.setAttribute('y', '10')
    rect.setAttribute('width', '50')
    rect.setAttribute('height', '30')
    rect.setAttribute('stroke', '#000000')
    rect.setAttribute('fill', 'none')
    layer.appendChild(rect)
    svg.appendChild(layer)

    const tikz = svgToTikz(svg)
    expect(tikz).toContain('\\begin{tikzpicture}')
    expect(tikz).toContain('\\end{tikzpicture}')
    expect(tikz).toContain('rectangle')
    expect(tikz).toContain('% Layer: Layer 1')
  })

  it('skips hidden layers', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', '0 0 210 297')
    const layer = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    layer.setAttribute('data-layer-name', 'Hidden')
    ;(layer as SVGElement).style.display = 'none'
    svg.appendChild(layer)
    const tikz = svgToTikz(svg)
    expect(tikz).not.toContain('Hidden')
  })
})
