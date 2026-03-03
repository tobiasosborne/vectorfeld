/**
 * Arrow-key nudge logic for selected elements.
 * Extracted from EditorContext for testability.
 */

import { ModifyAttributeCommand, CompoundCommand } from './commands'
import type { CommandHistory } from './commands'
import { computeTranslateAttrs } from './geometry'
import { getSelection, refreshOverlay } from './selection'

/**
 * Move all selected elements by (dx, dy) using computeTranslateAttrs.
 * Creates a compound command for undo support.
 */
export function nudgeSelection(history: CommandHistory, dx: number, dy: number): void {
  const sel = getSelection()
  if (sel.length === 0) return

  const cmds: ModifyAttributeCommand[] = []
  for (const el of sel) {
    const changes = computeTranslateAttrs(el, dx, dy)
    for (const [attr, value] of changes) {
      cmds.push(new ModifyAttributeCommand(el, attr, value))
    }
  }

  if (cmds.length > 0) {
    history.execute(new CompoundCommand(cmds, 'Nudge'))
    refreshOverlay()
  }
}
