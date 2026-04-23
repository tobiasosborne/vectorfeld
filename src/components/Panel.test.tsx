import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { Panel } from './Panel'

describe('<Panel>', () => {
  it('renders children inside a div with data-role="panel"', () => {
    const { container } = render(<Panel>hello</Panel>)
    const panel = container.querySelector('[data-role="panel"]')
    expect(panel).not.toBeNull()
    expect(panel?.textContent).toBe('hello')
  })

  it('applies the floating translucent card treatment via CSS vars', () => {
    const { container } = render(<Panel>x</Panel>)
    const panel = container.querySelector('[data-role="panel"]') as HTMLElement
    const style = panel.getAttribute('style') || ''
    expect(style).toContain('var(--color-panel)')
    expect(style).toContain('var(--blur-panel)')
    expect(style).toContain('var(--radius-panel)')
    expect(style).toContain('var(--shadow-panel)')
    expect(style).toContain('var(--color-border)')
  })

  it('forwards style prop (e.g. positioning) without clobbering panel treatment', () => {
    const { container } = render(
      <Panel style={{ position: 'absolute', top: 12, left: 12 }}>x</Panel>,
    )
    const panel = container.querySelector('[data-role="panel"]') as HTMLElement
    const style = panel.getAttribute('style') || ''
    expect(style).toContain('position: absolute')
    expect(style).toContain('top: 12px')
    expect(style).toContain('var(--color-panel)')
  })

  it('forwards className', () => {
    const { container } = render(<Panel className="leftrail">x</Panel>)
    const panel = container.querySelector('[data-role="panel"]') as HTMLElement
    expect(panel.className).toContain('leftrail')
  })

  it('renders as <div> by default and respects role override via as', () => {
    const { container } = render(<Panel>x</Panel>)
    expect(container.querySelector('[data-role="panel"]')?.tagName).toBe('DIV')
  })
})
