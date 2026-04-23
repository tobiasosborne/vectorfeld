import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import App from './App'

describe('App', () => {
  it('renders the app shell with all panels', () => {
    const { container } = render(<App />)
    // Brand mark replaced the "vectorfeld" text in the Atrium redesign
    expect(container.querySelector('[data-role="brand"]')).toBeInTheDocument()
    expect(screen.getByText('Layers')).toBeInTheDocument()
    expect(screen.getByText('Properties')).toBeInTheDocument()
  })

  it('has the app container element', () => {
    const { container } = render(<App />)
    expect(container.querySelector('#app')).toBeInTheDocument()
  })
})
