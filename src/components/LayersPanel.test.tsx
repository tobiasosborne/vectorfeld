import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { LayersPanel } from './LayersPanel'
import { EditorProvider } from '../model/EditorContext'

// Small harness that wraps LayersPanel in EditorProvider with no SVG.
function renderInProvider() {
  return render(
    <EditorProvider>
      <LayersPanel />
    </EditorProvider>,
  )
}

describe('<LayersPanel> Atrium restyle', () => {
  it('renders Layers + Pages tabs', () => {
    const { container } = renderInProvider()
    expect(container.querySelector('[data-role="layers-tab"]')).not.toBeNull()
    expect(container.querySelector('[data-role="pages-tab"]')).not.toBeNull()
  })

  it('shows the Layers tab as active (accent-tint pill)', () => {
    const { container } = renderInProvider()
    const layersTab = container.querySelector('[data-role="layers-tab"]') as HTMLElement
    const pagesTab = container.querySelector('[data-role="pages-tab"]') as HTMLElement
    expect(layersTab.style.background).toContain('panel-solid')
    expect(pagesTab.style.background).toBe('transparent')
  })

  it('renders an "+" add-layer button', () => {
    const { container } = renderInProvider()
    const btns = Array.from(container.querySelectorAll('button'))
    expect(btns.some(b => b.textContent === '+')).toBe(true)
  })
})
