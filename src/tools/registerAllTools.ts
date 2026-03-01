import { registerLineTool } from './lineTool'
import { registerRectTool } from './rectTool'
import { registerEllipseTool } from './ellipseTool'
import { setActiveTool } from './registry'
import type { DocumentModel } from '../model/document'
import type { CommandHistory } from '../model/commands'

export function registerAllTools(
  getSvg: () => SVGSVGElement | null,
  getDoc: () => DocumentModel | null,
  getHistory: () => CommandHistory
): void {
  registerLineTool(getSvg, getDoc, getHistory)
  registerRectTool(getSvg, getDoc, getHistory)
  registerEllipseTool(getSvg, getDoc, getHistory)

  // Default to line tool
  setActiveTool('line')
}
