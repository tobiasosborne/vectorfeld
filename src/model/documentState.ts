/**
 * DocumentState — aggregates all per-document mutable state bundles.
 *
 * Previously each singleton module (selection.ts, grid.ts, guides.ts, …)
 * held a module-level instance that was implicitly "the document". This made
 * cross-document workflow impossible: opening a second PDF would silently
 * share selection, grid settings, guide lists, smart-guide cache, etc. with
 * the first.
 *
 * Now each of those modules exports a `XxxState` class; this file assembles
 * them into a `DocumentState` and wires `setActiveDocument(doc)` so the
 * module-level `active` pointers all swap atomically. Single-document
 * consumers continue to use the existing function exports unchanged
 * (`getSelection()`, `setDefaultStyle()`, …) — they delegate to whichever
 * DocumentState is currently active.
 *
 * Phase 1 (this file): the infrastructure. Only one DocumentState is ever
 * active at a time; swap happens implicitly when EditorProvider mounts.
 *
 * Phase 2 (future): multi-document UI + cross-document clipboard. To open a
 * second doc, create a second DocumentState, and call setActiveDocument()
 * when focus shifts.
 */

import { SelectionState, setActiveSelectionState, getActiveSelectionState } from './selection'
import { ActiveLayerState, setActiveActiveLayerState, getActiveActiveLayerState } from './activeLayer'
import { ArtboardState, setActiveArtboardState, getActiveArtboardState } from './artboard'
import { GridState, setActiveGridState, getActiveGridState } from './grid'
import { GuidesState, setActiveGuidesState, getActiveGuidesState } from './guides'
import { DefaultStyleState, setActiveDefaultStyleState, getActiveDefaultStyleState } from './defaultStyle'
import { SmartGuidesState, setActiveSmartGuidesState, getActiveSmartGuidesState } from './smartGuides'
import { WireframeState, setActiveWireframeState, getActiveWireframeState } from './wireframe'
import { SourcePdfStore, setActiveSourcePdfStore, getActiveSourcePdfStore } from './sourcePdf'

export class DocumentState {
  selection: SelectionState
  activeLayer: ActiveLayerState
  artboard: ArtboardState
  grid: GridState
  guides: GuidesState
  defaultStyle: DefaultStyleState
  smartGuides: SmartGuidesState
  wireframe: WireframeState
  sourcePdf: SourcePdfStore

  constructor() {
    this.selection = new SelectionState()
    this.activeLayer = new ActiveLayerState()
    this.artboard = new ArtboardState()
    this.grid = new GridState()
    this.guides = new GuidesState()
    this.defaultStyle = new DefaultStyleState()
    this.smartGuides = new SmartGuidesState()
    this.wireframe = new WireframeState()
    this.sourcePdf = new SourcePdfStore()
  }
}

/** Capture the currently-active state bundles into a fresh DocumentState.
 *  Used on EditorProvider mount so the pre-existing singletons (initialised
 *  at module-load time) aren't orphaned. */
export function captureActiveDocumentState(): DocumentState {
  const d = new DocumentState()
  d.selection = getActiveSelectionState()
  d.activeLayer = getActiveActiveLayerState()
  d.artboard = getActiveArtboardState()
  d.grid = getActiveGridState()
  d.guides = getActiveGuidesState()
  d.defaultStyle = getActiveDefaultStyleState()
  d.smartGuides = getActiveSmartGuidesState()
  d.wireframe = getActiveWireframeState()
  d.sourcePdf = getActiveSourcePdfStore()
  return d
}

/** Make `doc` the active document. Every module that follows the
 *  `setActiveXxxState` / `getActiveXxxState` protocol gets its pointer
 *  swapped atomically so subsequent calls to the legacy function APIs
 *  (getSelection, setGridSettings, subscribeGuides, …) read and write
 *  into `doc`. */
export function setActiveDocument(doc: DocumentState): void {
  setActiveSelectionState(doc.selection)
  setActiveActiveLayerState(doc.activeLayer)
  setActiveArtboardState(doc.artboard)
  setActiveGridState(doc.grid)
  setActiveGuidesState(doc.guides)
  setActiveDefaultStyleState(doc.defaultStyle)
  setActiveSmartGuidesState(doc.smartGuides)
  setActiveWireframeState(doc.wireframe)
  setActiveSourcePdfStore(doc.sourcePdf)
}
