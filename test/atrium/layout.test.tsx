import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import App from '../../src/App'

// These assertions lock in the Atrium floating-panel layout.
// Five named floating Panels + a canvas root with radial-gradient bg.
describe('Atrium floating-panel layout', () => {
  it('mounts a canvas root with a radial-gradient background', () => {
    const { container } = render(<App />)
    const root = container.querySelector('[data-role="canvas-root"]') as HTMLElement
    expect(root).not.toBeNull()
    expect(root.style.background).toContain('radial-gradient')
  })

  it('renders five named floating Panels (topbar, leftrail, layers-shell, inspector, statusbar)', () => {
    const { container } = render(<App />)
    for (const testid of ['topbar', 'leftrail', 'layers-shell', 'inspector', 'statusbar']) {
      const el = container.querySelector(`[data-testid="${testid}"]`) as HTMLElement
      expect(el, `missing panel ${testid}`).not.toBeNull()
      expect(el.getAttribute('data-role'), `${testid} must be a Panel`).toBe('panel')
      expect(el.style.position, `${testid} must be absolute-positioned`).toBe('absolute')
    }
  })

  it('positions TopBar at top:12/left:12/right:12 h:44', () => {
    const { container } = render(<App />)
    const el = container.querySelector('[data-testid="topbar"]') as HTMLElement
    expect(el.style.top).toBe('12px')
    expect(el.style.left).toBe('12px')
    expect(el.style.right).toBe('12px')
    expect(el.style.height).toBe('44px')
  })

  it('positions LeftRail at left:12/top:72 w:58', () => {
    const { container } = render(<App />)
    const el = container.querySelector('[data-testid="leftrail"]') as HTMLElement
    expect(el.style.left).toBe('12px')
    expect(el.style.top).toBe('72px')
    expect(el.style.width).toBe('58px')
  })

  it('positions Inspector at right:12/top:72/bottom:60 w:286', () => {
    const { container } = render(<App />)
    const el = container.querySelector('[data-testid="inspector"]') as HTMLElement
    expect(el.style.right).toBe('12px')
    expect(el.style.top).toBe('72px')
    expect(el.style.bottom).toBe('60px')
    expect(el.style.width).toBe('286px')
  })

  it('positions StatusBar at bottom:12/left:12/right:12 h:40', () => {
    const { container } = render(<App />)
    const el = container.querySelector('[data-testid="statusbar"]') as HTMLElement
    expect(el.style.bottom).toBe('12px')
    expect(el.style.left).toBe('12px')
    expect(el.style.right).toBe('12px')
    expect(el.style.height).toBe('40px')
  })

  it('does not render the retired collapse toggle affordances', () => {
    const { container } = render(<App />)
    // Old UI had "Properties »" and "Layers »" collapse buttons.
    // After phase 2 they are gone (panels float, no space cost to collapse).
    expect(container.textContent).not.toContain('Properties »')
    expect(container.textContent).not.toContain('Layers »')
  })
})
