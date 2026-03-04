import { render, cleanup } from '@testing-library/react'
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { Canvas } from './Canvas'
import { resetArtboards } from '../model/artboard'

beforeEach(() => resetArtboards())
afterEach(cleanup)

describe('Canvas', () => {
  it('renders an SVG element inside the container', () => {
    const { getByTestId } = render(<Canvas />)
    const container = getByTestId('canvas-container')
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
  })

  it('sets default A4 viewBox (210x297 with padding)', () => {
    const { getByTestId } = render(<Canvas />)
    const svg = getByTestId('canvas-container').querySelector('svg')!
    // computeDocumentBounds adds 10mm padding: -10 -10 230 317
    const vb = svg.getAttribute('viewBox')!
    expect(vb).toContain('230')  // 210 + 2*10
    expect(vb).toContain('317')  // 297 + 2*10
  })

  it('uses custom dimensions when provided', () => {
    const { getByTestId } = render(
      <Canvas dimensions={{ width: 100, height: 50 }} />
    )
    const svg = getByTestId('canvas-container').querySelector('svg')!
    const vb = svg.getAttribute('viewBox')!
    expect(vb).toContain('120')  // 100 + 2*10
    expect(vb).toContain('70')   // 50 + 2*10
  })

  it('renders an artboard background rect', () => {
    const { getByTestId } = render(<Canvas />)
    const svg = getByTestId('canvas-container').querySelector('svg')!
    const artboard = svg.querySelector('[data-role="artboard"]')
    expect(artboard).not.toBeNull()
    expect(artboard!.getAttribute('fill')).toBe('#ffffff')
    expect(artboard!.getAttribute('width')).toBe('210')
    expect(artboard!.getAttribute('height')).toBe('297')
  })

  it('creates a default layer group', () => {
    const { getByTestId } = render(<Canvas />)
    const svg = getByTestId('canvas-container').querySelector('svg')!
    const layer = svg.querySelector('g[data-layer-name]')
    expect(layer).not.toBeNull()
    expect(layer!.getAttribute('data-layer-name')).toBe('Layer 1')
  })

  it('has SVG namespace', () => {
    const { getByTestId } = render(<Canvas />)
    const svg = getByTestId('canvas-container').querySelector('svg')!
    expect(svg.getAttribute('xmlns')).toBe('http://www.w3.org/2000/svg')
  })
})
