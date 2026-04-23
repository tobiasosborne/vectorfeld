import { describe, it, expect, beforeEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { LeftRail } from './LeftRail'
import { clearRegistry, registerTool, setActiveTool, getActiveToolName } from '../tools/registry'

// Minimal tool config factory — LeftRail only cares that the name exists.
const fakeTool = (name: string, shortcut: string) => ({
  name,
  icon: null,
  shortcut,
  handlers: {},
})

function registerRosterTools() {
  // Register the 7 real tools the rail uses (brush/knife are design-only).
  const tools = [
    ['select', 'v'],
    ['direct-select', 'a'],
    ['pen', 'p'],
    ['text', 't'],
    ['rectangle', 'r'],
    ['eyedropper', 'i'],
    ['eraser', 'x'],
    // 4 hidden-but-registered tools that overflow dropdown surfaces
    ['pencil', 'n'],
    ['measure', 'm'],
    ['lasso', 'j'],
    ['free-transform', 'q'],
  ]
  for (const [n, s] of tools) registerTool(fakeTool(n, s))
  setActiveTool('select')
}

describe('<LeftRail>', () => {
  beforeEach(() => {
    clearRegistry()
    registerRosterTools()
  })

  it('renders the 9-slot design roster in order', () => {
    const { container } = render(<LeftRail />)
    const slots = container.querySelectorAll('[data-tool-slot]')
    expect(slots).toHaveLength(9)
    const order = Array.from(slots).map(s => s.getAttribute('data-tool-slot'))
    expect(order).toEqual([
      'select', 'directSelect', 'pen', 'brush',
      'text', 'rect', 'knife', 'eyedropper', 'erase',
    ])
  })

  it('marks the active tool with data-active="true" (accent pill)', () => {
    const { container } = render(<LeftRail />)
    const selectBtn = container.querySelector('[data-tool-slot="select"]') as HTMLElement
    expect(selectBtn.getAttribute('data-active')).toBe('true')
    const textBtn = container.querySelector('[data-tool-slot="text"]') as HTMLElement
    expect(textBtn.getAttribute('data-active')).toBe('false')
  })

  it('clicking an active-backed rail slot switches tools', () => {
    const { container } = render(<LeftRail />)
    const rectBtn = container.querySelector('[data-tool-slot="rect"]') as HTMLElement
    fireEvent.click(rectBtn)
    expect(getActiveToolName()).toBe('rectangle')
  })

  it('brush + knife are disabled (no backing tool, show "Coming soon")', () => {
    const { container } = render(<LeftRail />)
    const brush = container.querySelector('[data-tool-slot="brush"]') as HTMLButtonElement
    const knife = container.querySelector('[data-tool-slot="knife"]') as HTMLButtonElement
    expect(brush.disabled).toBe(true)
    expect(knife.disabled).toBe(true)
    expect(brush.getAttribute('title') || '').toMatch(/coming soon/i)
    expect(knife.getAttribute('title') || '').toMatch(/coming soon/i)
  })

  it('disabled rail slots do not change the active tool when clicked', () => {
    const { container } = render(<LeftRail />)
    const brush = container.querySelector('[data-tool-slot="brush"]') as HTMLButtonElement
    fireEvent.click(brush)
    expect(getActiveToolName()).toBe('select')
  })

  it('renders shortcut hint text under each slot', () => {
    const { container } = render(<LeftRail />)
    const selectBtn = container.querySelector('[data-tool-slot="select"]') as HTMLElement
    expect(selectBtn.textContent).toContain('V')
  })

  it('exposes a "⋯" overflow button that surfaces hidden tools', () => {
    const { container } = render(<LeftRail />)
    const overflow = container.querySelector('[data-role="overflow"]') as HTMLButtonElement
    expect(overflow).not.toBeNull()
    expect(overflow.textContent).toContain('⋯')
  })
})
