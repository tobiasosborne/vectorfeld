import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DocumentState, captureActiveDocumentState, setActiveDocument } from './documentState'
import { getSelection, setSelection, clearSelection, subscribeSelection } from './selection'
import { getGridSettings, setGridSettings } from './grid'
import { getGuides, addGuide, clearAllGuides } from './guides'
import { getDefaultStyle, setDefaultStyle } from './defaultStyle'
import { isWireframe, setWireframe } from './wireframe'

/** Remember whatever DocumentState was active at test-file load so we can
 *  restore it in afterEach — otherwise state from these tests would bleed
 *  into the rest of the suite. */
let original: DocumentState

beforeEach(() => {
  original = captureActiveDocumentState()
})

afterEach(() => {
  setActiveDocument(original)
})

describe('DocumentState', () => {
  it('each DocumentState has its own isolated state bundles', () => {
    const a = new DocumentState()
    const b = new DocumentState()
    expect(a.selection).not.toBe(b.selection)
    expect(a.grid).not.toBe(b.grid)
    expect(a.guides).not.toBe(b.guides)
    expect(a.defaultStyle).not.toBe(b.defaultStyle)
    expect(a.wireframe).not.toBe(b.wireframe)
    expect(a.artboard).not.toBe(b.artboard)
    expect(a.smartGuides).not.toBe(b.smartGuides)
    expect(a.activeLayer).not.toBe(b.activeLayer)
  })

  it('setActiveDocument swaps selection scope', () => {
    const a = new DocumentState()
    const b = new DocumentState()
    const el1 = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    const el2 = document.createElementNS('http://www.w3.org/2000/svg', 'rect')

    setActiveDocument(a)
    setSelection([el1])
    expect(getSelection()).toEqual([el1])

    setActiveDocument(b)
    expect(getSelection()).toEqual([])
    setSelection([el2])
    expect(getSelection()).toEqual([el2])

    setActiveDocument(a)
    expect(getSelection()).toEqual([el1])
  })

  it('setActiveDocument swaps grid settings', () => {
    const a = new DocumentState()
    const b = new DocumentState()

    setActiveDocument(a)
    setGridSettings({ visible: true, majorSpacing: 20 })
    expect(getGridSettings().visible).toBe(true)
    expect(getGridSettings().majorSpacing).toBe(20)

    setActiveDocument(b)
    expect(getGridSettings().visible).toBe(false)
    expect(getGridSettings().majorSpacing).toBe(10)
  })

  it('setActiveDocument swaps guides list', () => {
    const a = new DocumentState()
    const b = new DocumentState()

    setActiveDocument(a)
    addGuide('h', 50)
    addGuide('v', 100)
    expect(getGuides()).toHaveLength(2)

    setActiveDocument(b)
    expect(getGuides()).toHaveLength(0)

    addGuide('h', 25)
    expect(getGuides()).toHaveLength(1)

    setActiveDocument(a)
    expect(getGuides()).toHaveLength(2)
  })

  it('setActiveDocument swaps defaultStyle', () => {
    const a = new DocumentState()
    const b = new DocumentState()

    setActiveDocument(a)
    setDefaultStyle({ stroke: '#ff0000', fill: '#00ff00' })
    expect(getDefaultStyle().stroke).toBe('#ff0000')

    setActiveDocument(b)
    expect(getDefaultStyle().stroke).toBe('#000000')
    expect(getDefaultStyle().fill).toBe('none')

    setActiveDocument(a)
    expect(getDefaultStyle().stroke).toBe('#ff0000')
  })

  it('setActiveDocument swaps wireframe flag', () => {
    const a = new DocumentState()
    const b = new DocumentState()

    setActiveDocument(a)
    setWireframe(true)
    expect(isWireframe()).toBe(true)

    setActiveDocument(b)
    expect(isWireframe()).toBe(false)

    setActiveDocument(a)
    expect(isWireframe()).toBe(true)
  })

  it('subscribers attached to one document are not fired when another is active', () => {
    const a = new DocumentState()
    const b = new DocumentState()

    setActiveDocument(a)
    let aCount = 0
    const unsub = subscribeSelection(() => aCount++)

    setActiveDocument(b)
    // Mutating B must NOT wake A's listener
    setSelection([document.createElementNS('http://www.w3.org/2000/svg', 'rect')])
    expect(aCount).toBe(0)

    setActiveDocument(a)
    setSelection([])
    expect(aCount).toBe(1)

    unsub()
  })

  it('captureActiveDocumentState returns a snapshot referencing current singletons', () => {
    const captured = captureActiveDocumentState()
    expect(captured.selection).toBeDefined()
    expect(captured.grid).toBeDefined()
    // The captured instance should match whatever the singletons are pointing at
    setActiveDocument(captured)
    // Round-trip: mutating through legacy API mutates the captured bundle
    setSelection([])
    clearAllGuides()
    expect(captured.selection.selected).toEqual([])
    expect(captured.guides.getAll()).toEqual([])
  })

  it('clearSelection on active doc does not affect inactive doc', () => {
    const a = new DocumentState()
    const b = new DocumentState()
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'rect')

    setActiveDocument(a)
    setSelection([el])

    setActiveDocument(b)
    clearSelection()

    setActiveDocument(a)
    expect(getSelection()).toEqual([el])
  })
})
