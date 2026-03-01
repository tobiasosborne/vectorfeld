import { describe, it, expect, beforeEach } from 'vitest'
import { zoomAtPoint, ZOOM_FACTOR } from './zoom'
import { parseViewBox } from './coordinates'

function makeSvg(clientW: number, clientH: number, vbW: number, vbH: number): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  Object.defineProperty(svg, 'clientWidth', { value: clientW, configurable: true })
  Object.defineProperty(svg, 'clientHeight', { value: clientH, configurable: true })
  svg.getBoundingClientRect = () => ({
    x: 0, y: 0, left: 0, top: 0,
    width: clientW, height: clientH,
    right: clientW, bottom: clientH,
    toJSON: () => '',
  })
  svg.setAttribute('viewBox', `0 0 ${vbW} ${vbH}`)
  document.body.appendChild(svg)
  return svg
}

describe('zoom', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('zooms in (shrinks viewBox) on scroll up', () => {
    const svg = makeSvg(800, 600, 200, 150)
    const vbBefore = parseViewBox(svg)

    // deltaY < 0 = scroll up = zoom in
    zoomAtPoint(svg, 400, 300, -1)
    const vbAfter = parseViewBox(svg)

    expect(vbAfter.width).toBeLessThan(vbBefore.width)
    expect(vbAfter.height).toBeLessThan(vbBefore.height)
  })

  it('zooms out (grows viewBox) on scroll down', () => {
    const svg = makeSvg(800, 600, 200, 150)
    const vbBefore = parseViewBox(svg)

    // deltaY > 0 = scroll down = zoom out
    zoomAtPoint(svg, 400, 300, 1)
    const vbAfter = parseViewBox(svg)

    expect(vbAfter.width).toBeGreaterThan(vbBefore.width)
    expect(vbAfter.height).toBeGreaterThan(vbBefore.height)
  })

  it('scales viewBox by ZOOM_FACTOR per step', () => {
    const svg = makeSvg(800, 600, 200, 150)

    zoomAtPoint(svg, 400, 300, 1) // zoom out
    const vb = parseViewBox(svg)

    expect(vb.width).toBeCloseTo(200 * ZOOM_FACTOR, 5)
    expect(vb.height).toBeCloseTo(150 * ZOOM_FACTOR, 5)
  })

  it('keeps the center point stable when zooming at center', () => {
    const svg = makeSvg(800, 600, 200, 150)

    // Zoom at the center of the SVG element (screen coords 400, 300)
    // Center doc point = (0 + 200/2, 0 + 150/2) = (100, 75)
    zoomAtPoint(svg, 400, 300, -1)
    const vb = parseViewBox(svg)

    // After zoom, the center of the viewBox should still map to (100, 75)
    const centerX = vb.x + vb.width / 2
    const centerY = vb.y + vb.height / 2
    expect(centerX).toBeCloseTo(100, 3)
    expect(centerY).toBeCloseTo(75, 3)
  })

  it('keeps top-left stable when zooming at top-left corner', () => {
    const svg = makeSvg(800, 600, 200, 150)

    // Zoom at screen (0, 0) = doc point (0, 0) = viewBox origin
    zoomAtPoint(svg, 0, 0, -1)
    const vb = parseViewBox(svg)

    // Origin should stay at (0, 0)
    expect(vb.x).toBeCloseTo(0, 5)
    expect(vb.y).toBeCloseTo(0, 5)
  })

  it('does not zoom beyond min limit', () => {
    const svg = makeSvg(800, 600, 200, 150)
    // Zoom out many times
    for (let i = 0; i < 200; i++) {
      zoomAtPoint(svg, 400, 300, 1)
    }
    const vb = parseViewBox(svg)
    // viewBox should still be finite and reasonable
    expect(vb.width).toBeGreaterThan(0)
    expect(vb.width).toBeLessThan(100000)
  })
})
