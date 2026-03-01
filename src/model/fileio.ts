import type { DocumentModel } from './document'

/**
 * Export the document as an SVG file download.
 * Strips editor-only elements (overlays, previews) from the output.
 */
export function exportSvg(doc: DocumentModel, filename: string = 'document.svg'): void {
  const svg = doc.svg.cloneNode(true) as SVGSVGElement

  // Remove overlay group
  const overlay = svg.querySelector('[data-role="overlay"]')
  overlay?.remove()

  // Remove preview elements
  for (const preview of svg.querySelectorAll('[data-role="preview"]')) {
    preview.remove()
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
 * Import an SVG file into the document model.
 * Returns a promise that resolves when the file is loaded.
 */
export function importSvg(doc: DocumentModel): Promise<void> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.svg,image/svg+xml'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) {
        resolve()
        return
      }
      const reader = new FileReader()
      reader.onload = () => {
        const text = reader.result as string
        const parser = new DOMParser()
        const svgDoc = parser.parseFromString(text, 'image/svg+xml')
        const importedSvg = svgDoc.documentElement

        // Copy viewBox
        const viewBox = importedSvg.getAttribute('viewBox')
        if (viewBox) {
          doc.svg.setAttribute('viewBox', viewBox)
        }

        // Find or create a layer
        let layer = doc.getActiveLayer()
        if (!layer) {
          const g = document.createElementNS('http://www.w3.org/2000/svg', 'g')
          g.setAttribute('data-layer-name', 'Imported')
          doc.svg.appendChild(g)
          layer = g
        }

        // Import child elements
        const children = Array.from(importedSvg.children)
        for (const child of children) {
          // Skip metadata, defs for now — import visual elements
          const tag = child.tagName
          if (['g', 'line', 'rect', 'ellipse', 'circle', 'path', 'text', 'polygon', 'polyline'].includes(tag)) {
            const imported = document.importNode(child, true)
            layer.appendChild(imported)
          }
        }

        resolve()
      }
      reader.readAsText(file)
    }
    input.click()
  })
}
