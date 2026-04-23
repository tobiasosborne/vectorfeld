import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { StatusBar } from './StatusBar'

describe('<StatusBar>', () => {
  it('renders the Atrium saved indicator (green dot + text)', () => {
    const { container, getByText } = render(
      <StatusBar cursorX={0} cursorY={0} zoomPercent={100} />,
    )
    expect(container.querySelector('[data-role="saved-dot"]')).not.toBeNull()
    expect(getByText(/saved/i)).toBeInTheDocument()
  })

  it('renders page navigator with inert prev/next buttons (single-page for now)', () => {
    const { container } = render(<StatusBar cursorX={0} cursorY={0} zoomPercent={100} />)
    const nav = container.querySelector('[data-role="page-nav"]') as HTMLElement
    expect(nav).not.toBeNull()
    expect(nav.textContent).toContain('Page')
  })

  it('renders cursor coordinates in mm', () => {
    const { getByText } = render(<StatusBar cursorX={123.45} cursorY={67.89} zoomPercent={100} />)
    expect(getByText(/123\.5/)).toBeInTheDocument()
    expect(getByText(/67\.9/)).toBeInTheDocument()
  })

  it('renders zoom percent with +/- buttons that call onZoomIn/Out', () => {
    const zoomIn = vi.fn()
    const zoomOut = vi.fn()
    const { container, getByText } = render(
      <StatusBar
        cursorX={0}
        cursorY={0}
        zoomPercent={150}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
      />,
    )
    expect(getByText('150%')).toBeInTheDocument()
    const plus = container.querySelector('[data-role="zoom-in"]') as HTMLButtonElement
    const minus = container.querySelector('[data-role="zoom-out"]') as HTMLButtonElement
    fireEvent.click(plus)
    fireEvent.click(minus)
    expect(zoomIn).toHaveBeenCalledTimes(1)
    expect(zoomOut).toHaveBeenCalledTimes(1)
  })

  it('renders file info (name + size) when provided', () => {
    const { getByText } = render(
      <StatusBar
        cursorX={0}
        cursorY={0}
        zoomPercent={100}
        fileName="Autumn-catalog"
        fileSize="1.4 MB"
        format="A4"
      />,
    )
    expect(getByText(/Autumn-catalog/)).toBeInTheDocument()
    expect(getByText(/1\.4 MB/)).toBeInTheDocument()
    expect(getByText(/A4/)).toBeInTheDocument()
  })
})
