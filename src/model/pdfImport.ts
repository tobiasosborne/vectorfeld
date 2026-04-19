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

  // MuPDF emits content in PDF points; viewBox was converted to mm.
  // Rather than wrap all content in a single <g> (which would make the layer
  // have only one child and break per-element hit testing), prepend a scale
  // to each top-level element's transform attribute. Each text/image/group
  // remains a direct layer child and is individually selectable.
  const firstOverlay = doc.svg.querySelector('[data-role="grid-overlay"], [data-role="user-guides-overlay"], [data-role="guides-overlay"], [data-role="overlay"]')
  const scalePrefix = `scale(${PT_TO_MM})`
  for (const layer of parsed.layers) {
    const imported = document.importNode(layer, true) as Element
    for (const child of Array.from(imported.children)) {
      const existing = child.getAttribute('transform')
      child.setAttribute('transform', existing ? `${scalePrefix} ${existing}` : scalePrefix)
    }
    if (firstOverlay) {
      doc.svg.insertBefore(imported, firstOverlay)
    } else {
      doc.svg.appendChild(imported)
    }
  }

  syncIdCounter(doc.svg)
}
