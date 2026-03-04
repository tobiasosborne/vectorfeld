import { describe, it, expect } from 'vitest'
import {
  rectToPathD, ellipseToPathD, circleToPathD,
  lineToPathD, elementToPathD, extractStyleAttrs,
} from './shapeToPath'

const SVG_NS = 'http://www.w3.org/2000/svg'

describe('rectToPathD', () => {
  it('basic rect produces M/L/Z path', () => {
    const d = rectToPathD(10, 20, 100, 50)
    expect(d).toBe('M10 20 L110 20 L110 70 L10 70 Z')
  })

  it('rounded rect produces cubic bezier corners', () => {
    const d = rectToPathD(0, 0, 100, 60, 10, 10)
    expect(d).toContain('C') // cubic curves for rounded corners
    expect(d).toMatch(/^M10 0/) // starts offset by rx
    expect(d).toMatch(/Z$/) // closes path
  })
})

describe('ellipseToPathD', () => {
  it('produces closed path with 4 cubic arcs', () => {
    const d = ellipseToPathD(50, 50, 30, 20)
    expect(d).toMatch(/^M50 30/) // starts at top center (cx, cy - ry)
    const cubics = d.match(/C/g)
    expect(cubics).toHaveLength(4)
    expect(d).toMatch(/Z$/)
  })
})

describe('circleToPathD', () => {
  it('produces same shape as ellipse with equal radii', () => {
    const d = circleToPathD(50, 50, 25)
    const dEllipse = ellipseToPathD(50, 50, 25, 25)
    expect(d).toBe(dEllipse)
  })
})

describe('lineToPathD', () => {
  it('produces M/L path', () => {
    const d = lineToPathD(10, 20, 100, 200)
    expect(d).toBe('M10 20 L100 200')
  })
})

describe('elementToPathD', () => {
  it('returns null for unsupported tags', () => {
    const el = document.createElementNS(SVG_NS, 'text')
    expect(elementToPathD(el)).toBeNull()
  })

  it('converts a rect element', () => {
    const el = document.createElementNS(SVG_NS, 'rect')
    el.setAttribute('x', '5')
    el.setAttribute('y', '10')
    el.setAttribute('width', '80')
    el.setAttribute('height', '40')
    const d = elementToPathD(el)
    expect(d).toBe(rectToPathD(5, 10, 80, 40))
  })
})

describe('extractStyleAttrs', () => {
  it('extracts only present style attributes', () => {
    const el = document.createElementNS(SVG_NS, 'rect')
    el.setAttribute('stroke', '#000')
    el.setAttribute('fill', 'red')
    el.setAttribute('id', 'myRect') // not a style attr
    el.setAttribute('x', '10') // not a style attr
    const attrs = extractStyleAttrs(el)
    expect(attrs).toEqual({ stroke: '#000', fill: 'red' })
    expect(attrs).not.toHaveProperty('id')
    expect(attrs).not.toHaveProperty('x')
  })
})
