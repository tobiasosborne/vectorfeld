import { describe, it, expect, beforeEach, vi } from 'vitest'
import { addGuide, removeGuide, getGuides, clearAllGuides, subscribeGuides, getGuideCandidates, resetGuides } from './guides'

beforeEach(() => {
  resetGuides()
})

describe('guides', () => {
  it('starts empty', () => {
    expect(getGuides()).toHaveLength(0)
  })

  it('addGuide adds a guide', () => {
    const g = addGuide('h', 50)
    expect(g.axis).toBe('h')
    expect(g.position).toBe(50)
    expect(getGuides()).toHaveLength(1)
  })

  it('removeGuide removes by id', () => {
    const g = addGuide('v', 100)
    removeGuide(g.id)
    expect(getGuides()).toHaveLength(0)
  })

  it('clearAllGuides removes all', () => {
    addGuide('h', 10)
    addGuide('v', 20)
    clearAllGuides()
    expect(getGuides()).toHaveLength(0)
  })

  it('subscribeGuides fires on add', () => {
    const fn = vi.fn()
    subscribeGuides(fn)
    addGuide('h', 50)
    expect(fn).toHaveBeenCalledOnce()
  })

  it('subscribeGuides fires on remove', () => {
    const g = addGuide('h', 50)
    const fn = vi.fn()
    subscribeGuides(fn)
    removeGuide(g.id)
    expect(fn).toHaveBeenCalledOnce()
  })

  it('unsubscribe stops notifications', () => {
    const fn = vi.fn()
    const unsub = subscribeGuides(fn)
    unsub()
    addGuide('h', 50)
    expect(fn).not.toHaveBeenCalled()
  })

  it('getGuideCandidates returns smart-guide compatible format', () => {
    addGuide('h', 50)  // horizontal guide => y alignment
    addGuide('v', 100) // vertical guide => x alignment
    const candidates = getGuideCandidates()
    expect(candidates).toEqual([
      { value: 50, axis: 'y' },
      { value: 100, axis: 'x' },
    ])
  })

  it('getGuides returns copy', () => {
    addGuide('h', 50)
    const guides = getGuides()
    guides.push({ id: 'fake', axis: 'v', position: 0 })
    expect(getGuides()).toHaveLength(1) // original unaffected
  })
})
