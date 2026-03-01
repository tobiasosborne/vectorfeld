import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import App from './App'

describe('App', () => {
  it('renders the app shell with all panels', () => {
    render(<App />)
    expect(screen.getByText('vectorfeld')).toBeInTheDocument()
    expect(screen.getByText('Layers')).toBeInTheDocument()
    expect(screen.getByText('Properties')).toBeInTheDocument()
  })

  it('has the app container element', () => {
    const { container } = render(<App />)
    expect(container.querySelector('#app')).toBeInTheDocument()
  })
})
