import { describe, it, expect, beforeEach } from 'vitest'
import {
  getArtboards, getActiveArtboard, setActiveArtboard,
  addArtboard, removeArtboard, updateArtboard,
  computeDocumentBounds, artboardAtPoint, resetArtboards,
  subscribeArtboards,
} from './artboard'

describe('artboard', () => {
  beforeEach(() => resetArtboards())

  it('starts with no artboards', () => {
    expect(getArtboards()).toEqual([])
    expect(getActiveArtboard()).toBeNull()
  })

  it('adds artboard with default A4 dimensions', () => {
    const ab = addArtboard()
    expect(ab.width).toBe(210)
    expect(ab.height).toBe(297)
    expect(ab.x).toBe(0)
    expect(ab.y).toBe(0)
    expect(getArtboards()).toHaveLength(1)
    expect(getActiveArtboard()).toBe(ab)
  })

  it('adds multiple artboards laid out horizontally', () => {
    addArtboard(100, 100)
    addArtboard(200, 150)
    const abs = getArtboards()
    expect(abs).toHaveLength(2)
    expect(abs[0].x).toBe(0)
    expect(abs[1].x).toBe(120) // 100 + 20 gap
  })

  it('removes artboard and re-layouts', () => {
    const ab1 = addArtboard(100, 100)
    addArtboard(200, 150)
    removeArtboard(ab1.id)
    const abs = getArtboards()
    expect(abs).toHaveLength(1)
    expect(abs[0].x).toBe(0) // re-laid out from origin
  })

  it('sets active artboard', () => {
    addArtboard(100, 100, 'First')
    const ab2 = addArtboard(200, 150, 'Second')
    setActiveArtboard(ab2.id)
    expect(getActiveArtboard()?.name).toBe('Second')
  })

  it('falls back to first artboard when active is removed', () => {
    const ab1 = addArtboard(100, 100, 'First')
    const ab2 = addArtboard(200, 150, 'Second')
    setActiveArtboard(ab2.id)
    removeArtboard(ab2.id)
    expect(getActiveArtboard()?.id).toBe(ab1.id)
  })

  it('updates artboard properties', () => {
    const ab = addArtboard(100, 100, 'Test')
    updateArtboard(ab.id, { name: 'Renamed', width: 300 })
    expect(getArtboards()[0].name).toBe('Renamed')
    expect(getArtboards()[0].width).toBe(300)
  })

  it('computes document bounds', () => {
    addArtboard(100, 200)
    addArtboard(150, 100)
    const bounds = computeDocumentBounds(10)
    expect(bounds.x).toBe(-10) // padding
    expect(bounds.y).toBe(-10)
    // total width: 100 + 20 gap + 150 = 270, + 2*10 padding = 290
    expect(bounds.width).toBe(290)
    // tallest artboard is 200, + 2*10 padding = 220
    expect(bounds.height).toBe(220)
  })

  it('returns default bounds for no artboards', () => {
    const bounds = computeDocumentBounds()
    expect(bounds.width).toBe(210)
    expect(bounds.height).toBe(297)
  })

  it('finds artboard at point', () => {
    const ab1 = addArtboard(100, 100)
    addArtboard(100, 100)
    expect(artboardAtPoint(50, 50)?.id).toBe(ab1.id)
    expect(artboardAtPoint(130, 50)?.id).toBe(getArtboards()[1].id) // x=120
    expect(artboardAtPoint(500, 500)).toBeNull()
  })

  it('notifies subscribers on changes', () => {
    let count = 0
    const unsub = subscribeArtboards(() => count++)
    addArtboard()
    expect(count).toBe(1)
    addArtboard()
    expect(count).toBe(2)
    unsub()
    addArtboard()
    expect(count).toBe(2) // unsubscribed
  })

  it('assigns unique names to artboards', () => {
    addArtboard()
    addArtboard()
    addArtboard()
    const names = getArtboards().map(a => a.name)
    expect(new Set(names).size).toBe(3)
  })
})
