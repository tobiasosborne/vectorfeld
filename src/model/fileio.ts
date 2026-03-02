import type { DocumentModel } from './document'
import { syncIdCounter } from './document'
import { clearSelection } from './selection'
import { AddElementCommand } from './commands'
import type { CommandHistory } from './commands'
import { svgToTikz } from './tikzExport'
import { jsPDF } from 'jspdf'
import { svg2pdf } from 'svg2pdf.js'

/**
 * Export the document as an SVG file download.
 * Strips editor-only elements (overlays, previews) from the output.
 */
export function exportSvg(doc: DocumentModel, filename: string = 'document.svg'): void {
  const svg = doc.svg.cloneNode(true) as SVGSVGElement

  // Remove all overlay/preview/editor-only elements
  for (const el of svg.querySelectorAll('[data-role="overlay"], [data-role="preview"], [data-role="grid-overlay"], [data-role="guides-overlay"], [data-role="user-guides-overlay"], [data-role="wireframe"]')) {
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
  const fullSvg = xmlDecl + svgString

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
 * Export the document as a PDF file download.
 * Uses svg2pdf.js for client-side SVG-to-PDF conversion.
 */
export async function exportPdf(doc: DocumentModel, filename: string = 'document.pdf'): Promise<void> {
  // Clone and clean SVG
  const svgClone = doc.svg.cloneNode(true) as SVGSVGElement
  for (const el of svgClone.querySelectorAll('[data-role="overlay"], [data-role="preview"], [data-role="grid-overlay"], [data-role="guides-overlay"], [data-role="user-guides-overlay"], [data-role="wireframe"]')) {
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
  for (const el of svgClone.querySelectorAll('[data-role="overlay"], [data-role="preview"], [data-role="grid-overlay"], [data-role="guides-overlay"], [data-role="user-guides-overlay"], [data-role="wireframe"]')) {
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
 * Export the document as a TikZ file download.
 */
export function exportTikz(doc: DocumentModel, filename: string = 'document.tex'): void {
  const tikz = svgToTikz(doc.svg)
  const blob = new Blob([tikz], { type: 'text/plain' })
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
        const parser = new DOMParser()
        const svgDoc = parser.parseFromString(text, 'image/svg+xml')
        const importedSvg = svgDoc.documentElement

        // Clear selection before modifying DOM (prevents stale references)
        clearSelection()

        // Copy viewBox
        const viewBox = importedSvg.getAttribute('viewBox')
        if (viewBox) {
          doc.svg.setAttribute('viewBox', viewBox)
        }

        // Clear existing layers and their content before importing
        const existingLayers = doc.getLayerElements()
        for (const layer of existingLayers) {
          layer.remove()
        }

        // Import <defs> content
        const importedDefs = importedSvg.querySelector('defs')
        if (importedDefs) {
          const docDefs = doc.getDefs()
          // Clear existing defs and import new ones
          while (docDefs.firstChild) docDefs.removeChild(docDefs.firstChild)
          for (const child of Array.from(importedDefs.children)) {
            docDefs.appendChild(document.importNode(child, true))
          }
        }

        // Import child elements — look for layer groups or create one
        const children = Array.from(importedSvg.children)
        let hasLayers = false
        for (const child of children) {
          const tag = child.tagName
          if (tag === 'g' && child.getAttribute('data-layer-name')) {
            // Import entire layer group
            const imported = document.importNode(child, true)
            doc.svg.appendChild(imported)
            hasLayers = true
          }
        }

        // If no layer groups found, create a layer and import flat elements
        if (!hasLayers) {
          const layer = document.createElementNS('http://www.w3.org/2000/svg', 'g')
          layer.setAttribute('data-layer-name', 'Layer 1')
          doc.svg.appendChild(layer)
          for (const child of children) {
            const tag = child.tagName
            if (['g', 'line', 'rect', 'ellipse', 'circle', 'path', 'text', 'polygon', 'polyline'].includes(tag)) {
              const imported = document.importNode(child, true)
              layer.appendChild(imported)
            }
          }
        }

        // Advance ID counter past imported IDs to prevent collisions
        syncIdCounter(doc.svg)

        resolve()
      }
      reader.readAsText(file)
    }
    input.click()
  })
}
