import { describe, it, expect } from 'vitest'
import { normalizeSvg } from './normalizeSvg'

describe('normalizeSvg', () => {
  it('strips id attributes (which are auto-generated and non-stable)', () => {
    const input = '<svg xmlns="http://www.w3.org/2000/svg"><rect id="vf-1" x="10" y="20"/></svg>'
    const out = normalizeSvg(input)
    expect(out).not.toContain('id=')
    expect(out).toContain('x="10"')
  })

  it('rounds numeric attribute values to 2 decimal places', () => {
    const input = '<svg xmlns="http://www.w3.org/2000/svg"><rect x="3.141592" y="2.71828" width="100.999" height="50"/></svg>'
    const out = normalizeSvg(input)
    expect(out).toContain('x="3.14"')
    expect(out).toContain('y="2.72"')
    expect(out).toContain('width="101"')
    expect(out).toContain('height="50"')
  })

  it('rounds numeric tokens inside transform values', () => {
    const input = '<svg xmlns="http://www.w3.org/2000/svg"><g transform="translate(3.14159, 5.27182) scale(0.353277)"/></svg>'
    const out = normalizeSvg(input)
    expect(out).toContain('translate(3.14, 5.27)')
    expect(out).toContain('scale(0.35)')
  })

  it('rounds numeric tokens inside path d attributes', () => {
    const input = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M3.14159 4.5 L9.99999 2.111"/></svg>'
    const out = normalizeSvg(input)
    expect(out).toMatch(/d="M ?3\.14 ?4\.5 ?L ?10 ?2\.11"/)
  })

  it('sorts attributes alphabetically for deterministic ordering', () => {
    const input = '<svg xmlns="http://www.w3.org/2000/svg"><rect y="2" fill="red" x="1"/></svg>'
    const out = normalizeSvg(input)
    const fillIdx = out.indexOf('fill=')
    const xIdx = out.indexOf('x=')
    const yIdx = out.indexOf('y=')
    expect(fillIdx).toBeGreaterThan(0)
    expect(fillIdx).toBeLessThan(xIdx)
    expect(xIdx).toBeLessThan(yIdx)
  })

  it('preserves element order in document', () => {
    const input = '<svg xmlns="http://www.w3.org/2000/svg"><rect x="1"/><circle r="2"/><text>hi</text></svg>'
    const out = normalizeSvg(input)
    const rectIdx = out.indexOf('<rect')
    const circleIdx = out.indexOf('<circle')
    const textIdx = out.indexOf('<text')
    expect(rectIdx).toBeLessThan(circleIdx)
    expect(circleIdx).toBeLessThan(textIdx)
  })

  it('strips title/desc/metadata elements defensively', () => {
    const input = '<svg xmlns="http://www.w3.org/2000/svg"><title>x</title><desc>y</desc><metadata>z</metadata><rect x="1"/></svg>'
    const out = normalizeSvg(input)
    expect(out).not.toContain('<title')
    expect(out).not.toContain('<desc')
    expect(out).not.toContain('<metadata')
    expect(out).toContain('<rect')
  })

  it('is idempotent: normalize(normalize(x)) === normalize(x)', () => {
    const input = '<svg xmlns="http://www.w3.org/2000/svg"><g transform="translate(3.14159, 5.27)"><rect id="vf-7" x="10.999" fill="blue"/></g></svg>'
    const once = normalizeSvg(input)
    const twice = normalizeSvg(once)
    expect(twice).toBe(once)
  })

  it('preserves text content of text/tspan elements', () => {
    const input = '<svg xmlns="http://www.w3.org/2000/svg"><text x="10">Hello, world</text></svg>'
    const out = normalizeSvg(input)
    expect(out).toContain('Hello, world')
  })

  it('handles tspan x-arrays (space-separated number lists)', () => {
    const input = '<svg xmlns="http://www.w3.org/2000/svg"><text><tspan x="1.111 2.222 3.333">abc</tspan></text></svg>'
    const out = normalizeSvg(input)
    expect(out).toContain('1.11')
    expect(out).toContain('2.22')
    expect(out).toContain('3.33')
  })
})
