import { useRef, useEffect, useCallback } from 'react'

export interface DocumentDimensions {
  width: number  // mm
  height: number // mm
}

const DEFAULT_DIMENSIONS: DocumentDimensions = { width: 210, height: 297 } // A4

interface CanvasProps {
  dimensions?: DocumentDimensions
}

export function Canvas({ dimensions = DEFAULT_DIMENSIONS }: CanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)

  const initSvg = useCallback(() => {
    const container = containerRef.current
    if (!container) return
    if (svgRef.current) return

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    svg.setAttribute('width', '100%')
    svg.setAttribute('height', '100%')
    svg.setAttribute(
      'viewBox',
      `0 0 ${dimensions.width} ${dimensions.height}`
    )
    svg.style.display = 'block'

    // Artboard background
    const artboard = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    artboard.setAttribute('x', '0')
    artboard.setAttribute('y', '0')
    artboard.setAttribute('width', String(dimensions.width))
    artboard.setAttribute('height', String(dimensions.height))
    artboard.setAttribute('fill', '#ffffff')
    artboard.setAttribute('data-role', 'artboard')
    svg.appendChild(artboard)

    // Default layer
    const layer = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    layer.setAttribute('data-layer-name', 'Layer 1')
    svg.appendChild(layer)

    container.appendChild(svg)
    svgRef.current = svg
  }, [dimensions.width, dimensions.height])

  useEffect(() => {
    initSvg()
    return () => {
      if (svgRef.current && containerRef.current) {
        containerRef.current.removeChild(svgRef.current)
        svgRef.current = null
      }
    }
  }, [initSvg])

  // Update viewBox when dimensions change
  useEffect(() => {
    if (!svgRef.current) return
    svgRef.current.setAttribute(
      'viewBox',
      `0 0 ${dimensions.width} ${dimensions.height}`
    )
    const artboard = svgRef.current.querySelector('[data-role="artboard"]')
    if (artboard) {
      artboard.setAttribute('width', String(dimensions.width))
      artboard.setAttribute('height', String(dimensions.height))
    }
  }, [dimensions.width, dimensions.height])

  return (
    <div
      ref={containerRef}
      className="flex-1 bg-canvas-bg overflow-hidden"
      data-testid="canvas-container"
    />
  )
}

export function getSvgRef(): SVGSVGElement | null {
  const container = document.querySelector('[data-testid="canvas-container"]')
  return container?.querySelector('svg') ?? null
}
