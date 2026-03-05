import { registerTool } from './registry'
import type { ToolConfig } from './registry'
import type { DocumentModel } from '../model/document'
import type { CommandHistory } from '../model/commands'
import { setDefaultStyle } from '../model/defaultStyle'
import { hitTestElement } from '../model/geometry'

export function createEyedropperTool(
  getSvg: () => SVGSVGElement | null,
  _getDoc: () => DocumentModel | null,
  _getHistory: () => CommandHistory
): ToolConfig {
  return {
    name: 'eyedropper',
    icon: 'I',
    shortcut: 'i',
    cursor: 'crosshair',
    handlers: {
      onMouseDown(e: MouseEvent) {
        const svg = getSvg()
        if (!svg || e.button !== 0) return
        const hit = hitTestElement(svg, e.clientX, e.clientY, { skipLocked: false })
        if (!hit) return
        const stroke = hit.getAttribute('stroke') || '#000000'
        const fill = hit.getAttribute('fill') || 'none'
        const strokeWidth = hit.getAttribute('stroke-width') || '1'
        setDefaultStyle({ stroke, fill, strokeWidth })
      },
    },
  }
}

export function registerEyedropperTool(
  getSvg: () => SVGSVGElement | null,
  getDoc: () => DocumentModel | null,
  getHistory: () => CommandHistory
): void {
  registerTool(createEyedropperTool(getSvg, getDoc, getHistory))
}
