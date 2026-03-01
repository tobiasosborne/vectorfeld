import { describe, it, expect, beforeEach } from 'vitest'
import { parseViewBox, setViewBox, getZoomLevel, getZoomPercent } from './coordinates'

function makeSvg(width: number, height: number, vbW: number, vbH: number): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  // jsdom doesn't compute layout, so we mock clientWidth/clientHeight
  Object.defineProperty(svg, 'clientWidth', { value: width, configurable: true })
  Object.defineProperty(svg, 'clientHeight', { value: height, configurable: true })
  svg.setAttribute('viewBox', `0 0 ${vbW} ${vbH}`)
  document.body.appendChild(svg)
  return svg
}

describe('coordinates', () => {
  let svg: SVGSVGElement

  beforeEach(() => {
    document.body.innerHTML = ''
  })

  describe('parseViewBox', () => {
    it('parses default A4 viewBox', () => {
      svg = makeSvg(800, 600, 210, 297)
      const vb = parseViewBox(svg)
      expect(vb).toEqual({ x: 0, y: 0, width: 210, height: 297 })
    })

    it('parses viewBox with offset', () => {
      svg = makeSvg(800, 600, 210, 297)
      setViewBox(svg, 10, 20, 100, 150)
      const vb = parseViewBox(svg)
      expect(vb).toEqual({ x: 10, y: 20, width: 100, height: 150 })
    })
  })

  describe('setViewBox', () => {
    it('updates the viewBox attribute', () => {
      svg = makeSvg(800, 600, 210, 297)
      setViewBox(svg, 5, 10, 100, 200)
      expect(svg.getAttribute('viewBox')).toBe('5 10 100 200')
    })
  })

  describe('getZoomLevel', () => {
    it('returns px per SVG unit', () => {
      // 800px wide showing 200 units → 4 px/unit
      svg = makeSvg(800, 600, 200, 300)
      expect(getZoomLevel(svg)).toBe(4)
    })

    it('returns 1 when viewBox width is 0', () => {
      svg = makeSvg(800, 600, 0, 0)
      expect(getZoomLevel(svg)).toBe(1)
    })

    it('changes when viewBox is updated', () => {
      svg = makeSvg(800, 600, 200, 300)
      expect(getZoomLevel(svg)).toBe(4)
      setViewBox(svg, 0, 0, 400, 600)
      expect(getZoomLevel(svg)).toBe(2)
    })
  })

  describe('getZoomPercent', () => {
    it('returns ~100% when px/unit matches 96 DPI mm mapping', () => {
      // At 96 DPI, 1mm ≈ 3.7795 px
      // So for 100% zoom: clientWidth / vbWidth ≈ 3.7795
      const pxPerMm = 96 / 25.4
      svg = makeSvg(pxPerMm * 210, pxPerMm * 297, 210, 297)
      expect(getZoomPercent(svg)).toBeCloseTo(100, 1)
    })

    it('returns ~200% at double zoom', () => {
      const pxPerMm = 96 / 25.4
      svg = makeSvg(pxPerMm * 210, pxPerMm * 297, 105, 148.5)
      expect(getZoomPercent(svg)).toBeCloseTo(200, 1)
    })
  })
})
