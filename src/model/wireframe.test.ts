import { describe, it, expect, beforeEach, vi } from 'vitest'
import { isWireframe, toggleWireframe, setWireframe, subscribeWireframe, resetWireframe, WIREFRAME_STYLE } from './wireframe'

beforeEach(() => {
  resetWireframe()
})

describe('wireframe', () => {
  it('starts off', () => {
    expect(isWireframe()).toBe(false)
  })

  it('toggleWireframe flips state', () => {
    toggleWireframe()
    expect(isWireframe()).toBe(true)
    toggleWireframe()
    expect(isWireframe()).toBe(false)
  })

  it('setWireframe sets explicit state', () => {
    setWireframe(true)
    expect(isWireframe()).toBe(true)
    setWireframe(true) // no-op
    expect(isWireframe()).toBe(true)
    setWireframe(false)
    expect(isWireframe()).toBe(false)
  })

  it('subscribeWireframe fires on toggle', () => {
    const fn = vi.fn()
    subscribeWireframe(fn)
    toggleWireframe()
    expect(fn).toHaveBeenCalledOnce()
  })

  it('unsubscribe stops notifications', () => {
    const fn = vi.fn()
    const unsub = subscribeWireframe(fn)
    unsub()
    toggleWireframe()
    expect(fn).not.toHaveBeenCalled()
  })

  it('WIREFRAME_STYLE targets layer children', () => {
    expect(WIREFRAME_STYLE).toContain('g[data-layer-name]')
    expect(WIREFRAME_STYLE).toContain('fill: none')
    expect(WIREFRAME_STYLE).toContain('stroke: #333333')
  })
})
