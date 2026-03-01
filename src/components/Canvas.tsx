import { useRef, useEffect, useCallback, useState } from 'react'
import { zoomAtPoint } from '../model/zoom'
import { screenToDoc, getZoomPercent } from '../model/coordinates'
import { getActiveTool } from '../tools/registry'

export interface DocumentDimensions {
  width: number  // mm
  height: number // mm
}

const DEFAULT_DIMENSIONS: DocumentDimensions = { width: 210, height: 297 } // A4

export interface CanvasState {
  cursorX: number
  cursorY: number
  zoomPercent: number
}

interface CanvasProps {
  dimensions?: DocumentDimensions
  onStateChange?: (state: CanvasState) => void
  onSvgReady?: (svg: SVGSVGElement) => void
}

export function Canvas({ dimensions = DEFAULT_DIMENSIONS, onStateChange, onSvgReady }: CanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [isPanning, setIsPanning] = useState(false)
  const panStart = useRef<{ x: number; y: number; vbX: number; vbY: number } | null>(null)
  const spaceHeld = useRef(false)

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
    onSvgReady?.(svg)
  }, [dimensions.width, dimensions.height, onSvgReady])

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

  const emitState = useCallback(() => {
    if (!onStateChange || !svgRef.current) return
    onStateChange({
      cursorX: 0,
      cursorY: 0,
      zoomPercent: getZoomPercent(svgRef.current),
    })
  }, [onStateChange])

  // Zoom handler
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (!svgRef.current) return
      zoomAtPoint(svgRef.current, e.clientX, e.clientY, e.deltaY)
      emitState()
    }
    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => container.removeEventListener('wheel', handleWheel)
  }, [emitState])

  // Mouse move for cursor coordinates + tool dispatch
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const handleMouseMove = (e: MouseEvent) => {
      if (!svgRef.current) return
      if (onStateChange) {
        const doc = screenToDoc(svgRef.current, e.clientX, e.clientY)
        onStateChange({
          cursorX: doc.x,
          cursorY: doc.y,
          zoomPercent: getZoomPercent(svgRef.current),
        })
      }

      // Pan while dragging
      if (isPanning && panStart.current) {
        const svg = svgRef.current
        const vb = svg.viewBox.baseVal
        const scale = vb.width / svg.clientWidth
        const dx = (e.clientX - panStart.current.x) * scale
        const dy = (e.clientY - panStart.current.y) * scale
        svg.setAttribute(
          'viewBox',
          `${panStart.current.vbX - dx} ${panStart.current.vbY - dy} ${vb.width} ${vb.height}`
        )
      } else {
        getActiveTool()?.handlers.onMouseMove?.(e)
      }
    }
    container.addEventListener('mousemove', handleMouseMove)
    return () => container.removeEventListener('mousemove', handleMouseMove)
  }, [onStateChange, isPanning])

  // Pan + tool event dispatch
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const handleDown = (e: MouseEvent) => {
      if (!svgRef.current) return
      if (e.button === 1 || (spaceHeld.current && e.button === 0)) {
        e.preventDefault()
        const vb = svgRef.current.viewBox.baseVal
        panStart.current = { x: e.clientX, y: e.clientY, vbX: vb.x, vbY: vb.y }
        setIsPanning(true)
      } else if (e.button === 0) {
        getActiveTool()?.handlers.onMouseDown?.(e)
      }
    }
    const handleUp = (e: MouseEvent) => {
      if (e.button === 1 || e.button === 0) {
        if (isPanning) {
          panStart.current = null
          setIsPanning(false)
        } else {
          getActiveTool()?.handlers.onMouseUp?.(e)
        }
      }
    }
    container.addEventListener('mousedown', handleDown)
    window.addEventListener('mouseup', handleUp)
    return () => {
      container.removeEventListener('mousedown', handleDown)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [isPanning])

  // Pan: space+drag
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        const tag = (e.target as HTMLElement)?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA') return
        e.preventDefault()
        spaceHeld.current = true
      }
    }
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceHeld.current = false
        panStart.current = null
        setIsPanning(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className="flex-1 bg-canvas-bg overflow-hidden"
      style={{ cursor: isPanning ? 'grabbing' : undefined }}
      data-testid="canvas-container"
    />
  )
}

export function getSvgRef(): SVGSVGElement | null {
  const container = document.querySelector('[data-testid="canvas-container"]')
  return container?.querySelector('svg') ?? null
}
