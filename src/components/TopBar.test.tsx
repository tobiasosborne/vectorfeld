import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { TopBar } from './TopBar'

const noopMenus = [
  { label: 'File', items: [{ label: 'Open', action: () => {} }] },
  { label: 'Edit', items: [{ label: 'Undo', action: () => {} }] },
]

describe('<TopBar>', () => {
  it('renders the brand mark and the four menu words', () => {
    const { getByText, container } = render(
      <TopBar menus={noopMenus} activeDocName="Untitled" dirty={false} onExportPdf={() => {}} />,
    )
    // Brand mark — a small gradient square with data-role="brand"
    expect(container.querySelector('[data-role="brand"]')).not.toBeNull()
    expect(getByText('File')).toBeInTheDocument()
    expect(getByText('Edit')).toBeInTheDocument()
  })

  it('renders a single tab stub with the active document name', () => {
    const { container } = render(
      <TopBar menus={noopMenus} activeDocName="Flyer.pdf" dirty={false} onExportPdf={() => {}} />,
    )
    const tabs = container.querySelectorAll('[data-role="tab"]')
    expect(tabs).toHaveLength(1)
    expect(tabs[0].textContent).toContain('Flyer.pdf')
  })

  it('shows a dirty dot on the tab when dirty=true', () => {
    const { container, rerender } = render(
      <TopBar menus={noopMenus} activeDocName="Flyer.pdf" dirty={false} onExportPdf={() => {}} />,
    )
    expect(container.querySelector('[data-role="tab-dirty-dot"]')).toBeNull()
    rerender(<TopBar menus={noopMenus} activeDocName="Flyer.pdf" dirty={true} onExportPdf={() => {}} />)
    expect(container.querySelector('[data-role="tab-dirty-dot"]')).not.toBeNull()
  })

  it('renders an Export PDF button and invokes onExportPdf on click', () => {
    const onExport = vi.fn()
    const { getByText } = render(
      <TopBar menus={noopMenus} activeDocName="x" dirty={false} onExportPdf={onExport} />,
    )
    fireEvent.click(getByText('Export PDF'))
    expect(onExport).toHaveBeenCalledTimes(1)
  })

  it('renders an inert Split button (multi-doc stub)', () => {
    const { container } = render(
      <TopBar menus={noopMenus} activeDocName="x" dirty={false} onExportPdf={() => {}} />,
    )
    const split = container.querySelector('[data-role="split"]') as HTMLButtonElement
    expect(split).not.toBeNull()
    expect(split.textContent).toContain('Split')
  })

  it('opens a menu dropdown on click and fires the item action', () => {
    const onOpen = vi.fn()
    const menus = [
      { label: 'File', items: [{ label: 'Open PDF', action: onOpen }] },
    ]
    const { getByText } = render(
      <TopBar menus={menus} activeDocName="x" dirty={false} onExportPdf={() => {}} />,
    )
    fireEvent.click(getByText('File'))
    fireEvent.click(getByText('Open PDF'))
    expect(onOpen).toHaveBeenCalledTimes(1)
  })
})
