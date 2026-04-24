import { describe, it, expect, beforeEach } from 'vitest'
import { computeReflectH, computeReflectV } from './reflect'

function makeSvg(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 210 297')
  document.body.appendChild(svg)
  return svg
}

function makeEl(svg: SVGSVGElement, tag: string, attrs: Record<string, string>): Element {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag)
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
  svg.appendChild(el)
  // Mock getBBox for jsdom
  ;(el as SVGGraphicsElement).getBBox = () => {
    if (tag === 'rect' || tag === 'image') {
      return new DOMRect(
        parseFloat(attrs.x || '0'),
        parseFloat(attrs.y || '0'),
        parseFloat(attrs.width || '0'),
        parseFloat(attrs.height || '0')
      )
    }
    if (tag === 'ellipse') {
      const cx = parseFloat(attrs.cx || '0'), cy = parseFloat(attrs.cy || '0')
      const rx = parseFloat(attrs.rx || '0'), ry = parseFloat(attrs.ry || '0')
      return new DOMRect(cx - rx, cy - ry, rx * 2, ry * 2)
    }
    if (tag === 'line') {
      const x1 = parseFloat(attrs.x1 || '0'), y1 = parseFloat(attrs.y1 || '0')
      const x2 = parseFloat(attrs.x2 || '0'), y2 = parseFloat(attrs.y2 || '0')
      const minX = Math.min(x1, x2), minY = Math.min(y1, y2)
      return new DOMRect(minX, minY, Math.abs(x2 - x1), Math.abs(y2 - y1))
    }
    if (tag === 'path') {
      return new DOMRect(10, 10, 80, 60)
    }
    return new DOMRect(0, 0, 0, 0)
  }
  return el
}

let svg: SVGSVGElement

beforeEach(() => {
  document.body.innerHTML = ''
  svg = makeSvg()
})

describe('computeReflectH', () => {
  it('mirrors rect x across its center', () => {
    const el = makeEl(svg, 'rect', { x: '20', y: '30', width: '60', height: '40' })
    const changes = computeReflectH(el)
    // center = 20 + 60/2 = 50, new x = 2*50 - 20 - 60 = 20 (symmetric case)
    expect(changes).toEqual([['x', '20']])
  })

  it('mirrors off-center rect correctly', () => {
    const el = makeEl(svg, 'rect', { x: '10', y: '10', width: '40', height: '20' })
    const changes = computeReflectH(el)
    // center = 10 + 20 = 30, new x = 2*30 - 10 - 40 = 10 (symmetric case since rect is centered on its own bbox)
    expect(changes).toEqual([['x', '10']])
  })

  it('mirrors line x1/x2 across center', () => {
    const el = makeEl(svg, 'line', { x1: '10', y1: '20', x2: '50', y2: '60' })
    const changes = computeReflectH(el)
    // center = 10 + (50-10)/2 = 30
    // new x1 = 2*30 - 10 = 50, new x2 = 2*30 - 50 = 10
    expect(changes).toHaveLength(2)
    expect(changes[0]).toEqual(['x1', '50'])
    expect(changes[1]).toEqual(['x2', '10'])
  })

  it('returns empty for ellipse (already symmetric)', () => {
    const el = makeEl(svg, 'ellipse', { cx: '50', cy: '50', rx: '30', ry: '20' })
    const changes = computeReflectH(el)
    expect(changes).toHaveLength(0)
  })

  it('bakes horizontal mirror into path d', () => {
    const el = makeEl(svg, 'path', { d: 'M10 10 L90 10 L90 70 Z' })
    const changes = computeReflectH(el)
    // bbox.x=10, width=80, cx=50. Each x → 2*50 - x.
    // M10,10 → M90,10; L90,10 → L10,10; L90,70 → L10,70
    expect(changes).toHaveLength(1)
    expect(changes[0][0]).toBe('d')
    expect(changes[0][1]).toContain('M90 10')
    expect(changes[0][1]).toContain('L10 10')
  })
})

describe('computeReflectV', () => {
  it('mirrors line y1/y2 across center', () => {
    const el = makeEl(svg, 'line', { x1: '10', y1: '20', x2: '50', y2: '80' })
    const changes = computeReflectV(el)
    // center y = 20 + (80-20)/2 = 50
    // new y1 = 2*50 - 20 = 80, new y2 = 2*50 - 80 = 20
    expect(changes).toHaveLength(2)
    expect(changes[0]).toEqual(['y1', '80'])
    expect(changes[1]).toEqual(['y2', '20'])
  })

  it('mirrors rect y across center', () => {
    const el = makeEl(svg, 'rect', { x: '20', y: '30', width: '60', height: '40' })
    const changes = computeReflectV(el)
    // center y = 30 + 20 = 50, new y = 2*50 - 30 - 40 = 30
    expect(changes).toEqual([['y', '30']])
  })

  it('returns empty for ellipse (already symmetric)', () => {
    const el = makeEl(svg, 'ellipse', { cx: '50', cy: '50', rx: '30', ry: '20' })
    const changes = computeReflectV(el)
    expect(changes).toHaveLength(0)
  })

  it('bakes vertical mirror into path d', () => {
    const el = makeEl(svg, 'path', { d: 'M10 10 L90 10 L90 70 Z' })
    const changes = computeReflectV(el)
    // bbox.y=10, height=60, cy=40. Each y → 2*40 - y.
    // M10,10 → M10,70; L90,10 → L90,70; L90,70 → L90,10
    expect(changes).toHaveLength(1)
    expect(changes[0][0]).toBe('d')
    expect(changes[0][1]).toContain('M10 70')
    expect(changes[0][1]).toContain('L90 10')
  })
})
