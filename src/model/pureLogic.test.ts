import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getDefaultStyle,
  setDefaultStyle,
  subscribeDefaultStyle,
} from './defaultStyle'
import {
  getGridSettings,
  setGridSettings,
  toggleGridVisible,
  toggleGridSnap,
  snapToGrid,
} from './grid'
import {
  getMarkerUrl,
  parseMarkerType,
  ensureMarkerDef,
} from './markers'
import { transformedAABB } from './geometry'

// ---------------------------------------------------------------------------
// defaultStyle
// ---------------------------------------------------------------------------

describe('defaultStyle', () => {
  beforeEach(() => {
    // Reset to initial state before each test
    setDefaultStyle({ stroke: '#000000', fill: 'none', strokeWidth: '1' })
  })

  it('getDefaultStyle returns initial values', () => {
    const style = getDefaultStyle()
    expect(style.stroke).toBe('#000000')
    expect(style.fill).toBe('none')
    expect(style.strokeWidth).toBe('1')
  })

  it('setDefaultStyle merges partial updates without losing other fields', () => {
    setDefaultStyle({ fill: '#ff0000' })
    const style = getDefaultStyle()
    expect(style.fill).toBe('#ff0000')
    expect(style.stroke).toBe('#000000') // unchanged
    expect(style.strokeWidth).toBe('1') // unchanged
  })

  it('getDefaultStyle returns a copy (mutating does not affect internal state)', () => {
    const copy = getDefaultStyle()
    copy.stroke = '#ffffff'
    copy.fill = 'red'
    copy.strokeWidth = '99'

    const fresh = getDefaultStyle()
    expect(fresh.stroke).toBe('#000000')
    expect(fresh.fill).toBe('none')
    expect(fresh.strokeWidth).toBe('1')
  })

  it('subscribeDefaultStyle fires on changes', () => {
    const cb = vi.fn()
    subscribeDefaultStyle(cb)

    setDefaultStyle({ stroke: '#123456' })
    expect(cb).toHaveBeenCalledTimes(1)

    setDefaultStyle({ fill: 'blue' })
    expect(cb).toHaveBeenCalledTimes(2)
  })

  it('unsubscribe prevents further notifications', () => {
    const cb = vi.fn()
    const unsub = subscribeDefaultStyle(cb)

    setDefaultStyle({ stroke: '#aaa' })
    expect(cb).toHaveBeenCalledTimes(1)

    unsub()

    setDefaultStyle({ stroke: '#bbb' })
    expect(cb).toHaveBeenCalledTimes(1) // no additional call
  })
})

// ---------------------------------------------------------------------------
// grid
// ---------------------------------------------------------------------------

describe('grid', () => {
  beforeEach(() => {
    // Reset grid settings to defaults before each test
    setGridSettings({
      visible: false,
      snapEnabled: false,
      majorSpacing: 10,
      minorSpacing: 5,
    })
  })

  describe('snapToGrid', () => {
    it('returns original point when snapEnabled is false', () => {
      const result = snapToGrid(7, 12)
      expect(result).toEqual({ x: 7, y: 12 })
    })

    it('snaps correctly to nearest grid intersection', () => {
      setGridSettings({ snapEnabled: true })
      // minorSpacing is 5; 7 rounds to 5, 12 rounds to 10
      const result = snapToGrid(7, 12)
      expect(result).toEqual({ x: 5, y: 10 })
    })

    it('snaps midpoint values (Math.round rounds 0.5 up)', () => {
      setGridSettings({ snapEnabled: true })
      // 2.5 / 5 = 0.5 → rounds to 1 → 5
      // 7.5 / 5 = 1.5 → rounds to 2 → 10
      const result = snapToGrid(2.5, 7.5)
      expect(result).toEqual({ x: 5, y: 10 })
    })

    it('snaps negative coordinates correctly', () => {
      setGridSettings({ snapEnabled: true })
      // -7 / 5 = -1.4 → rounds to -1 → -5
      // -13 / 5 = -2.6 → rounds to -3 → -15
      const result = snapToGrid(-7, -13)
      expect(result).toEqual({ x: -5, y: -15 })
    })

    it('snaps exact grid points to themselves', () => {
      setGridSettings({ snapEnabled: true })
      const result = snapToGrid(10, 15)
      expect(result).toEqual({ x: 10, y: 15 })
    })
  })

  describe('toggleGridVisible', () => {
    it('toggles visible from false to true and back', () => {
      expect(getGridSettings().visible).toBe(false)

      toggleGridVisible()
      expect(getGridSettings().visible).toBe(true)

      toggleGridVisible()
      expect(getGridSettings().visible).toBe(false)
    })
  })

  describe('toggleGridSnap', () => {
    it('toggles snapEnabled from false to true and back', () => {
      expect(getGridSettings().snapEnabled).toBe(false)

      toggleGridSnap()
      expect(getGridSettings().snapEnabled).toBe(true)

      toggleGridSnap()
      expect(getGridSettings().snapEnabled).toBe(false)
    })
  })

  describe('setGridSettings', () => {
    it('partial update preserves other settings', () => {
      setGridSettings({ majorSpacing: 20 })
      const s = getGridSettings()
      expect(s.majorSpacing).toBe(20)
      expect(s.minorSpacing).toBe(5) // unchanged
      expect(s.visible).toBe(false) // unchanged
      expect(s.snapEnabled).toBe(false) // unchanged
    })

    it('returns a copy (mutating does not affect internal state)', () => {
      const copy = getGridSettings()
      copy.visible = true
      copy.minorSpacing = 999

      const fresh = getGridSettings()
      expect(fresh.visible).toBe(false)
      expect(fresh.minorSpacing).toBe(5)
    })
  })
})

// ---------------------------------------------------------------------------
// markers
// ---------------------------------------------------------------------------

describe('markers', () => {
  describe('getMarkerUrl', () => {
    it('returns empty string for "none"', () => {
      expect(getMarkerUrl('none')).toBe('')
    })

    it('returns correct url for "triangle"', () => {
      expect(getMarkerUrl('triangle')).toBe('url(#vf-marker-triangle)')
    })

    it('returns correct url for "open"', () => {
      expect(getMarkerUrl('open')).toBe('url(#vf-marker-open)')
    })

    it('returns correct url for "reverse"', () => {
      expect(getMarkerUrl('reverse')).toBe('url(#vf-marker-reverse)')
    })

    it('returns correct url for "circle"', () => {
      expect(getMarkerUrl('circle')).toBe('url(#vf-marker-circle)')
    })
  })

  describe('parseMarkerType', () => {
    it('parses "url(#vf-marker-triangle)" to "triangle"', () => {
      expect(parseMarkerType('url(#vf-marker-triangle)')).toBe('triangle')
    })

    it('parses "url(#vf-marker-open)" to "open"', () => {
      expect(parseMarkerType('url(#vf-marker-open)')).toBe('open')
    })

    it('parses "url(#vf-marker-reverse)" to "reverse"', () => {
      expect(parseMarkerType('url(#vf-marker-reverse)')).toBe('reverse')
    })

    it('parses "url(#vf-marker-circle)" to "circle"', () => {
      expect(parseMarkerType('url(#vf-marker-circle)')).toBe('circle')
    })

    it('returns "none" for null input', () => {
      expect(parseMarkerType(null)).toBe('none')
    })

    it('returns "none" for empty string', () => {
      expect(parseMarkerType('')).toBe('none')
    })

    it('returns "none" for unknown marker type', () => {
      expect(parseMarkerType('url(#vf-marker-unknown)')).toBe('none')
    })

    it('returns "none" for malformed url', () => {
      expect(parseMarkerType('not-a-url')).toBe('none')
    })
  })

  describe('ensureMarkerDef', () => {
    let defs: SVGDefsElement

    beforeEach(() => {
      document.body.innerHTML = ''
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs')
      svg.appendChild(defs)
      document.body.appendChild(svg)
    })

    it('creates a marker element in defs', () => {
      ensureMarkerDef(defs, 'triangle')
      const marker = defs.querySelector('#vf-marker-triangle')
      expect(marker).not.toBeNull()
      expect(marker!.tagName).toBe('marker')
    })

    it('is idempotent (second call does not create duplicate)', () => {
      ensureMarkerDef(defs, 'triangle')
      ensureMarkerDef(defs, 'triangle')
      const markers = defs.querySelectorAll('#vf-marker-triangle')
      expect(markers.length).toBe(1)
    })

    it('does nothing for "none"', () => {
      ensureMarkerDef(defs, 'none')
      expect(defs.children.length).toBe(0)
    })

    it('creates distinct markers for different types', () => {
      ensureMarkerDef(defs, 'triangle')
      ensureMarkerDef(defs, 'open')
      ensureMarkerDef(defs, 'circle')
      expect(defs.querySelector('#vf-marker-triangle')).not.toBeNull()
      expect(defs.querySelector('#vf-marker-open')).not.toBeNull()
      expect(defs.querySelector('#vf-marker-circle')).not.toBeNull()
      expect(defs.children.length).toBe(3)
    })

    it('triangle marker contains a path child', () => {
      ensureMarkerDef(defs, 'triangle')
      const marker = defs.querySelector('#vf-marker-triangle')!
      const path = marker.querySelector('path')
      expect(path).not.toBeNull()
      expect(path!.getAttribute('fill')).toBe('context-stroke')
    })

    it('open marker path has stroke but no fill', () => {
      ensureMarkerDef(defs, 'open')
      const marker = defs.querySelector('#vf-marker-open')!
      const path = marker.querySelector('path')
      expect(path).not.toBeNull()
      expect(path!.getAttribute('fill')).toBe('none')
      expect(path!.getAttribute('stroke')).toBe('context-stroke')
    })

    it('circle marker contains a circle child', () => {
      ensureMarkerDef(defs, 'circle')
      const marker = defs.querySelector('#vf-marker-circle')!
      const circle = marker.querySelector('circle')
      expect(circle).not.toBeNull()
      expect(circle!.getAttribute('fill')).toBe('context-stroke')
    })
  })
})

// ---------------------------------------------------------------------------
// geometry — transformedAABB
// ---------------------------------------------------------------------------

describe('geometry — transformedAABB', () => {
  const bbox = { x: 0, y: 0, width: 100, height: 50 }

  it('returns bbox unchanged when transform is null', () => {
    const result = transformedAABB(bbox, null)
    expect(result).toEqual(bbox)
  })

  it('returns bbox unchanged for empty string transform', () => {
    const result = transformedAABB(bbox, '')
    expect(result).toEqual(bbox)
  })

  it('returns bbox unchanged for non-rotate transforms', () => {
    const result = transformedAABB(bbox, 'translate(10, 20)')
    expect(result).toEqual(bbox)
  })

  it('correctly computes AABB for 90-degree rotation around origin', () => {
    // bbox corners: (0,0), (100,0), (100,50), (0,50)
    // After 90° rotation around (0,0):
    // (0,0) → (0,0)
    // (100,0) → (0,100)
    // (100,50) → (-50,100)
    // (0,50) → (-50,0)
    // AABB: x=-50, y=0, width=50, height=100
    const result = transformedAABB(bbox, 'rotate(90)')
    expect(result.x).toBeCloseTo(-50)
    expect(result.y).toBeCloseTo(0)
    expect(result.width).toBeCloseTo(50)
    expect(result.height).toBeCloseTo(100)
  })

  it('correctly computes AABB for 90-degree rotation with center', () => {
    // bbox: (0,0,100,50), rotate around center (50,25)
    // Corners relative to center: (-50,-25), (50,-25), (50,25), (-50,25)
    // After 90° rotation:
    // (-50,-25) → (25 + 50, -50 + 25) = (75, -25)  ... let me compute properly
    // rx=-50, ry=-25 → tx = 50 + (-50*0 - (-25)*1) = 50 + 25 = 75
    //                    ty = 25 + (-50*1 + (-25)*0) = 25 - 50 = -25
    // rx=50, ry=-25 → tx = 50 + (50*0 - (-25)*1) = 50 + 25 = 75
    //                   ty = 25 + (50*1 + (-25)*0) = 25 + 50 = 75
    // rx=50, ry=25 → tx = 50 + (50*0 - 25*1) = 50 - 25 = 25
    //                  ty = 25 + (50*1 + 25*0) = 25 + 50 = 75
    // rx=-50, ry=25 → tx = 50 + (-50*0 - 25*1) = 50 - 25 = 25
    //                   ty = 25 + (-50*1 + 25*0) = 25 - 50 = -25
    // AABB: x=25, y=-25, width=50, height=100
    const result = transformedAABB(bbox, 'rotate(90, 50, 25)')
    expect(result.x).toBeCloseTo(25)
    expect(result.y).toBeCloseTo(-25)
    expect(result.width).toBeCloseTo(50)
    expect(result.height).toBeCloseTo(100)
  })

  it('correctly computes AABB for 45-degree rotation around origin', () => {
    // bbox corners: (0,0), (100,0), (100,50), (0,50)
    // cos(45°) ≈ sin(45°) ≈ 0.7071
    // (0,0) → (0, 0)
    // (100,0) → (70.71, 70.71)
    // (100,50) → (70.71 - 35.36, 70.71 + 35.36) = (35.36, 106.07)
    // (0,50) → (-35.36, 35.36)
    const result = transformedAABB(bbox, 'rotate(45)')
    const c = Math.cos(Math.PI / 4)
    const s = Math.sin(Math.PI / 4)
    // Compute expected corners
    const corners = [
      { x: 0, y: 0 },
      { x: 100 * c, y: 100 * s },
      { x: 100 * c - 50 * s, y: 100 * s + 50 * c },
      { x: -50 * s, y: 50 * c },
    ]
    const minX = Math.min(...corners.map((p) => p.x))
    const minY = Math.min(...corners.map((p) => p.y))
    const maxX = Math.max(...corners.map((p) => p.x))
    const maxY = Math.max(...corners.map((p) => p.y))
    expect(result.x).toBeCloseTo(minX)
    expect(result.y).toBeCloseTo(minY)
    expect(result.width).toBeCloseTo(maxX - minX)
    expect(result.height).toBeCloseTo(maxY - minY)
  })

  it('handles rotate with no center (defaults to 0,0)', () => {
    // rotate(180) around (0,0)
    // (0,0) → (0, 0)
    // (100,0) → (-100, 0) [cos180=-1, sin180=0]
    // (100,50) → (-100, -50)
    // (0,50) → (0, -50)
    // AABB: x=-100, y=-50, width=100, height=50
    const result = transformedAABB(bbox, 'rotate(180)')
    expect(result.x).toBeCloseTo(-100)
    expect(result.y).toBeCloseTo(-50)
    expect(result.width).toBeCloseTo(100)
    expect(result.height).toBeCloseTo(50)
  })

  it('handles 0-degree rotation (no change)', () => {
    const result = transformedAABB(bbox, 'rotate(0)')
    expect(result.x).toBeCloseTo(0)
    expect(result.y).toBeCloseTo(0)
    expect(result.width).toBeCloseTo(100)
    expect(result.height).toBeCloseTo(50)
  })

  it('handles negative rotation angle', () => {
    // rotate(-90) around (0,0)
    // cos(-90°)=0, sin(-90°)=-1
    // (0,0) → (0, 0)
    // (100,0) → (0, -100)
    // (100,50) → (50, -100)
    // (0,50) → (50, 0)
    // AABB: x=0, y=-100, width=50, height=100
    const result = transformedAABB(bbox, 'rotate(-90)')
    expect(result.x).toBeCloseTo(0)
    expect(result.y).toBeCloseTo(-100)
    expect(result.width).toBeCloseTo(50)
    expect(result.height).toBeCloseTo(100)
  })

  it('handles float rotation angle with center', () => {
    const result = transformedAABB(
      { x: 10, y: 20, width: 60, height: 40 },
      'rotate(30.5, 40, 40)',
    )
    // Just verify it returns a valid bbox without crashing
    expect(result.width).toBeGreaterThan(0)
    expect(result.height).toBeGreaterThan(0)
  })
})
