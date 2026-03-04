import { useRef, useEffect, useCallback, useState } from 'react'
import { zoomAtPoint } from '../model/zoom'
import { screenToDoc, getZoomPercent } from '../model/coordinates'
import { getActiveTool, isKeyboardCaptured, subscribe as subscribeTool } from '../tools/registry'
import { setOverlayGroup, refreshOverlay, refreshOverlaySync } from '../model/selection'
import { renderGrid, subscribeGrid } from '../model/grid'
import { setGuideGroup } from '../model/smartGuides'
import { isWireframe, subscribeWireframe, WIREFRAME_STYLE } from '../model/wireframe'
import { getGuides, subscribeGuides } from '../model/guides'

export interface DocumentDimensions {
  width: number  // mm
  height: number // mm
}

const DEFAULT_DIMENSIONS: DocumentDimensions = { width: 210, height: 297 } // A4

export interface CanvasState {
  cursorX: number
  cursorY: number
  zoomPercent: number
  viewBox: { x: number; y: number; width: number; height: number }
}

interface CanvasProps {
  dimensions?: DocumentDimensions
  onStateChange?: (state: CanvasState) => void
  onSvgReady?: (svg: SVGSVGElement) => void
  onContextMenu?: (e: MouseEvent) => void
}

export function Canvas({ dimensions = DEFAULT_DIMENSIONS, onStateChange, onSvgReady, onContextMenu }: CanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const gridGroupRef = useRef<SVGGElement | null>(null)
  const userGuidesGroupRef = useRef<SVGGElement | null>(null)
  const [isPanningState, setIsPanningState] = useState(false)
  const isPanningRef = useRef(false)
  const [, setToolTick] = useState(0) // force re-render on tool change for cursor
  const panStart = useRef<{ x: number; y: number; vbX: number; vbY: number } | null>(null)
  const spaceHeld = useRef(false)
  const setIsPanning = (v: boolean) => { isPanningRef.current = v; setIsPanningState(v) }

  useEffect(() => subscribeTool(() => setToolTick((n) => n + 1)), [])

  const dimensionsRef = useRef(dimensions)
  dimensionsRef.current = dimensions
  const onSvgReadyRef = useRef(onSvgReady)
  onSvgReadyRef.current = onSvgReady

  // Create SVG only once on mount
  useEffect(() => {
    const container = containerRef.current
    if (!container || svgRef.current) return

    const dims = dimensionsRef.current
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    svg.setAttribute('width', '100%')
    svg.setAttribute('height', '100%')
    svg.setAttribute('viewBox', `0 0 ${dims.width} ${dims.height}`)
    svg.style.display = 'block'

    // Artboard background
    const artboard = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    artboard.setAttribute('x', '0')
    artboard.setAttribute('y', '0')
    artboard.setAttribute('width', String(dims.width))
    artboard.setAttribute('height', String(dims.height))
    artboard.setAttribute('fill', '#ffffff')
    artboard.setAttribute('data-role', 'artboard')
    svg.appendChild(artboard)

    // Default layer
    const layer = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    layer.setAttribute('data-layer-name', 'Layer 1')
    svg.appendChild(layer)

    // Grid overlay (rendered behind selection)
    const gridGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    gridGroup.setAttribute('data-role', 'grid-overlay')
    gridGroup.setAttribute('pointer-events', 'none')
    svg.appendChild(gridGroup)
    gridGroupRef.current = gridGroup

    // User placement guides overlay
    const userGuidesGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    userGuidesGroup.setAttribute('data-role', 'user-guides-overlay')
    userGuidesGroup.setAttribute('pointer-events', 'none')
    svg.appendChild(userGuidesGroup)
    userGuidesGroupRef.current = userGuidesGroup

    // Smart guides overlay
    const guidesGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    guidesGroup.setAttribute('data-role', 'guides-overlay')
    guidesGroup.setAttribute('pointer-events', 'none')
    svg.appendChild(guidesGroup)
    setGuideGroup(guidesGroup)

    // Selection overlay group (non-document, rendered on top)
    const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    overlay.setAttribute('data-role', 'overlay')
    overlay.setAttribute('pointer-events', 'none')
    svg.appendChild(overlay)
    setOverlayGroup(overlay)

    container.appendChild(svg)
    svgRef.current = svg
    onSvgReadyRef.current?.(svg)

    return () => {
      if (svgRef.current && container) {
        container.removeChild(svgRef.current)
        svgRef.current = null
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    const vb = svgRef.current.viewBox.baseVal
    onStateChange({
      cursorX: 0,
      cursorY: 0,
      zoomPercent: getZoomPercent(svgRef.current),
      viewBox: { x: vb.x, y: vb.y, width: vb.width, height: vb.height },
    })
  }, [onStateChange])

  // Grid rendering
  const updateGrid = useCallback(() => {
    if (svgRef.current && gridGroupRef.current) {
      renderGrid(svgRef.current, gridGroupRef.current)
    }
  }, [])

  useEffect(() => {
    return subscribeGrid(updateGrid)
  }, [updateGrid])

  // User placement guides rendering
  const renderUserGuides = useCallback(() => {
    const g = userGuidesGroupRef.current
    const svg = svgRef.current
    if (!g || !svg) return
    while (g.firstChild) g.removeChild(g.firstChild)
    const vb = svg.viewBox.baseVal
    const sw = vb.width > 0 && svg.clientWidth > 0
      ? (vb.width / svg.clientWidth) * 0.5
      : 0.3
    for (const guide of getGuides()) {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
      if (guide.axis === 'h') {
        line.setAttribute('x1', String(vb.x))
        line.setAttribute('y1', String(guide.position))
        line.setAttribute('x2', String(vb.x + vb.width))
        line.setAttribute('y2', String(guide.position))
      } else {
        line.setAttribute('x1', String(guide.position))
        line.setAttribute('y1', String(vb.y))
        line.setAttribute('x2', String(guide.position))
        line.setAttribute('y2', String(vb.y + vb.height))
      }
      line.setAttribute('stroke', '#00bcd4')
      line.setAttribute('stroke-width', String(sw))
      line.setAttribute('stroke-dasharray', `${sw * 6} ${sw * 3}`)
      g.appendChild(line)
    }
  }, [])

  useEffect(() => {
    renderUserGuides()
    return subscribeGuides(renderUserGuides)
  }, [renderUserGuides])

  // Wireframe mode: inject/remove <style> in SVG
  useEffect(() => {
    const update = () => {
      if (!svgRef.current) return
      const existing = svgRef.current.querySelector('style[data-role="wireframe"]')
      if (isWireframe()) {
        if (!existing) {
          const style = document.createElementNS('http://www.w3.org/2000/svg', 'style')
          style.setAttribute('data-role', 'wireframe')
          style.textContent = WIREFRAME_STYLE
          svgRef.current.insertBefore(style, svgRef.current.firstChild)
        }
      } else {
        existing?.remove()
      }
    }
    update()
    return subscribeWireframe(update)
  }, [])

  // Zoom handler
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (!svgRef.current) return
      zoomAtPoint(svgRef.current, e.clientX, e.clientY, e.deltaY)
      refreshOverlaySync() // Recalculate handle sizes after zoom (synchronous for visual consistency)
      updateGrid()
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
        const vb = svgRef.current.viewBox.baseVal
        onStateChange({
          cursorX: doc.x,
          cursorY: doc.y,
          zoomPercent: getZoomPercent(svgRef.current),
          viewBox: { x: vb.x, y: vb.y, width: vb.width, height: vb.height },
        })
      }

      // Pan while dragging (use ref to avoid re-registering handler on state change)
      if (isPanningRef.current && panStart.current) {
        const svg = svgRef.current
        const vb = svg.viewBox.baseVal
        // Use getScreenCTM for accurate scale that respects preserveAspectRatio
        const ctm = svg.getScreenCTM()
        const scaleX = ctm ? 1 / ctm.a : vb.width / svg.clientWidth
        const scaleY = ctm ? 1 / ctm.d : vb.height / svg.clientHeight
        const dx = (e.clientX - panStart.current.x) * scaleX
        const dy = (e.clientY - panStart.current.y) * scaleY
        svg.setAttribute(
          'viewBox',
          `${panStart.current.vbX - dx} ${panStart.current.vbY - dy} ${vb.width} ${vb.height}`
        )
        updateGrid()
      } else {
        getActiveTool()?.handlers.onMouseMove?.(e)
      }
    }
    container.addEventListener('mousemove', handleMouseMove)
    return () => container.removeEventListener('mousemove', handleMouseMove)
  }, [onStateChange])

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
        if (isPanningRef.current) {
          panStart.current = null
          setIsPanning(false)
        } else {
          getActiveTool()?.handlers.onMouseUp?.(e)
        }
      }
    }
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault()
      onContextMenu?.(e)
    }
    container.addEventListener('mousedown', handleDown)
    window.addEventListener('mouseup', handleUp)
    container.addEventListener('contextmenu', handleContextMenu)
    return () => {
      container.removeEventListener('mousedown', handleDown)
      window.removeEventListener('mouseup', handleUp)
      container.removeEventListener('contextmenu', handleContextMenu)
    }
  }, [onContextMenu])

  // Pan: space+drag + tool keydown dispatch
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat && !isKeyboardCaptured()) {
        const tag = (e.target as HTMLElement)?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA') return
        e.preventDefault()
        spaceHeld.current = true
      }
      // Dispatch to active tool's onKeyDown handler
      const tag = (e.target as HTMLElement)?.tagName
      if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
        getActiveTool()?.handlers.onKeyDown?.(e)
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
      style={{ cursor: isPanningState ? 'grabbing' : (getActiveTool()?.cursor || undefined) }}
      data-testid="canvas-container"
    />
  )
}

export function getSvgRef(): SVGSVGElement | null {
  const container = document.querySelector('[data-testid="canvas-container"]')
  return container?.querySelector('svg') ?? null
}
