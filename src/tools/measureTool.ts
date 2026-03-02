import { registerTool } from './registry'
import type { ToolConfig } from './registry'
import { screenToDoc } from '../model/coordinates'
import type { DocumentModel } from '../model/document'
import type { CommandHistory } from '../model/commands'

interface MeasureToolState {
  measuring: boolean
  startX: number
  startY: number
  previewLine: SVGLineElement | null
  previewText: SVGTextElement | null
}

/** Calculate distance between two points */
export function measureDistance(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1
  const dy = y2 - y1
  return Math.sqrt(dx * dx + dy * dy)
}

export function createMeasureTool(
  getSvg: () => SVGSVGElement | null,
  _getDoc: () => DocumentModel | null,
  _getHistory: () => CommandHistory
): ToolConfig {
  const state: MeasureToolState = {
    measuring: false,
    startX: 0,
    startY: 0,
    previewLine: null,
    previewText: null,
  }

  function removePreview() {
    state.previewLine?.remove()
    state.previewText?.remove()
    state.previewLine = null
    state.previewText = null
  }

  function updateLabel(x1: number, y1: number, x2: number, y2: number) {
    if (!state.previewText) return
    const svg = getSvg()
    if (!svg) return
    const dist = measureDistance(x1, y1, x2, y2)
    const midX = (x1 + x2) / 2
    const midY = (y1 + y2) / 2
    // Size text relative to zoom so it stays readable
    const vb = svg.viewBox.baseVal
    const fontSize = vb.width > 0 && svg.clientWidth > 0
      ? (vb.width / svg.clientWidth) * 12
      : 3
    state.previewText.setAttribute('x', String(midX))
    state.previewText.setAttribute('y', String(midY - fontSize * 0.3))
    state.previewText.setAttribute('font-size', String(fontSize))
    state.previewText.textContent = `${dist.toFixed(1)} mm`
  }

  return {
    name: 'measure',
    icon: 'M',
    shortcut: 'm',
    cursor: 'crosshair',
    onDeactivate() { state.measuring = false; removePreview() },
    handlers: {
      onMouseDown(e: MouseEvent) {
        const svg = getSvg()
        if (!svg || e.button !== 0) return
        removePreview()
        const pt = screenToDoc(svg, e.clientX, e.clientY)

        state.measuring = true
        state.startX = pt.x
        state.startY = pt.y

        // Measurement line
        const vb = svg.viewBox.baseVal
        const sw = vb.width > 0 && svg.clientWidth > 0
          ? (vb.width / svg.clientWidth) * 1
          : 0.3
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
        line.setAttribute('x1', String(pt.x))
        line.setAttribute('y1', String(pt.y))
        line.setAttribute('x2', String(pt.x))
        line.setAttribute('y2', String(pt.y))
        line.setAttribute('stroke', '#e91e63')
        line.setAttribute('stroke-width', String(sw))
        line.setAttribute('stroke-dasharray', `${sw * 4} ${sw * 2}`)
        line.setAttribute('data-role', 'preview')
        line.setAttribute('pointer-events', 'none')
        svg.appendChild(line)
        state.previewLine = line

        // Distance label
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text')
        text.setAttribute('fill', '#e91e63')
        text.setAttribute('text-anchor', 'middle')
        text.setAttribute('data-role', 'preview')
        text.setAttribute('pointer-events', 'none')
        text.textContent = '0.0 mm'
        svg.appendChild(text)
        state.previewText = text
      },

      onMouseMove(e: MouseEvent) {
        if (!state.measuring || !state.previewLine) return
        const svg = getSvg()
        if (!svg) return
        const pt = screenToDoc(svg, e.clientX, e.clientY)
        state.previewLine.setAttribute('x2', String(pt.x))
        state.previewLine.setAttribute('y2', String(pt.y))
        updateLabel(state.startX, state.startY, pt.x, pt.y)
      },

      onMouseUp(e: MouseEvent) {
        if (!state.measuring) return
        state.measuring = false
        const svg = getSvg()
        if (!svg) return
        const pt = screenToDoc(svg, e.clientX, e.clientY)
        if (state.previewLine) {
          state.previewLine.setAttribute('x2', String(pt.x))
          state.previewLine.setAttribute('y2', String(pt.y))
        }
        updateLabel(state.startX, state.startY, pt.x, pt.y)
        // Keep measurement visible until next interaction or tool switch
      },
    },
  }
}

export function registerMeasureTool(
  getSvg: () => SVGSVGElement | null,
  getDoc: () => DocumentModel | null,
  getHistory: () => CommandHistory
): void {
  registerTool(createMeasureTool(getSvg, getDoc, getHistory))
}
