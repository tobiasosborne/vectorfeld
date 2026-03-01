import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { ArtboardDialog, PRESETS } from './ArtboardDialog'

afterEach(cleanup)

describe('ArtboardDialog', () => {
  const defaultDims = { width: 210, height: 297 }

  it('renders with current dimensions', () => {
    render(<ArtboardDialog dimensions={defaultDims} onApply={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByTestId('artboard-width')).toHaveValue(210)
    expect(screen.getByTestId('artboard-height')).toHaveValue(297)
  })

  it('applies new dimensions on Apply click', () => {
    const onApply = vi.fn()
    const onClose = vi.fn()
    render(<ArtboardDialog dimensions={defaultDims} onApply={onApply} onClose={onClose} />)

    fireEvent.change(screen.getByTestId('artboard-width'), { target: { value: '100' } })
    fireEvent.change(screen.getByTestId('artboard-height'), { target: { value: '50' } })
    fireEvent.click(screen.getByTestId('artboard-apply'))

    expect(onApply).toHaveBeenCalledWith({ width: 100, height: 50 })
    expect(onClose).toHaveBeenCalled()
  })

  it('renders preset buttons', () => {
    render(<ArtboardDialog dimensions={defaultDims} onApply={vi.fn()} onClose={vi.fn()} />)
    for (const preset of PRESETS) {
      expect(screen.getByText(preset.name)).toBeInTheDocument()
    }
  })

  it('applies preset values when preset button is clicked', () => {
    render(<ArtboardDialog dimensions={defaultDims} onApply={vi.fn()} onClose={vi.fn()} />)
    fireEvent.click(screen.getByText('A3'))
    expect(screen.getByTestId('artboard-width')).toHaveValue(297)
    expect(screen.getByTestId('artboard-height')).toHaveValue(420)
  })

  it('swaps width and height on orientation toggle', () => {
    render(<ArtboardDialog dimensions={defaultDims} onApply={vi.fn()} onClose={vi.fn()} />)
    fireEvent.click(screen.getByTitle('Swap orientation'))
    expect(screen.getByTestId('artboard-width')).toHaveValue(297)
    expect(screen.getByTestId('artboard-height')).toHaveValue(210)
  })

  it('does not apply invalid dimensions', () => {
    const onApply = vi.fn()
    render(<ArtboardDialog dimensions={defaultDims} onApply={onApply} onClose={vi.fn()} />)

    fireEvent.change(screen.getByTestId('artboard-width'), { target: { value: '-10' } })
    fireEvent.click(screen.getByTestId('artboard-apply'))
    expect(onApply).not.toHaveBeenCalled()
  })

  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn()
    render(<ArtboardDialog dimensions={defaultDims} onApply={vi.fn()} onClose={onClose} />)
    fireEvent.click(screen.getByText('Cancel'))
    expect(onClose).toHaveBeenCalled()
  })
})
