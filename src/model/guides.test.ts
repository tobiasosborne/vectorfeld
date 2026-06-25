import { describe, it, expect, beforeEach, vi } from 'vitest'
import { addGuide, removeGuide, getGuides, clearAllGuides, subscribeGuides, getGuideCandidates, resetGuides } from './guides'
import { guideDropPosition } from '../components/Ruler'

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

describe('guideDropPosition (vectorfeld-3yu.20 axis-swap regression)', () => {
  // Asymmetric drop so an axis swap (the original bug) produces a different
  // number and fails. docX !== docY by construction.
  const drop = { x: 30, y: 200 }

  it("an 'h' guide tracks the drop's document Y (not X)", () => {
    expect(guideDropPosition('h', drop)).toBe(200)
  })

  it("a 'v' guide tracks the drop's document X (not Y)", () => {
    expect(guideDropPosition('v', drop)).toBe(30)
  })

  it('rounds to 0.1mm', () => {
    expect(guideDropPosition('h', { x: 12.34, y: 56.789 })).toBe(56.8)
    expect(guideDropPosition('v', { x: 12.34, y: 56.789 })).toBe(12.3)
  })

  it('a created horizontal guide renders at the drop Y, a vertical guide at the drop X', () => {
    // End-to-end through the guide model: axis tag and coordinate must agree
    // with Canvas rendering (axis:'h' line lives at y=position; 'v' at x=position).
    addGuide('h', guideDropPosition('h', drop))
    addGuide('v', guideDropPosition('v', drop))
    const guides = getGuides()
    const h = guides.find((g) => g.axis === 'h')
    const v = guides.find((g) => g.axis === 'v')
    expect(h?.position).toBe(200) // horizontal line at document y = 200
    expect(v?.position).toBe(30)  // vertical line at document x = 30
  })
})
