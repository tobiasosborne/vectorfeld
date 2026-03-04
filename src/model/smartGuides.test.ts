import { describe, it, expect, beforeEach } from 'vitest'
import {
  setSmartGuidesEnabled, getSmartGuidesEnabled,
  clearCachedCandidates,
  snapToNearestPoint,
  type PointCandidate,
} from './smartGuides'

describe('smartGuides enabled toggle', () => {
  beforeEach(() => {
    setSmartGuidesEnabled(true)
  })

  it('defaults to enabled', () => {
    expect(getSmartGuidesEnabled()).toBe(true)
  })

  it('can be disabled and re-enabled', () => {
    setSmartGuidesEnabled(false)
    expect(getSmartGuidesEnabled()).toBe(false)
    setSmartGuidesEnabled(true)
    expect(getSmartGuidesEnabled()).toBe(true)
  })
})

describe('clearCachedCandidates', () => {
  it('does not throw when called with no cached candidates', () => {
    expect(() => clearCachedCandidates()).not.toThrow()
  })
})

describe('snapToNearestPoint', () => {
  const candidates: PointCandidate[] = [
    { x: 100, y: 100 },
    { x: 200, y: 200 },
    { x: 300, y: 50 },
  ]

  it('snaps to nearest candidate within tolerance', () => {
    const result = snapToNearestPoint(103, 98, candidates, 10)
    expect(result.snapped).toBe(true)
    expect(result.x).toBe(100)
    expect(result.y).toBe(100)
  })

  it('returns original point when nothing within tolerance', () => {
    const result = snapToNearestPoint(150, 150, candidates, 5)
    expect(result.snapped).toBe(false)
    expect(result.x).toBe(150)
    expect(result.y).toBe(150)
  })

  it('chooses closer candidate when multiple are within tolerance', () => {
    // Point at (199, 199) is 1.41 from (200,200) and ~140 from (100,100)
    const result = snapToNearestPoint(199, 199, candidates, 5)
    expect(result.snapped).toBe(true)
    expect(result.x).toBe(200)
    expect(result.y).toBe(200)
  })

  it('returns not-snapped for empty candidate list', () => {
    const result = snapToNearestPoint(50, 50, [], 10)
    expect(result.snapped).toBe(false)
    expect(result.x).toBe(50)
    expect(result.y).toBe(50)
  })

  it('snaps exactly at tolerance boundary', () => {
    // Distance from (105, 100) to (100, 100) is exactly 5
    const result = snapToNearestPoint(105, 100, candidates, 5)
    // dist=5 is not < tolerance=5, so should NOT snap
    expect(result.snapped).toBe(false)
  })

  it('snaps when distance is just under tolerance', () => {
    // Distance from (104.9, 100) to (100, 100) is 4.9
    const result = snapToNearestPoint(104.9, 100, candidates, 5)
    expect(result.snapped).toBe(true)
    expect(result.x).toBe(100)
    expect(result.y).toBe(100)
  })

  it('uses euclidean distance, not manhattan', () => {
    // Point at (103, 104) has euclidean dist=5 from (100,100), manhattan=7
    const result = snapToNearestPoint(103, 104, candidates, 5)
    // euclidean = sqrt(9+16) = 5, not < 5, so should not snap
    expect(result.snapped).toBe(false)

    // But at tolerance 5.1 it should snap
    const result2 = snapToNearestPoint(103, 104, candidates, 5.1)
    expect(result2.snapped).toBe(true)
    expect(result2.x).toBe(100)
    expect(result2.y).toBe(100)
  })
})
