/**
 * PDF import via MuPDF WASM.
 *
 * Runs MuPDF on a Web Worker so the ~10 MB WASM load and the per-page
 * render don't block the main thread. renderPageToSvg delegates to
 * pdfRender.worker.ts; the worker is instantiated once and reused.
 */

import type { DocumentModel } from './document'
import { syncIdCounter } from './document'
import { clearSelection } from './selection'
import { parseSvgString, type ParsedSvg } from './fileio'
import RenderWorker from './pdfRender.worker.ts?worker'

// ── Worker management ──────────────────────────────────────────────────

let worker: Worker | null = null
let pendingId = 0
const pending = new Map<number, { resolve: (svg: string) => void; reject: (err: Error) => void }>()

function getWorker(): Worker {
  if (worker) return worker
  worker = new RenderWorker()
  worker.addEventListener('message', (e: MessageEvent) => {
    const msg = e.data as { kind: string; id: number; svg?: string; message?: string }
    const p = pending.get(msg.id)
    if (!p) return
    pending.delete(msg.id)
    if (msg.kind === 'rendered' && typeof msg.svg === 'string') p.resolve(msg.svg)
    else p.reject(new Error(msg.message ?? 'PDF render failed'))
  })
  worker.addEventListener('error', (e) => {
    // If the worker dies, reject every pending request so callers don't hang.
    for (const [, p] of pending) p.reject(new Error(`PDF worker error: ${e.message}`))
    pending.clear()
    worker = null
  })
  return worker
}

function postRender(pdf: ArrayBuffer, pageIndex: number): Promise<string> {
  const w = getWorker()
  const id = ++pendingId
  return new Promise<string>((resolve, reject) => {
    pending.set(id, { resolve, reject })
    // Transfer the ArrayBuffer to avoid a copy.
    w.postMessage({ kind: 'render', id, pdf, pageIndex }, [pdf])
  })
}

// ── SVG post-processing ────────────────────────────────────────────────

/** Points to millimeters conversion factor */
const PT_TO_MM = 25.4 / 72

/**
 * Flatten MuPDF's top-level anonymous <g> wrapper and prepend `scale(s)` to
 * each resulting top-level child's transform. MuPDF emits the whole page
 * body as a single <g> with no semantic attributes; left intact, clicking
 * any element selects the entire wrapper instead of the clicked glyph.
 *
 * If the layer's single child is an anonymous <g> (no data-layer-name, no
 * id, no class), its children are promoted to direct layer children and
 * the scale is composed with the wrapper's own transform. Otherwise the
 * scale is applied per existing top-level child (no flattening).
 *
 * Pure (mutates the passed layer in place) — exported for testing.
 */
export function flattenAndScalePdfLayer(layer: Element, scale: number): void {
  const scalePrefix = `scale(${scale})`
  const wrapper = pdfContentWrapper(layer)

  if (wrapper) {
    const wrapperT = wrapper.getAttribute('transform') || ''
    const prefix = wrapperT ? `${scalePrefix} ${wrapperT}` : scalePrefix
    for (const gc of Array.from(wrapper.children)) {
      const existing = gc.getAttribute('transform')
      gc.setAttribute('transform', existing ? `${prefix} ${existing}` : prefix)
      layer.appendChild(gc) // move up one level
    }
    wrapper.remove()
  } else {
    for (const child of Array.from(layer.children)) {
      const existing = child.getAttribute('transform')
      child.setAttribute('transform', existing ? `${scalePrefix} ${existing}` : scalePrefix)
    }
  }
}

function pdfContentWrapper(layer: Element): Element | null {
  if (layer.childElementCount !== 1) return null
  const only = layer.firstElementChild!
  if (only.tagName.toLowerCase() !== 'g') return null
  if (only.hasAttribute('data-layer-name')) return null
  if (only.id) return null
  if (only.hasAttribute('class')) return null
  return only
}

/**
 * Post-process SVG output from MuPDF's SVG device.
 * - Converts viewBox from points to millimeters
 * - Strips metadata elements (title, desc, metadata)
 *
 * With text=text mode the output contains real <text>/<tspan> elements
 * with font-family/size/weight/style preserved, which is editable.
 */
export function postProcessPdfSvg(svgString: string): string {
  let s = svgString

  s = s.replace(/viewBox="([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)"/, (_, x, y, w, h) => {
    const mx = parseFloat(x) * PT_TO_MM
    const my = parseFloat(y) * PT_TO_MM
    const mw = parseFloat(w) * PT_TO_MM
    const mh = parseFloat(h) * PT_TO_MM
    return `viewBox="${mx.toFixed(2)} ${my.toFixed(2)} ${mw.toFixed(2)} ${mh.toFixed(2)}"`
  })

  s = s.replace(/<title[^>]*>[\s\S]*?<\/title>/gi, '')
  s = s.replace(/<desc[^>]*>[\s\S]*?<\/desc>/gi, '')
  s = s.replace(/<metadata[^>]*>[\s\S]*?<\/metadata>/gi, '')

  return s
}

// ── Import pipeline ────────────────────────────────────────────────────

/**
 * Render a PDF page to SVG via the worker. Pure pipeline: the worker
 * holds the MuPDF instance; this function just shepherds bytes in and
 * the SVG string out.
 */
async function renderPageToSvg(pdfData: ArrayBuffer, pageIndex = 0): Promise<string> {
  return postRender(pdfData, pageIndex)
}

/**
 * Import a PDF file into the document.
 * Opens a file picker, reads the PDF, converts first page to SVG,
 * post-processes, and imports into the document model.
 */
export async function importPdf(doc: DocumentModel): Promise<void> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.pdf,application/pdf'
    input.addEventListener('cancel', () => resolve())
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) { resolve(); return }

      try {
        const arrayBuffer = await file.arrayBuffer()
        const rawSvg = await renderPageToSvg(arrayBuffer)
        const processedSvg = postProcessPdfSvg(rawSvg)
        const parsed = parseSvgString(processedSvg)

        applyParsedSvg(doc, parsed)
        resolve()
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    }
    input.click()
  })
}

/**
 * Strip a `.pdf` extension and clamp filename length so it fits Layers panel UX.
 * Exported for testing.
 */
export function sanitizeLayerNameFromFile(filename: string): string {
  const base = filename.replace(/\.pdf$/i, '').trim()
  if (!base) return 'Background'
  return base.length > 40 ? base.slice(0, 37) + '...' : base
}

/**
 * Import a PDF file as a *background layer* in the active document.
 * Unlike importPdf, this does not clear existing layers or replace the
 * viewBox: the new PDF content lands in its own layer at the bottom of
 * the z-stack (rendered first, behind everything). Layer name is derived
 * from the file name. Defs are appended alongside existing defs.
 */
export async function importPdfAsBackgroundLayer(doc: DocumentModel): Promise<void> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.pdf,application/pdf'
    input.addEventListener('cancel', () => resolve())
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) { resolve(); return }
      try {
        const arrayBuffer = await file.arrayBuffer()
        const rawSvg = await renderPageToSvg(arrayBuffer)
        const processedSvg = postProcessPdfSvg(rawSvg)
        const parsed = parseSvgString(processedSvg)
        applyParsedAsBackgroundLayer(doc, parsed, file.name)
        resolve()
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    }
    input.click()
  })
}

/**
 * Insert parsed PDF content as a new bottom-most layer without touching
 * viewBox, existing layers, or selection. Exported for testing.
 */
export function applyParsedAsBackgroundLayer(doc: DocumentModel, parsed: ParsedSvg, filename: string): void {
  if (parsed.defs.length > 0) {
    const docDefs = doc.getDefs()
    for (const child of parsed.defs) {
      docDefs.appendChild(document.importNode(child, true))
    }
  }

  const layerName = sanitizeLayerNameFromFile(filename)
  // Insert BEFORE the first existing content layer so the new layer is
  // rendered first (= behind everything). If there are no existing layers
  // yet, fall back to inserting before the overlay group.
  const existingLayers = doc.getLayerElements()
  const insertBefore =
    existingLayers[0] ??
    doc.svg.querySelector('[data-role="grid-overlay"], [data-role="user-guides-overlay"], [data-role="guides-overlay"], [data-role="overlay"]')

  for (const layer of parsed.layers) {
    const imported = document.importNode(layer, true) as Element
    flattenAndScalePdfLayer(imported, PT_TO_MM)
    imported.setAttribute('data-layer-name', layerName)
    if (insertBefore) {
      doc.svg.insertBefore(imported, insertBefore)
    } else {
      doc.svg.appendChild(imported)
    }
  }

  syncIdCounter(doc.svg)
  // Fire selection notification LAST so the LayersPanel (which subscribes
  // to selection changes) sees the new layer on its refresh pass.
  clearSelection()
}

/**
 * Apply parsed SVG to the document model.
 * Mirrors the pattern from fileio.ts.
 */
function applyParsedSvg(doc: DocumentModel, parsed: ParsedSvg): void {
  clearSelection()

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

  // MuPDF emits content in PDF points wrapped in one anonymous <g>; viewBox
  // was converted to mm. Flatten that wrapper and distribute the pt→mm scale
  // across each resulting top-level element so every text/image/path remains
  // an individually selectable layer child.
  const firstOverlay = doc.svg.querySelector('[data-role="grid-overlay"], [data-role="user-guides-overlay"], [data-role="guides-overlay"], [data-role="overlay"]')
  for (const layer of parsed.layers) {
    const imported = document.importNode(layer, true) as Element
    flattenAndScalePdfLayer(imported, PT_TO_MM)
    if (firstOverlay) {
      doc.svg.insertBefore(imported, firstOverlay)
    } else {
      doc.svg.appendChild(imported)
    }
  }

  syncIdCounter(doc.svg)
}
