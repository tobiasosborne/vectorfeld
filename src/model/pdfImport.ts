/**
 * PDF import via MuPDF WASM.
 *
 * Lazy-loads mupdf (~13.8 MB WASM) on first use.
 * Renders PDF page → SVG via DocumentWriter("svg") → pipes through parseSvgString().
 */

import type { DocumentModel } from './document'
import { syncIdCounter } from './document'
import { clearSelection } from './selection'
import { parseSvgString, type ParsedSvg } from './fileio'

// ── Lazy-loaded MuPDF ──────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mupdf: any = null

async function getMuPDF() {
  if (mupdf) return mupdf
  mupdf = await import('mupdf')
  return mupdf
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
 * Render a PDF page to SVG using MuPDF's DocumentWriter with "svg" format.
 */
async function renderPageToSvg(pdfData: ArrayBuffer, pageIndex = 0): Promise<string> {
  const m = await getMuPDF()

  const doc = m.Document.openDocument(pdfData, 'application/pdf')
  const page = doc.loadPage(pageIndex)
  const bounds = page.getBounds()

  // Render page to SVG via DocumentWriter.
  // text=text → emit real <text>/<tspan> instead of glyph-as-path outlines.
  const buf = new m.Buffer()
  const writer = new m.DocumentWriter(buf, 'svg', 'text=text')
  const device = writer.beginPage(bounds)
  page.run(device, m.Matrix.identity)
  writer.endPage()
  writer.close()

  const svgString = buf.asString()

  // Cleanup
  page.destroy()
  doc.destroy()

  return svgString
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
  // Wrap each layer's content in a scale(pt→mm) group so content space matches viewBox units.
  const firstOverlay = doc.svg.querySelector('[data-role="grid-overlay"], [data-role="user-guides-overlay"], [data-role="guides-overlay"], [data-role="overlay"]')
  for (const layer of parsed.layers) {
    const imported = document.importNode(layer, true) as Element
    const scaleG = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    scaleG.setAttribute('transform', `scale(${PT_TO_MM})`)
    while (imported.firstChild) scaleG.appendChild(imported.firstChild)
    imported.appendChild(scaleG)
    if (firstOverlay) {
      doc.svg.insertBefore(imported, firstOverlay)
    } else {
      doc.svg.appendChild(imported)
    }
  }

  syncIdCounter(doc.svg)
}
