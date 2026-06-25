/**
 * Canvas-based rulers with adaptive tick intervals.
 * HRuler (horizontal, top) and VRuler (vertical, left), 20px thick.
 * Drag from ruler creates a guide via addGuide().
 */
import { useRef, useEffect, useCallback, useState } from 'react'
import { addGuide } from '../model/guides'
import { screenToDoc, type Point } from '../model/coordinates'

const RULER_SIZE = 14 // px (Atrium thin ruler)

/** Round to one decimal place (0.1mm) — guide-position granularity. */
function round1(n: number): number {
  return Math.round(n * 10) / 10
}

/**
 * Document-space position for a guide dropped at `docPoint`.
 * A horizontal ('h') guide is a horizontal line that lives at a document Y;
 * a vertical ('v') guide lives at a document X (see Canvas guide rendering and
 * guides.candidates()). Result is rounded to 0.1mm.
 *
 * Regression guard for vectorfeld-3yu.20: the rulers previously fed the
 * ALONG-ruler coordinate (HRuler→x, VRuler→y) into the guide, placing every
 * guide on the orthogonal axis. The axis and the coordinate must agree.
 */
export function guideDropPosition(axis: 'h' | 'v', docPoint: Point): number {
  return round1(axis === 'h' ? docPoint.y : docPoint.x)
}

// Resolve an Atrium CSS var to a concrete color string for canvas-rendering.
function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined' || typeof document === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

function atriumRulerPalette() {
  return {
    border: cssVar('--color-border', 'rgba(60,40,20,0.08)'),
    borderStrong: cssVar('--color-border-strong', 'rgba(60,40,20,0.14)'),
    text: cssVar('--color-muted', 'oklch(52% 0.02 70)'),
    cursor: cssVar('--color-accent', 'oklch(64% 0.18 35)'),
  }
}

/** Adaptive tick intervals — pick one so ticks are ~50-100px apart */
const INTERVALS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000]

export interface ViewBoxInfo {
  x: number
  y: number
  width: number
  height: number
}

/** Pick the best tick interval for the current zoom */
export function pickInterval(viewBoxSpan: number, canvasPixels: number): number {
  const pxPerUnit = canvasPixels / viewBoxSpan
  // Target: ~60-120px between major ticks
  const targetUnitSpan = 80 / pxPerUnit
  for (const iv of INTERVALS) {
    if (iv >= targetUnitSpan) return iv
  }
  return INTERVALS[INTERVALS.length - 1]
}

/** Format tick label — drop trailing zeros, show ints as ints */
export function formatLabel(value: number, interval: number): string {
  if (interval >= 1) return String(Math.round(value))
  const decimals = interval >= 0.1 ? 1 : 2
  return value.toFixed(decimals)
}

interface RulerProps {
  viewBox: ViewBoxInfo
  canvasSize: number   // px dimension along ruler axis
  cursorPos: number    // document units along ruler axis
  /** Live SVG element accessor — used to map the drop point to document space. */
  getSvg?: () => SVGSVGElement | null
}

export function HRuler({ viewBox, canvasSize, cursorPos, getSvg }: RulerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [dragging, setDragging] = useState(false)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const w = canvas.clientWidth
    const h = RULER_SIZE
    canvas.width = w * dpr
    canvas.height = h * dpr
    ctx.scale(dpr, dpr)

    const pal = atriumRulerPalette()

    // Background: transparent (sits over canvas tint)
    ctx.clearRect(0, 0, w, h)

    // Bottom border
    ctx.strokeStyle = pal.border
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, h - 0.5)
    ctx.lineTo(w, h - 0.5)
    ctx.stroke()

    if (viewBox.width <= 0 || canvasSize <= 0) return

    const pxPerUnit = canvasSize / viewBox.width
    const interval = pickInterval(viewBox.width, canvasSize)
    const minorInterval = interval / 5

    // Draw ticks
    const start = Math.floor(viewBox.x / interval) * interval
    const end = viewBox.x + viewBox.width

    ctx.fillStyle = pal.text
    ctx.font = '9px ui-sans-serif, Inter, system-ui, sans-serif'
    ctx.textBaseline = 'top'

    // Minor ticks
    const minorStart = Math.floor(viewBox.x / minorInterval) * minorInterval
    ctx.strokeStyle = pal.border
    ctx.lineWidth = 0.5
    for (let v = minorStart; v <= end; v += minorInterval) {
      const px = (v - viewBox.x) * pxPerUnit
      ctx.beginPath()
      ctx.moveTo(px, h - 3)
      ctx.lineTo(px, h)
      ctx.stroke()
    }

    // Major ticks + labels
    ctx.strokeStyle = pal.borderStrong
    ctx.lineWidth = 1
    for (let v = start; v <= end; v += interval) {
      const px = (v - viewBox.x) * pxPerUnit
      ctx.beginPath()
      ctx.moveTo(px, h - 7)
      ctx.lineTo(px, h)
      ctx.stroke()
      ctx.fillText(formatLabel(v, interval), px + 2, 1)
    }

    // Cursor indicator (accent triangle)
    const cursorPx = (cursorPos - viewBox.x) * pxPerUnit
    if (cursorPx >= 0 && cursorPx <= w) {
      ctx.fillStyle = pal.cursor
      ctx.beginPath()
      ctx.moveTo(cursorPx - 4, h)
      ctx.lineTo(cursorPx + 4, h)
      ctx.lineTo(cursorPx, h - 6)
      ctx.closePath()
      ctx.fill()
    }
  }, [viewBox, canvasSize, cursorPos])

  useEffect(() => {
    draw()
  }, [draw])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setDragging(true)
    e.preventDefault()
  }, [])

  // A guide drop RELEASES over the canvas (below the ruler), so the mouseup
  // never targets the ruler element — an element-level onMouseUp can never fire
  // with `clientY > rect.bottom`. Listen on window while dragging instead.
  useEffect(() => {
    if (!dragging) return
    const onUp = (e: MouseEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect()
      const svg = getSvg?.()
      // Released below the H-ruler → horizontal guide at the drop's document Y
      // (mapped via the live SVG transform, not the ruler's axis).
      if (rect && svg && e.clientY > rect.bottom) {
        addGuide('h', guideDropPosition('h', screenToDoc(svg, e.clientX, e.clientY)))
      }
      setDragging(false)
    }
    window.addEventListener('mouseup', onUp)
    return () => window.removeEventListener('mouseup', onUp)
  }, [dragging, getSvg])

  return (
    <canvas
      ref={canvasRef}
      className="block"
      data-role="hruler"
      style={{ width: '100%', height: RULER_SIZE, cursor: 'default' }}
      onMouseDown={handleMouseDown}
    />
  )
}

export function VRuler({ viewBox, canvasSize, cursorPos, getSvg }: RulerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [dragging, setDragging] = useState(false)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const w = RULER_SIZE
    const h = canvas.clientHeight
    canvas.width = w * dpr
    canvas.height = h * dpr
    ctx.scale(dpr, dpr)

    const pal = atriumRulerPalette()

    // Background: transparent
    ctx.clearRect(0, 0, w, h)

    // Right border
    ctx.strokeStyle = pal.border
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(w - 0.5, 0)
    ctx.lineTo(w - 0.5, h)
    ctx.stroke()

    if (viewBox.height <= 0 || canvasSize <= 0) return

    const pxPerUnit = canvasSize / viewBox.height
    const interval = pickInterval(viewBox.height, canvasSize)
    const minorInterval = interval / 5

    // Minor ticks
    const minorStart = Math.floor(viewBox.y / minorInterval) * minorInterval
    const end = viewBox.y + viewBox.height
    ctx.strokeStyle = pal.border
    ctx.lineWidth = 0.5
    for (let v = minorStart; v <= end; v += minorInterval) {
      const py = (v - viewBox.y) * pxPerUnit
      ctx.beginPath()
      ctx.moveTo(w - 3, py)
      ctx.lineTo(w, py)
      ctx.stroke()
    }

    // Major ticks + labels
    ctx.fillStyle = pal.text
    ctx.strokeStyle = pal.borderStrong
    ctx.lineWidth = 1
    ctx.font = '9px ui-sans-serif, Inter, system-ui, sans-serif'
    const start = Math.floor(viewBox.y / interval) * interval

    for (let v = start; v <= end; v += interval) {
      const py = (v - viewBox.y) * pxPerUnit
      ctx.beginPath()
      ctx.moveTo(w - 7, py)
      ctx.lineTo(w, py)
      ctx.stroke()

      // Rotated label
      ctx.save()
      ctx.translate(2, py + 2)
      ctx.rotate(-Math.PI / 2)
      ctx.textBaseline = 'bottom'
      ctx.fillText(formatLabel(v, interval), 0, 0)
      ctx.restore()
    }

    // Cursor indicator (accent triangle)
    const cursorPy = (cursorPos - viewBox.y) * pxPerUnit
    if (cursorPy >= 0 && cursorPy <= h) {
      ctx.fillStyle = pal.cursor
      ctx.beginPath()
      ctx.moveTo(w, cursorPy - 4)
      ctx.lineTo(w, cursorPy + 4)
      ctx.lineTo(w - 6, cursorPy)
      ctx.closePath()
      ctx.fill()
    }
  }, [viewBox, canvasSize, cursorPos])

  useEffect(() => {
    draw()
  }, [draw])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setDragging(true)
    e.preventDefault()
  }, [])

  // See HRuler: the drop releases right of the ruler, over the canvas, so the
  // release must be tracked on window, not via the ruler's onMouseUp.
  useEffect(() => {
    if (!dragging) return
    const onUp = (e: MouseEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect()
      const svg = getSvg?.()
      // Released right of the V-ruler → vertical guide at the drop's document X.
      if (rect && svg && e.clientX > rect.right) {
        addGuide('v', guideDropPosition('v', screenToDoc(svg, e.clientX, e.clientY)))
      }
      setDragging(false)
    }
    window.addEventListener('mouseup', onUp)
    return () => window.removeEventListener('mouseup', onUp)
  }, [dragging, getSvg])

  return (
    <canvas
      ref={canvasRef}
      className="block"
      data-role="vruler"
      style={{ width: RULER_SIZE, height: '100%', cursor: 'default' }}
      onMouseDown={handleMouseDown}
    />
  )
}
