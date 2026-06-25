import { describe, it, expect } from 'vitest'
import {
  ReplaceDocumentCommand,
  replaceDocumentWithParsed,
  processImportedPdfLayer,
} from './documentReplace'
import { createDocumentModel } from './document'
import { SourcePdfStore, type SourcePdfEntry } from './sourcePdf'
import type { ParsedSvg } from './fileio'

// A document with: defs (one child), one content layer "Layer 1" holding a
// rect, and an overlay group. Mirrors pdfImport.test.ts's makeDoc().
function makeDoc(): ReturnType<typeof createDocumentModel> {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 210 297')
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs')
  const grad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient')
  grad.setAttribute('id', 'orig-grad')
  defs.appendChild(grad)
  svg.appendChild(defs)
  const layer = document.createElementNS('http://www.w3.org/2000/svg', 'g')
  layer.setAttribute('data-layer-name', 'Layer 1')
  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  rect.setAttribute('id', 'orig-rect')
  layer.appendChild(rect)
  svg.appendChild(layer)
  const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'g')
  overlay.setAttribute('data-role', 'overlay')
  svg.appendChild(overlay)
  return createDocumentModel(svg)
}

// Parsed content with a new viewBox + a single synthetic layer. Mirrors what
// parseSvgString yields for a wrapper-less PDF page. `defsInner`, if given,
// adds a <defs> so the defs-replacement branch runs.
function fakeParsed(children: string, opts: { defsInner?: string } = {}): ParsedSvg {
  const doc = new DOMParser().parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg"><g>${children}</g></svg>`,
    'image/svg+xml',
  )
  const synthetic = doc.createElementNS('http://www.w3.org/2000/svg', 'g')
  synthetic.setAttribute('data-layer-name', 'Layer 1')
  synthetic.appendChild(doc.documentElement.firstElementChild!)

  const defs: Element[] = []
  if (opts.defsInner) {
    const d = new DOMParser().parseFromString(
      `<svg xmlns="http://www.w3.org/2000/svg"><defs>${opts.defsInner}</defs></svg>`,
      'image/svg+xml',
    )
    for (const child of Array.from(d.documentElement.querySelector('defs')!.children)) {
      defs.push(child)
    }
  }
  return { viewBox: '0 0 595 842', defs, layers: [synthetic] }
}

function entry(name: string): SourcePdfEntry {
  return { bytes: new Uint8Array([1, 2, 3]), filename: name, pageCount: 1 }
}

describe('replaceDocumentWithParsed (pure swap)', () => {
  it('removes existing layers, sets viewBox, inserts new layer before overlay', () => {
    const doc = makeDoc()
    const overlay = doc.svg.querySelector('[data-role="overlay"]')!

    replaceDocumentWithParsed(doc, fakeParsed('<path d="M0 0"/>'))

    const layers = doc.getLayerElements()
    expect(layers.length).toBe(1)
    // Original rect is gone (layer replaced, not appended-to).
    expect(doc.svg.querySelector('#orig-rect')).toBeNull()
    expect(doc.svg.getAttribute('viewBox')).toBe('0 0 595 842')
    // New layer sits before the overlay (correct z-order).
    expect(layers[0].nextElementSibling).toBe(overlay)
  })

  it('leaves <defs> untouched when parsed.defs is empty', () => {
    const doc = makeDoc()
    replaceDocumentWithParsed(doc, fakeParsed('<path d="M0 0"/>'))
    expect(doc.getDefs().querySelector('#orig-grad')).toBeTruthy()
  })

  it('replaces <defs> children when parsed.defs is non-empty', () => {
    const doc = makeDoc()
    replaceDocumentWithParsed(
      doc,
      fakeParsed('<path d="M0 0"/>', { defsInner: '<clipPath id="new-clip"/>' }),
    )
    expect(doc.getDefs().querySelector('#orig-grad')).toBeNull()
    expect(doc.getDefs().querySelector('#new-clip')).toBeTruthy()
  })
})

describe('ReplaceDocumentCommand', () => {
  it('execute() replaces layers, viewBox, and defs', () => {
    const doc = makeDoc()
    const cmd = new ReplaceDocumentCommand(
      doc,
      fakeParsed('<path d="M0 0"/>', { defsInner: '<clipPath id="new-clip"/>' }),
    )
    cmd.execute()

    expect(doc.svg.querySelector('#orig-rect')).toBeNull()
    expect(doc.svg.getAttribute('viewBox')).toBe('0 0 595 842')
    expect(doc.getDefs().querySelector('#orig-grad')).toBeNull()
    expect(doc.getDefs().querySelector('#new-clip')).toBeTruthy()
  })

  it('undo() restores prior layers with SAME element identity', () => {
    const doc = makeDoc()
    const originalLayer = doc.getLayerElements()[0]
    const originalRect = doc.svg.querySelector('#orig-rect')!

    const cmd = new ReplaceDocumentCommand(doc, fakeParsed('<path d="M0 0"/>'))
    cmd.execute()
    cmd.undo()

    const restored = doc.getLayerElements()
    expect(restored.length).toBe(1)
    // SAME object identity — not a clone.
    expect(restored[0]).toBe(originalLayer)
    expect(restored[0].querySelector('#orig-rect')).toBe(originalRect)
  })

  it('undo() restores prior viewBox and prior defs children', () => {
    const doc = makeDoc()
    const originalGrad = doc.getDefs().querySelector('#orig-grad')!

    const cmd = new ReplaceDocumentCommand(
      doc,
      fakeParsed('<path d="M0 0"/>', { defsInner: '<clipPath id="new-clip"/>' }),
    )
    cmd.execute()
    cmd.undo()

    expect(doc.svg.getAttribute('viewBox')).toBe('0 0 210 297')
    expect(doc.getDefs().querySelector('#new-clip')).toBeNull()
    // SAME defs child identity restored.
    expect(doc.getDefs().querySelector('#orig-grad')).toBe(originalGrad)
  })

  it('undo() leaves defs untouched when defs were not replaced', () => {
    const doc = makeDoc()
    const originalGrad = doc.getDefs().querySelector('#orig-grad')!

    const cmd = new ReplaceDocumentCommand(doc, fakeParsed('<path d="M0 0"/>'))
    cmd.execute()
    // defs never replaced (parsed.defs empty) → still present after execute…
    expect(doc.getDefs().querySelector('#orig-grad')).toBe(originalGrad)
    cmd.undo()
    // …and untouched after undo.
    expect(doc.getDefs().querySelector('#orig-grad')).toBe(originalGrad)
  })

  it('restores layer position (nextSibling) exactly', () => {
    const doc = makeDoc()
    const overlay = doc.svg.querySelector('[data-role="overlay"]')!
    const originalLayer = doc.getLayerElements()[0]

    const cmd = new ReplaceDocumentCommand(doc, fakeParsed('<path d="M0 0"/>'))
    cmd.execute()
    cmd.undo()

    expect(originalLayer.nextElementSibling).toBe(overlay)
  })

  it('restores MULTIPLE prior layers in order (primary + background)', () => {
    const doc = makeDoc()
    // Add a second (background-style) layer above Layer 1.
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    bg.setAttribute('data-layer-name', 'Background')
    doc.svg.insertBefore(bg, doc.svg.querySelector('[data-role="overlay"]'))

    const before = doc.getLayerElements().map((l) => l.getAttribute('data-layer-name'))
    expect(before).toEqual(['Layer 1', 'Background'])

    const cmd = new ReplaceDocumentCommand(doc, fakeParsed('<path d="M0 0"/>'))
    cmd.execute()
    cmd.undo()

    const after = doc.getLayerElements().map((l) => l.getAttribute('data-layer-name'))
    expect(after).toEqual(['Layer 1', 'Background'])
  })

  it('redo (execute again) re-applies the replacement', () => {
    const doc = makeDoc()
    const cmd = new ReplaceDocumentCommand(doc, fakeParsed('<path d="M0 0"/>'))
    cmd.execute()
    cmd.undo()
    cmd.execute() // redo

    expect(doc.svg.querySelector('#orig-rect')).toBeNull()
    expect(doc.svg.getAttribute('viewBox')).toBe('0 0 595 842')
    expect(doc.getLayerElements().length).toBe(1)
  })

  describe('store concern (injected)', () => {
    it('execute() sets store.primary to the new entry and clears backgrounds', () => {
      const doc = makeDoc()
      const store = new SourcePdfStore()
      const oldEntry = entry('old.pdf')
      store.setPrimary(oldEntry)
      store.addBackground('Some BG', entry('bg.pdf'))

      const newEntry = entry('new.pdf')
      const cmd = new ReplaceDocumentCommand(doc, fakeParsed('<path d="M0 0"/>'), {
        store: { store, sourceEntry: newEntry },
      })
      cmd.execute()

      expect(store.primary).toBe(newEntry)
      expect(store.backgrounds.size).toBe(0)
    })

    it('undo() restores prior store.primary and backgrounds', () => {
      const doc = makeDoc()
      const store = new SourcePdfStore()
      const oldEntry = entry('old.pdf')
      const bgEntry = entry('bg.pdf')
      store.setPrimary(oldEntry)
      store.addBackground('Some BG', bgEntry)

      const newEntry = entry('new.pdf')
      const cmd = new ReplaceDocumentCommand(doc, fakeParsed('<path d="M0 0"/>'), {
        store: { store, sourceEntry: newEntry },
      })
      cmd.execute()
      cmd.undo()

      expect(store.primary).toBe(oldEntry)
      expect(store.backgrounds.size).toBe(1)
      expect(store.backgrounds.get('Some BG')).toBe(bgEntry)
    })

    it('round-trips: execute→primary=new, undo→primary=old, redo→primary=new', () => {
      const doc = makeDoc()
      const store = new SourcePdfStore()
      const oldEntry = entry('old.pdf')
      store.setPrimary(oldEntry)
      const newEntry = entry('new.pdf')
      const cmd = new ReplaceDocumentCommand(doc, fakeParsed('<path d="M0 0"/>'), {
        store: { store, sourceEntry: newEntry },
      })

      cmd.execute()
      expect(store.primary).toBe(newEntry)
      cmd.undo()
      expect(store.primary).toBe(oldEntry)
      cmd.execute() // redo
      expect(store.primary).toBe(newEntry)
    })

    it('no store option → does not require or touch any store', () => {
      const doc = makeDoc()
      // Constructing/executing without a store option must work (SVG reuse case).
      const cmd = new ReplaceDocumentCommand(doc, fakeParsed('<path d="M0 0"/>'))
      expect(() => {
        cmd.execute()
        cmd.undo()
      }).not.toThrow()
    })
  })

  describe('processLayer hook (SVG vs PDF per-layer processing)', () => {
    it('SVG path (no processLayer) imports layers as-is: no pt→mm scale, no source tags', () => {
      const doc = makeDoc()
      // A wrapper-less layer with a single path that has no transform.
      replaceDocumentWithParsed(doc, fakeParsed('<path d="M0 0"/>'))
      const layer = doc.getLayerElements()[0]
      const path = layer.querySelector('path')!
      // No PDF processing ran → no scale prefix, no diagnostics/provenance tags.
      expect(path.getAttribute('transform')).toBeNull()
      expect(layer.getAttribute('data-text-chars')).toBeNull()
      expect(layer.getAttribute('data-source-pdf-id')).toBeNull()
    })

    it('PDF path (processImportedPdfLayer) applies pt→mm scale + source tags', () => {
      const doc = makeDoc()
      replaceDocumentWithParsed(doc, fakeParsed('<path d="M0 0"/>'), processImportedPdfLayer)
      const layer = doc.getLayerElements()[0]
      const path = layer.querySelector('path')!
      // flattenAndScalePdfLayer prepends scale(PT_TO_MM ≈ 0.3527…).
      expect(path.getAttribute('transform')).toMatch(/^scale\(0\.3527/)
      // tagLayerWithImportAnalysis sets diagnostics; tagImportedLayer sets provenance.
      expect(layer.getAttribute('data-text-chars')).not.toBeNull()
      expect(layer.getAttribute('data-source-pdf-id')).not.toBeNull()
    })

    it('ReplaceDocumentCommand threads opts.processLayer through execute()', () => {
      const doc = makeDoc()
      const cmd = new ReplaceDocumentCommand(doc, fakeParsed('<path d="M0 0"/>'), {
        processLayer: processImportedPdfLayer,
      })
      cmd.execute()
      const path = doc.getLayerElements()[0].querySelector('path')!
      expect(path.getAttribute('transform')).toMatch(/^scale\(0\.3527/)
    })

    // vectorfeld-3yu.21: the mostly-outlined badge never fired on the primary
    // Open PDF… path because the old applyParsedSvg ran no import analysis. The
    // primary path now flows through processImportedPdfLayer, so a heavily
    // outlined import (>=20 paths, no text) must surface data-mostly-outlined.
    it('PDF path surfaces data-mostly-outlined for a heavily-outlined import (3yu.21)', () => {
      const doc = makeDoc()
      const manyPaths = Array.from({ length: 24 }, (_, i) => `<path d="M${i} 0 L${i} 1"/>`).join('')
      replaceDocumentWithParsed(doc, fakeParsed(manyPaths), processImportedPdfLayer)
      expect(doc.getLayerElements()[0].getAttribute('data-mostly-outlined')).toBe('true')
    })

    it('PDF path leaves data-mostly-outlined unset for a text-rich import (3yu.21)', () => {
      const doc = makeDoc()
      replaceDocumentWithParsed(doc, fakeParsed('<text>plenty of real editable text content here</text>'), processImportedPdfLayer)
      expect(doc.getLayerElements()[0].getAttribute('data-mostly-outlined')).toBeNull()
    })
  })

  describe('store concern WITHOUT a sourceEntry (SVG: clear-only)', () => {
    it('execute() clears primary + backgrounds and sets NO new primary', () => {
      const doc = makeDoc()
      const store = new SourcePdfStore()
      store.setPrimary(entry('stale.pdf'))
      store.addBackground('Some BG', entry('bg.pdf'))

      const cmd = new ReplaceDocumentCommand(doc, fakeParsed('<path d="M0 0"/>'), {
        store: { store }, // no sourceEntry → SVG clear-only
      })
      cmd.execute()

      expect(store.primary).toBeNull()
      expect(store.backgrounds.size).toBe(0)
    })

    it('undo() restores the prior primary + backgrounds after a clear-only swap', () => {
      const doc = makeDoc()
      const store = new SourcePdfStore()
      const oldEntry = entry('stale.pdf')
      const bgEntry = entry('bg.pdf')
      store.setPrimary(oldEntry)
      store.addBackground('Some BG', bgEntry)

      const cmd = new ReplaceDocumentCommand(doc, fakeParsed('<path d="M0 0"/>'), {
        store: { store },
      })
      cmd.execute()
      cmd.undo()

      expect(store.primary).toBe(oldEntry)
      expect(store.backgrounds.get('Some BG')).toBe(bgEntry)
    })
  })

  it('description is "Open PDF"', () => {
    const doc = makeDoc()
    const cmd = new ReplaceDocumentCommand(doc, fakeParsed('<path d="M0 0"/>'))
    expect(cmd.description).toBe('Open PDF')
  })
})
