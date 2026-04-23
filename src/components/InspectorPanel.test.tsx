import { describe, it, expect } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { InspectorPanel } from './InspectorPanel'
import { EditorProvider } from '../model/EditorContext'

function renderInProvider() {
  return render(
    <EditorProvider>
      <InspectorPanel />
    </EditorProvider>,
  )
}

describe('<InspectorPanel>', () => {
  it('renders "No selection" header when selection is empty', () => {
    const { getByText } = renderInProvider()
    expect(getByText('No selection')).toBeInTheDocument()
  })

  it('renders a Frame section heading', () => {
    const { getByText } = renderInProvider()
    expect(getByText('Frame')).toBeInTheDocument()
  })

  it('renders a Style section heading', () => {
    const { getByText } = renderInProvider()
    expect(getByText('Style')).toBeInTheDocument()
  })

  it('renders the merged Layers tab in the bottom region', () => {
    const { container } = renderInProvider()
    expect(container.querySelector('[data-role="inspector-layers-tab"]')).not.toBeNull()
    expect(container.querySelector('[data-role="inspector-properties-tab"]')).not.toBeNull()
  })

  it('defaults bottom tab to Layers (shows Layers content immediately)', () => {
    const { container } = renderInProvider()
    const layersTab = container.querySelector('[data-role="inspector-layers-tab"]') as HTMLElement
    expect(layersTab.style.background).toContain('panel-solid')
  })

  it('clicking the Pages tab switches bottom content away from Layers', () => {
    const { container, getByText } = renderInProvider()
    const pagesTab = container.querySelector('[data-role="inspector-properties-tab"]') as HTMLElement
    fireEvent.click(pagesTab)
    expect(getByText(/multi-page/i)).toBeInTheDocument()
  })
})
