/**
 * Canvas-based rulers with adaptive tick intervals.
 * HRuler (horizontal, top) and VRuler (vertical, left), 20px thick.
 * Drag from ruler creates a guide via addGuide().
 */
import { useRef, useEffect, useCallback, useState } from 'react'
import { addGuide } from '../model/guides'

const RULER_SIZE = 14 // px (Atrium thin ruler)

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
}

export function HRuler({ viewBox, canvasSize, cursorPos }: RulerProps) {
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

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (dragging && canvasSize > 0 && viewBox.width > 0) {
      const rect = canvasRef.current?.getBoundingClientRect()
      if (!rect) return
      // If mouse moved below ruler, create a horizontal guide
      if (e.clientY > rect.bottom) {
        const px = e.clientX - rect.left
        const docX = viewBox.x + (px / canvasSize) * viewBox.width
        // Horizontal guide at the cursor Y position — but we need doc coords
        // For now, create at a position derived from cursor
        addGuide('h', Math.round(docX * 10) / 10)
      }
    }
    setDragging(false)
  }, [dragging, canvasSize, viewBox])

  return (
    <canvas
      ref={canvasRef}
      className="block"
      style={{ width: '100%', height: RULER_SIZE, cursor: 'default' }}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
    />
  )
}

export function VRuler({ viewBox, canvasSize, cursorPos }: RulerProps) {
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

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (dragging && canvasSize > 0 && viewBox.height > 0) {
      const rect = canvasRef.current?.getBoundingClientRect()
      if (!rect) return
      // If mouse moved right of ruler, create a vertical guide
      if (e.clientX > rect.right) {
        const py = e.clientY - rect.top
        const docY = viewBox.y + (py / canvasSize) * viewBox.height
        addGuide('v', Math.round(docY * 10) / 10)
      }
    }
    setDragging(false)
  }, [dragging, canvasSize, viewBox])

  return (
    <canvas
      ref={canvasRef}
      className="block"
      style={{ width: RULER_SIZE, height: '100%', cursor: 'default' }}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
    />
  )
}
