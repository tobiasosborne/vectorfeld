import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getSwatches, addSwatch, removeSwatch, subscribeSwatches, resetSwatches } from './swatches'

beforeEach(() => {
  resetSwatches()
})

describe('swatches', () => {
  it('starts with default swatches', () => {
    const swatches = getSwatches()
    expect(swatches.length).toBeGreaterThanOrEqual(8)
    expect(swatches[0].name).toBe('Black')
  })

  it('addSwatch adds to list', () => {
    const before = getSwatches().length
    addSwatch('Custom', '#abcdef')
    expect(getSwatches()).toHaveLength(before + 1)
    expect(getSwatches().find(s => s.name === 'Custom')?.color).toBe('#abcdef')
  })

  it('removeSwatch removes by id', () => {
    const s = addSwatch('ToRemove', '#123456')
    const before = getSwatches().length
    removeSwatch(s.id)
    expect(getSwatches()).toHaveLength(before - 1)
    expect(getSwatches().find(sw => sw.id === s.id)).toBeUndefined()
  })

  it('subscribeSwatches fires on add', () => {
    const fn = vi.fn()
    subscribeSwatches(fn)
    addSwatch('Test', '#000')
    expect(fn).toHaveBeenCalledOnce()
  })

  it('unsubscribe stops notifications', () => {
    const fn = vi.fn()
    const unsub = subscribeSwatches(fn)
    unsub()
    addSwatch('Test', '#000')
    expect(fn).not.toHaveBeenCalled()
  })

  it('getSwatches returns copy', () => {
    const swatches = getSwatches()
    swatches.push({ id: 'fake', name: 'Fake', color: '#000' })
    expect(getSwatches().find(s => s.id === 'fake')).toBeUndefined()
  })
})
