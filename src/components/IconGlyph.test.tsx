import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { IconGlyph, ICONS, IconLabels, type IconName } from './IconGlyph'

// The full tool roster from design/unpacked/design_handoff_vectorfeld/icons.jsx.
// Every name here MUST have a stroke entry in ICONS.
const rosterIds: IconName[] = [
  'select', 'directSelect', 'lasso',
  'pen', 'pencil', 'brush', 'text', 'typeArea',
  'rect', 'ellipse', 'polygon', 'star', 'line', 'arc',
  'rotate', 'scale', 'reflect', 'shear',
  'scissors', 'knife', 'shapeBuilder', 'pathfinder', 'join',
  'fill', 'gradient', 'eyedropper', 'mesh', 'blend',
  'hand', 'zoom', 'artboard', 'slice', 'ruler',
  'erase', 'warp', 'width', 'symbolSpray',
]

describe('IconGlyph + ICONS dictionary', () => {
  it('ICONS covers every roster entry with a stroke layer', () => {
    for (const id of rosterIds) {
      expect(ICONS[id]).toBeDefined()
      expect(ICONS[id].stroke).toBeDefined()
    }
  })

  it('IconLabels covers every roster entry', () => {
    for (const id of rosterIds) expect(IconLabels[id]).toBeTruthy()
  })

  it('renders <svg viewBox="0 0 20 20"> at size=20 by default', () => {
    const { container } = render(<IconGlyph name="select" />)
    const svg = container.querySelector('svg') as SVGSVGElement
    expect(svg).not.toBeNull()
    expect(svg.getAttribute('viewBox')).toBe('0 0 20 20')
    expect(svg.getAttribute('width')).toBe('20')
    expect(svg.getAttribute('height')).toBe('20')
  })

  it('applies 1.25px hairline stroke for the default (hairline) system', () => {
    const { container } = render(<IconGlyph name="pen" />)
    const strokeGroup = container.querySelector('g[stroke-width], g[strokeWidth]')
    const w = strokeGroup?.getAttribute('stroke-width')
    expect(w).toBe('1.25')
  })

  it('honors size prop', () => {
    const { container } = render(<IconGlyph name="rect" size={24} />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('width')).toBe('24')
    expect(svg.getAttribute('height')).toBe('24')
  })

  it('uses 1.6px stroke in the stamped system', () => {
    const { container } = render(<IconGlyph name="select" system="stamped" />)
    const g = container.querySelector('g[stroke-width]')
    expect(g?.getAttribute('stroke-width')).toBe('1.6')
  })

  it('renders something visible for an unknown name (fail-soft, not crash)', () => {
    // Unknown tool names shouldn't crash the tool rail
    const { container } = render(
      <IconGlyph name={'not-a-real-icon' as IconName} />,
    )
    expect(container.textContent).toContain('?')
  })
})
