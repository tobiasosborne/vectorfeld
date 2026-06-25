/**
 * Generic, undoable document-replacement command.
 *
 * `Open PDF…` and `Open SVG…` both want the same "swap the whole document
 * for freshly parsed content" semantics: remove every existing layer, set the
 * viewBox, optionally replace `<defs>`, and insert the new layers. Done as a
 * bare DOM mutation (the old `applyParsedSvg`) this destroys in-progress work
 * with no undo path — a P0 data-loss bug (vectorfeld-3yu.1).
 *
 * `replaceDocumentWithParsed` is the pure DOM swap; `ReplaceDocumentCommand`
 * wraps it as a `Command` that snapshots prior state and reverses it on undo.
 * The store concern (clearing/replacing the source-PDF byte store) is an
 * OPTIONAL injected option so the SVG sibling (vectorfeld-3yu.15), which has no
 * source bytes to track, can reuse the same class by simply not passing one.
 */

import type { Command } from './commands'
import type { DocumentModel } from './document'
import { syncIdCounter } from './document'
import { clearSelection } from './selection'
import type { ParsedSvg } from './fileio'
import { tagImportedLayer, PRIMARY_LAYER_ID } from './sourceTagging'
import { snapshotImportedElements } from './sourceSnapshot'
import { analyzeImportedSvg } from './importAnalysis'
import { flattenAndScalePdfLayer } from './pdfImport'
import type { SourcePdfStore, SourcePdfEntry } from './sourcePdf'

/** Points to millimeters conversion factor (mirrors pdfImport.ts). */
const PT_TO_MM = 25.4 / 72

/**
 * Tag a freshly imported primary layer with text-coverage diagnostics.
 * Mirrors `tagLayerWithImportAnalysis` in pdfImport.ts (kept private there).
 */
function tagLayerWithImportAnalysis(layer: Element): void {
  const r = analyzeImportedSvg(layer)
  layer.setAttribute('data-text-chars', String(r.textChars))
  layer.setAttribute('data-path-count', String(r.pathCount))
  if (r.mostlyOutlined) {
    layer.setAttribute('data-mostly-outlined', 'true')
  }
}

/**
 * PDF-specific per-layer post-processing for the primary `Open PDF…` path.
 *
 * MuPDF emits content in PDF points wrapped in one anonymous <g>; the viewBox
 * was already converted to mm. Flatten that wrapper and distribute the pt→mm
 * scale across each resulting top-level element so every child stays
 * individually selectable, then tag the layer with import diagnostics +
 * source-PDF provenance and snapshot its elements for the graft engine.
 *
 * Passed to `replaceDocumentWithParsed` as the `processLayer` hook by the PDF
 * caller. SVG imports pass NO hook — they have no wrapper to flatten, no
 * pt→mm scale, and no source-PDF bytes to tag against. Exported so the PDF
 * call site and tests can reference the exact processing.
 */
export function processImportedPdfLayer(layer: Element): void {
  flattenAndScalePdfLayer(layer, PT_TO_MM)
  tagLayerWithImportAnalysis(layer)
  tagImportedLayer(layer, { page: 0, layerId: PRIMARY_LAYER_ID })
  snapshotImportedElements(layer)
}

/**
 * Replace the live document with parsed content. Pure DOM swap, no command
 * history — `ReplaceDocumentCommand` is the undoable wrapper. Exported for
 * testing and for direct reuse by `replaceDocumentWithParsed` callers that
 * have already arranged their own undo.
 *
 * `processLayer`, if supplied, runs against each imported layer (already
 * `importNode`d into the live document) BEFORE it is inserted. The PDF path
 * passes `processImportedPdfLayer` (pt→mm scale + source tagging); the SVG
 * path passes nothing, importing layers as-is (matching the old
 * `fileio.applyParsedSvg`, which did NO scaling or tagging).
 *
 * Mirrors the old `applyParsedSvg` body exactly, with ONE deliberate
 * difference: `clearSelection()` fires LAST (after the DOM swap), matching the
 * additive background path. Firing it first leaves the LayersPanel refreshing
 * against a half-mutated tree → phantom rows.
 */
export function replaceDocumentWithParsed(
  doc: DocumentModel,
  parsed: ParsedSvg,
  processLayer?: (layer: Element) => void,
): void {
  if (parsed.viewBox) {
    doc.svg.setAttribute('viewBox', parsed.viewBox)
  }

  for (const layer of doc.getLayerElements()) {
    layer.remove()
  }

  if (parsed.defs.length > 0) {
    const docDefs = doc.getDefs()
    while (docDefs.firstChild) docDefs.removeChild(docDefs.firstChild)
    for (const child of parsed.defs) {
      docDefs.appendChild(document.importNode(child, true))
    }
  }

  const firstOverlay = doc.svg.querySelector(
    '[data-role="grid-overlay"], [data-role="user-guides-overlay"], [data-role="guides-overlay"], [data-role="overlay"]',
  )
  for (const layer of parsed.layers) {
    const imported = document.importNode(layer, true) as Element
    processLayer?.(imported)
    if (firstOverlay) {
      doc.svg.insertBefore(imported, firstOverlay)
    } else {
      doc.svg.appendChild(imported)
    }
  }

  syncIdCounter(doc.svg)

  // Fire selection notification LAST so the LayersPanel (which subscribes to
  // selection changes) refreshes against the fully swapped tree.
  clearSelection()
}

/**
 * Optional source-PDF store concern for `ReplaceDocumentCommand`.
 *
 * `execute()` always clears the store first (so a stale primary's ~10MB byte
 * buffer + its source-id routing are torn down). If `sourceEntry` is supplied,
 * it then becomes the new `primary`; when it is absent/null — the SVG case,
 * which has no source bytes — the store is left empty after the clear.
 * `undo()` restores the prior `primary` + `backgrounds` either way.
 */
export interface ReplaceDocumentStoreOptions {
  store: SourcePdfStore
  /** New primary entry; omit/null to clear the store without a new primary
   *  (SVG imports carry no source PDF bytes). */
  sourceEntry?: SourcePdfEntry | null
}

export interface ReplaceDocumentOptions {
  store?: ReplaceDocumentStoreOptions
  /** Per-layer post-processing applied to each imported layer before
   *  insertion. PDF passes `processImportedPdfLayer`; SVG passes nothing. */
  processLayer?: (layer: Element) => void
}

/** A captured layer plus the sibling it sat before, so position is restorable. */
interface SavedLayer {
  element: Element
  nextSibling: ChildNode | null
}

/**
 * Undoable whole-document replacement. Snapshots prior state in `execute()`
 * BEFORE mutating, then performs the swap via `replaceDocumentWithParsed`.
 * `undo()` reverses everything. Reusable for any "replace the document with
 * parsed content" import (PDF, SVG, …) — the store mutation is optional.
 */
export class ReplaceDocumentCommand implements Command {
  readonly description = 'Open PDF'

  private doc: DocumentModel
  private parsed: ParsedSvg
  private opts: ReplaceDocumentOptions

  // Prior-state snapshot, populated on the first execute().
  private savedLayers: SavedLayer[] | null = null
  private savedViewBox: string | null = null
  /** Detached prior <defs> children — only captured when defs are replaced. */
  private savedDefs: Node[] | null = null
  private savedPrimary: SourcePdfEntry | null = null
  private savedBackgrounds: Map<string, SourcePdfEntry> | null = null

  constructor(doc: DocumentModel, parsed: ParsedSvg, opts: ReplaceDocumentOptions = {}) {
    this.doc = doc
    this.parsed = parsed
    this.opts = opts
  }

  execute(): void {
    // Snapshot BEFORE mutating. Capture EVERY layer (primary + background) with
    // its nextSibling so undo can re-attach at the exact prior position.
    this.savedLayers = this.doc.getLayerElements().map((element) => ({
      element,
      nextSibling: element.nextSibling,
    }))
    this.savedViewBox = this.doc.svg.getAttribute('viewBox')

    // Only snapshot defs when the swap will actually replace them. If
    // parsed.defs is empty, replaceDocumentWithParsed leaves defs untouched, so
    // there is nothing to restore.
    if (this.parsed.defs.length > 0) {
      this.savedDefs = Array.from(this.doc.getDefs().childNodes)
    }

    // Snapshot store state before clearAll() discards it.
    if (this.opts.store) {
      const { store } = this.opts.store
      this.savedPrimary = store.primary
      this.savedBackgrounds = new Map(store.backgrounds)
    }

    replaceDocumentWithParsed(this.doc, this.parsed, this.opts.processLayer)

    if (this.opts.store) {
      const { store, sourceEntry } = this.opts.store
      // Always clear: tears down a stale primary's pinned bytes + source-id
      // routing. Only set a new primary when the caller supplied one (PDF);
      // SVG imports have no source bytes, so the store stays empty.
      store.clearAll()
      if (sourceEntry) {
        store.setPrimary(sourceEntry)
      }
    }
  }

  undo(): void {
    // Remove the layers the swap inserted (current g[data-layer-name] set).
    for (const layer of this.doc.getLayerElements()) {
      layer.remove()
    }

    // Restore viewBox.
    if (this.savedViewBox !== null) {
      this.doc.svg.setAttribute('viewBox', this.savedViewBox)
    } else {
      this.doc.svg.removeAttribute('viewBox')
    }

    // Restore defs children, only if we replaced (and thus snapshotted) them.
    if (this.savedDefs !== null) {
      const docDefs = this.doc.getDefs()
      while (docDefs.firstChild) docDefs.removeChild(docDefs.firstChild)
      for (const node of this.savedDefs) {
        docDefs.appendChild(node)
      }
    }

    // Re-attach saved layers (SAME element identity) at their saved positions.
    // Insert in REVERSE document order: each layer's saved nextSibling (a later
    // layer, or the overlay/defs that the swap never touched) is then already
    // attached, so insertBefore lands it correctly. Forward order would fail
    // when a layer's nextSibling is a still-detached later layer.
    if (this.savedLayers) {
      for (let i = this.savedLayers.length - 1; i >= 0; i--) {
        const { element, nextSibling } = this.savedLayers[i]
        if (nextSibling && nextSibling.parentNode === this.doc.svg) {
          this.doc.svg.insertBefore(element, nextSibling)
        } else {
          this.doc.svg.appendChild(element)
        }
      }
    }

    // Restore store state.
    if (this.opts.store) {
      const { store } = this.opts.store
      store.primary = this.savedPrimary
      if (this.savedBackgrounds) {
        store.backgrounds = new Map(this.savedBackgrounds)
      }
    }

    clearSelection()
  }
}
