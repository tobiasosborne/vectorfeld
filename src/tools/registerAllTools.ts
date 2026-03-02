import { registerSelectTool } from './selectTool'
import { registerLineTool } from './lineTool'
import { registerRectTool } from './rectTool'
import { registerEllipseTool } from './ellipseTool'
import { registerEraserTool } from './eraserTool'
import { registerPenTool } from './penTool'
import { registerTextTool } from './textTool'
import { registerDirectSelectTool } from './directSelectTool'
import { registerEyedropperTool } from './eyedropperTool'
import { registerPencilTool } from './pencilTool'
import { registerMeasureTool } from './measureTool'
import { registerScissorsTool } from './scissorsTool'
import { setActiveTool } from './registry'
import type { DocumentModel } from '../model/document'
import type { CommandHistory } from '../model/commands'

export function registerAllTools(
  getSvg: () => SVGSVGElement | null,
  getDoc: () => DocumentModel | null,
  getHistory: () => CommandHistory
): void {
  registerSelectTool(getSvg, getDoc, getHistory)
  registerLineTool(getSvg, getDoc, getHistory)
  registerRectTool(getSvg, getDoc, getHistory)
  registerEllipseTool(getSvg, getDoc, getHistory)
  registerEraserTool(getSvg, getDoc, getHistory)
  registerPenTool(getSvg, getDoc, getHistory)
  registerTextTool(getSvg, getDoc, getHistory)
  registerDirectSelectTool(getSvg, getDoc, getHistory)
  registerEyedropperTool(getSvg, getDoc, getHistory)
  registerPencilTool(getSvg, getDoc, getHistory)
  registerMeasureTool(getSvg, getDoc, getHistory)
  registerScissorsTool(getSvg, getDoc, getHistory)

  // Default to select tool
  setActiveTool('select')
}
