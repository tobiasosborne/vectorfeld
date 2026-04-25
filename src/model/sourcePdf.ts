/**
 * Source-PDF byte store — keeps the original PDF bytes alive for the
 * lifetime of a DocumentState so the graft-based export engine
 * (`vectorfeld-ccl` Phase 2) can re-open MuPDF on demand and clone
 * untouched regions byte-for-byte.
 *
 * Two kinds of entries:
 *   - `primary` — the foreground PDF imported via `File > Open PDF…`
 *   - `backgrounds` — keyed by layer name, one per `Open as Background Layer…`
 *     import. Layer names are unique within a doc (filename-derived), so the
 *     map keys match the SVG's `data-layer-name` attribute.
 *
 * `mupdfHandle` is intentionally `unknown` — Phase 2 wires up a worker-side
 * keep-alive protocol where the main thread holds an opaque docId; for now
 * the bytes alone are enough to bootstrap the graft engine.
 */

export type SourcePdfEntry = {
  bytes: Uint8Array
  filename: string
  pageCount: number
  /** Opaque worker-side reference; populated when the graft engine wires up. */
  mupdfHandle?: unknown
}

export class SourcePdfStore {
  primary: SourcePdfEntry | null = null
  backgrounds: Map<string, SourcePdfEntry> = new Map()

  setPrimary(entry: SourcePdfEntry): void {
    this.primary = entry
  }

  clearPrimary(): void {
    this.primary = null
  }

  addBackground(layerName: string, entry: SourcePdfEntry): void {
    this.backgrounds.set(layerName, entry)
  }

  removeBackground(layerName: string): boolean {
    return this.backgrounds.delete(layerName)
  }

  getPrimary(): SourcePdfEntry | null {
    return this.primary
  }

  getBackground(layerName: string): SourcePdfEntry | null {
    return this.backgrounds.get(layerName) ?? null
  }

  /** Clear primary AND backgrounds. Called when a new primary import lands
   *  and replaces the document wholesale (matches `applyParsedSvg`). */
  clearAll(): void {
    this.primary = null
    this.backgrounds.clear()
  }

  reset(): void {
    this.clearAll()
  }
}

let active: SourcePdfStore = new SourcePdfStore()
export function setActiveSourcePdfStore(s: SourcePdfStore): void { active = s }
export function getActiveSourcePdfStore(): SourcePdfStore { return active }

/**
 * Record an imported PDF in the store. Pure helper, called by `pdfImport.ts`
 * after a successful render. Splits primary vs background by `kind`.
 *
 * For `kind: 'primary'`: clears the entire store first (a fresh primary import
 * replaces the whole document, including its background layers).
 * For `kind: 'background'`: layerName is required and is used as the map key.
 */
export function recordImportedSource(
  store: SourcePdfStore,
  kind: 'primary' | 'background',
  layerName: string | null,
  entry: SourcePdfEntry,
): void {
  if (kind === 'primary') {
    store.clearAll()
    store.setPrimary(entry)
  } else {
    if (!layerName) {
      throw new Error('recordImportedSource: layerName required for background imports')
    }
    store.addBackground(layerName, entry)
  }
}
