import type { DocumentModel } from './document'
import { syncIdCounter } from './document'
import { clearSelection } from './selection'
import { AddElementCommand } from './commands'
import type { CommandHistory } from './commands'
import { jsPDF } from 'jspdf'
import { svg2pdf } from 'svg2pdf.js'
import { svgStringToPdfBytes } from './pdfExport'

/** Selector for editor-only overlays that should be stripped on export */
const OVERLAY_SELECTOR = '[data-role="overlay"], [data-role="preview"], [data-role="grid-overlay"], [data-role="guides-overlay"], [data-role="user-guides-overlay"], [data-role="wireframe"]'

/** Tags that must never survive import — scripts, embedded HTML, remote loads. */
const DANGEROUS_TAGS = new Set(['script', 'foreignObject', 'iframe', 'object', 'embed'])

/** Href attributes to strip if value starts with javascript: or data:text/html */
const HREF_ATTRS = ['href', 'xlink:href']

/**
 * Sanitize an imported SVG subtree in place. Strips:
 *   - <script>, <foreignObject>, <iframe>, <object>, <embed> elements
 *   - All on* event handler attributes (onclick, onload, onmouseover, …)
 *   - href/xlink:href values starting with javascript: or data:text/html
 *
 * Called after DOMParser + before importNode for any user-supplied SVG
 * (from <input type="file">, PDF import, or clipboard paste).
 * Exported for testing and for clipboard paste reuse.
 */
export function sanitizeSvgTree(root: Element): void {
  // First pass: remove dangerous elements (walk descendants, collect, then remove
  // to avoid mutating a live NodeList during iteration).
  const toRemove: Element[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT)
  let node: Node | null = walker.currentNode
  while (node) {
    const el = node as Element
    if (DANGEROUS_TAGS.has(el.tagName) || DANGEROUS_TAGS.has(el.tagName.toLowerCase())) {
      toRemove.push(el)
    }
    node = walker.nextNode()
  }
  for (const el of toRemove) el.remove()

  // Second pass: strip inline event handlers and dangerous href values.
  const walker2 = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT)
  let n: Node | null = walker2.currentNode
  while (n) {
    const el = n as Element
    // Collect attribute names first — removeAttribute mutates the NamedNodeMap.
    const attrsToRemove: string[] = []
    for (const a of Array.from(el.attributes)) {
      const name = a.name.toLowerCase()
      if (name.startsWith('on')) {
        attrsToRemove.push(a.name)
        continue
      }
      if (HREF_ATTRS.includes(name)) {
        const v = a.value.trim().toLowerCase()
        if (v.startsWith('javascript:') || v.startsWith('data:text/html')) {
          attrsToRemove.push(a.name)
        }
      }
    }
    for (const name of attrsToRemove) el.removeAttribute(name)
    n = walker2.nextNode()
  }
}

/**
 * Build a clean SVG string from the document, stripping editor overlays.
 * Includes XML declaration and ensures xmlns is present.
 * Exported for testing.
 */
export function exportSvgString(doc: DocumentModel): string {
  const svg = doc.svg.cloneNode(true) as SVGSVGElement

  // Remove all overlay/preview/editor-only elements
  for (const el of svg.querySelectorAll(OVERLAY_SELECTOR)) {
    el.remove()
  }

  // Add XML declaration and proper SVG namespace
  const serializer = new XMLSerializer()
  let svgString = serializer.serializeToString(svg)

  // Ensure xmlns is present
  if (!svgString.includes('xmlns="http://www.w3.org/2000/svg"')) {
    svgString = svgString.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"')
  }

  const xmlDecl = '<?xml version="1.0" encoding="UTF-8"?>\n'
  return xmlDecl + svgString
}

/**
 * Export the document as an SVG file download.
 * Strips editor-only elements (overlays, previews) from the output.
 */
export function exportSvg(doc: DocumentModel, filename: string = 'document.svg'): void {
  const fullSvg = exportSvgString(doc)

  // Browser download
  const blob = new Blob([fullSvg], { type: 'image/svg+xml' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * Render an SVG string to PDF bytes using the pdf-lib engine.
 * Pure: no DOM mutation, no download trigger. Drives round-trip tests
 * (test/roundtrip/) and is the path forward for production exportPdf
 * once feature parity with the svg2pdf engine lands.
 */
export async function exportSvgStringToPdfBytes(svgString: string): Promise<Uint8Array> {
  return svgStringToPdfBytes(svgString)
}

/**
 * Export the document as a PDF file download.
 * Uses svg2pdf.js for client-side SVG-to-PDF conversion.
 */
export async function exportPdf(doc: DocumentModel, filename: string = 'document.pdf'): Promise<void> {
  // Clone and clean SVG
  const svgClone = doc.svg.cloneNode(true) as SVGSVGElement
  for (const el of svgClone.querySelectorAll(OVERLAY_SELECTOR)) {
    el.remove()
  }

  // Parse viewBox for dimensions
  const vb = doc.svg.viewBox.baseVal
  const width = vb.width || 210
  const height = vb.height || 297

  // Set explicit dimensions on clone for svg2pdf
  svgClone.setAttribute('width', String(width))
  svgClone.setAttribute('height', String(height))

  // Create PDF with matching dimensions (mm)
  const orientation = width > height ? 'landscape' : 'portrait'
  const pdf = new jsPDF({
    orientation,
    unit: 'mm',
    format: [width, height],
  })

  // Temporarily add to DOM for measurement (svg2pdf needs this)
  svgClone.style.position = 'absolute'
  svgClone.style.left = '-9999px'
  document.body.appendChild(svgClone)

  try {
    await svg2pdf(svgClone, pdf, { x: 0, y: 0, width, height })
    pdf.save(filename)
  } finally {
    document.body.removeChild(svgClone)
  }
}

/**
 * Export the document as a PNG file download.
 * Renders SVG to an offscreen canvas at the specified scale.
 */
export function exportPng(doc: DocumentModel, scale: number = 1, filename: string = 'document.png'): void {
  const svgClone = doc.svg.cloneNode(true) as SVGSVGElement
  for (const el of svgClone.querySelectorAll(OVERLAY_SELECTOR)) {
    el.remove()
  }

  const vb = doc.svg.viewBox.baseVal
  const width = vb.width || 210
  const height = vb.height || 297

  // mm to px at 96 DPI: 1mm = 3.7795px
  const pxPerMm = 3.7795 * scale
  const canvasWidth = Math.round(width * pxPerMm)
  const canvasHeight = Math.round(height * pxPerMm)

  svgClone.setAttribute('width', String(canvasWidth))
  svgClone.setAttribute('height', String(canvasHeight))

  const serializer = new XMLSerializer()
  let svgString = serializer.serializeToString(svgClone)
  if (!svgString.includes('xmlns="http://www.w3.org/2000/svg"')) {
    svgString = svgString.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"')
  }

  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const img = new Image()
  img.onload = () => {
    const canvas = document.createElement('canvas')
    canvas.width = canvasWidth
    canvas.height = canvasHeight
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0)
    URL.revokeObjectURL(url)
    canvas.toBlob((pngBlob) => {
      if (!pngBlob) return
      const pngUrl = URL.createObjectURL(pngBlob)
      const a = document.createElement('a')
      a.href = pngUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(pngUrl)
    }, 'image/png')
  }
  img.src = url
}

/**
 * Place a raster image into the document.
 * Opens a file picker, reads the image as data URL, creates an <image> element.
 */
export function placeImage(doc: DocumentModel, history: CommandHistory): Promise<void> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/png,image/jpeg,image/gif,image/webp'
    input.addEventListener('cancel', () => resolve())
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) { resolve(); return }
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = reader.result as string
        const layer = doc.getActiveLayer()
        if (!layer) { resolve(); return }

        // Create image element centered in viewport
        const vb = doc.svg.viewBox.baseVal
        const imgWidth = Math.min(80, vb.width * 0.5)
        const imgHeight = imgWidth * 0.75 // default 4:3 aspect
        const x = vb.x + (vb.width - imgWidth) / 2
        const y = vb.y + (vb.height - imgHeight) / 2

        const cmd = new AddElementCommand(doc, layer, 'image', {
          href: dataUrl,
          x: String(x),
          y: String(y),
          width: String(imgWidth),
          height: String(imgHeight),
        })
        history.execute(cmd)
        resolve()
      }
      reader.readAsDataURL(file)
    }
    input.click()
  })
}

/** Result of parsing an SVG string for import */
export interface ParsedSvg {
  viewBox: string | null
  defs: Element[]
  layers: Element[]
}

/**
 * Parse an SVG string into importable parts.
 * Returns the viewBox, defs children, and layer groups (or a synthetic layer
 * wrapping flat drawing elements if no layers are found).
 * Exported for testing.
 */
export function parseSvgString(xmlString: string): ParsedSvg {
  const parser = new DOMParser()
  const svgDoc = parser.parseFromString(xmlString, 'image/svg+xml')
  const importedSvg = svgDoc.documentElement
  sanitizeSvgTree(importedSvg)

  const viewBox = importedSvg.getAttribute('viewBox')

  // Collect defs children
  const defs: Element[] = []
  const importedDefs = importedSvg.querySelector('defs')
  if (importedDefs) {
    for (const child of Array.from(importedDefs.children)) {
      defs.push(child)
    }
  }

  // Collect layer groups or build a synthetic layer
  const children = Array.from(importedSvg.children)
  const layers: Element[] = []
  let hasLayers = false

  for (const child of children) {
    if (child.tagName === 'g' && child.getAttribute('data-layer-name')) {
      layers.push(child)
      hasLayers = true
    }
  }

  if (!hasLayers) {
    // Create a synthetic layer wrapping flat drawing elements
    const layer = svgDoc.createElementNS('http://www.w3.org/2000/svg', 'g')
    layer.setAttribute('data-layer-name', 'Layer 1')
    const drawingTags = ['g', 'line', 'rect', 'ellipse', 'circle', 'path', 'text', 'polygon', 'polyline', 'image']
    for (const child of children) {
      if (drawingTags.includes(child.tagName)) {
        layer.appendChild(child.cloneNode(true))
      }
    }
    layers.push(layer)
  }

  return { viewBox, defs, layers }
}

/**
 * Apply a parsed SVG to the document model.
 * Clears existing layers/defs and imports the parsed content.
 */
function applyParsedSvg(doc: DocumentModel, parsed: ParsedSvg): void {
  // Clear selection before modifying DOM (prevents stale references)
  clearSelection()

  // Copy viewBox
  if (parsed.viewBox) {
    doc.svg.setAttribute('viewBox', parsed.viewBox)
  }

  // Clear existing layers
  for (const layer of doc.getLayerElements()) {
    layer.remove()
  }

  // Import defs
  if (parsed.defs.length > 0) {
    const docDefs = doc.getDefs()
    while (docDefs.firstChild) docDefs.removeChild(docDefs.firstChild)
    for (const child of parsed.defs) {
      docDefs.appendChild(document.importNode(child, true))
    }
  }

  // Import layers before overlay groups to maintain correct z-order
  const firstOverlay = doc.svg.querySelector('[data-role="grid-overlay"], [data-role="user-guides-overlay"], [data-role="guides-overlay"], [data-role="overlay"]')
  for (const layer of parsed.layers) {
    const imported = document.importNode(layer, true)
    if (firstOverlay) {
      doc.svg.insertBefore(imported, firstOverlay)
    } else {
      doc.svg.appendChild(imported)
    }
  }

  // Advance ID counter past imported IDs to prevent collisions
  syncIdCounter(doc.svg)
}

/**
 * Import an SVG file into the document model.
 * Returns a promise that resolves when the file is loaded.
 */
export function importSvg(doc: DocumentModel): Promise<void> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.svg,image/svg+xml'
    // Handle cancel (user closes file dialog without selecting)
    input.addEventListener('cancel', () => resolve())
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) {
        resolve()
        return
      }
      const reader = new FileReader()
      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.onload = () => {
        const text = reader.result as string
        const parsed = parseSvgString(text)
        applyParsedSvg(doc, parsed)
        resolve()
      }
      reader.readAsText(file)
    }
    input.click()
  })
}
