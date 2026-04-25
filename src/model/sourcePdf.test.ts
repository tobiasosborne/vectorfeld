import { describe, it, expect } from 'vitest'
import {
  SourcePdfStore,
  recordImportedSource,
  setActiveSourcePdfStore,
  getActiveSourcePdfStore,
  type SourcePdfEntry,
} from './sourcePdf'

function entry(filename: string, byte = 0): SourcePdfEntry {
  return { bytes: new Uint8Array([byte]), filename, pageCount: 1 }
}

describe('SourcePdfStore', () => {
  it('starts empty', () => {
    const s = new SourcePdfStore()
    expect(s.getPrimary()).toBeNull()
    expect(s.getBackground('any')).toBeNull()
    expect(s.backgrounds.size).toBe(0)
  })

  it('setPrimary / clearPrimary toggle the primary slot', () => {
    const s = new SourcePdfStore()
    s.setPrimary(entry('a.pdf'))
    expect(s.getPrimary()?.filename).toBe('a.pdf')
    s.clearPrimary()
    expect(s.getPrimary()).toBeNull()
  })

  it('add / remove backgrounds keyed by layer name', () => {
    const s = new SourcePdfStore()
    s.addBackground('Logo', entry('logo.pdf'))
    s.addBackground('Watermark', entry('mark.pdf'))
    expect(s.getBackground('Logo')?.filename).toBe('logo.pdf')
    expect(s.getBackground('Watermark')?.filename).toBe('mark.pdf')
    expect(s.removeBackground('Logo')).toBe(true)
    expect(s.getBackground('Logo')).toBeNull()
    expect(s.removeBackground('Logo')).toBe(false)
  })

  it('clearAll wipes both primary and backgrounds', () => {
    const s = new SourcePdfStore()
    s.setPrimary(entry('a.pdf'))
    s.addBackground('bg', entry('b.pdf'))
    s.clearAll()
    expect(s.getPrimary()).toBeNull()
    expect(s.backgrounds.size).toBe(0)
  })

  it('two stores have independent state', () => {
    const a = new SourcePdfStore()
    const b = new SourcePdfStore()
    a.setPrimary(entry('a.pdf'))
    b.setPrimary(entry('b.pdf'))
    a.addBackground('layer', entry('a-bg.pdf'))
    expect(a.getPrimary()?.filename).toBe('a.pdf')
    expect(b.getPrimary()?.filename).toBe('b.pdf')
    expect(b.getBackground('layer')).toBeNull()
  })

  it('active-pointer setter swaps the global store', () => {
    const original = getActiveSourcePdfStore()
    try {
      const a = new SourcePdfStore()
      const b = new SourcePdfStore()
      setActiveSourcePdfStore(a)
      a.setPrimary(entry('a.pdf'))
      expect(getActiveSourcePdfStore().getPrimary()?.filename).toBe('a.pdf')
      setActiveSourcePdfStore(b)
      expect(getActiveSourcePdfStore().getPrimary()).toBeNull()
    } finally {
      setActiveSourcePdfStore(original)
    }
  })
})

describe('recordImportedSource', () => {
  it('primary kind: stores in primary slot and clears existing state', () => {
    const s = new SourcePdfStore()
    s.addBackground('old-bg', entry('old.pdf'))
    s.setPrimary(entry('old-primary.pdf'))

    recordImportedSource(s, 'primary', null, entry('fresh.pdf', 7))

    expect(s.getPrimary()?.filename).toBe('fresh.pdf')
    expect(s.getPrimary()?.bytes[0]).toBe(7)
    expect(s.backgrounds.size).toBe(0) // cleared
  })

  it('background kind: stores under the given layer name', () => {
    const s = new SourcePdfStore()
    s.setPrimary(entry('keep.pdf'))

    recordImportedSource(s, 'background', 'Yellow BG', entry('yellow.pdf'))

    expect(s.getPrimary()?.filename).toBe('keep.pdf') // not cleared
    expect(s.getBackground('Yellow BG')?.filename).toBe('yellow.pdf')
  })

  it('background kind without layerName throws', () => {
    const s = new SourcePdfStore()
    expect(() => recordImportedSource(s, 'background', null, entry('x.pdf'))).toThrow(/layerName/)
  })
})
