/**
 * Z-order operations: bring forward/back, send to front/back.
 * Extracted from EditorContext for testability.
 */

import { ReorderElementCommand } from './commands'
import type { CommandHistory } from './commands'
import { getSelection, refreshOverlay } from './selection'

/** Move the selected element one step forward in the z-order. */
export function bringForward(history: CommandHistory): void {
  const sel = getSelection()
  if (sel.length !== 1) return
  const el = sel[0]
  const next = el.nextElementSibling
  if (!next) return
  const target = next.nextElementSibling // insert after next
  history.execute(new ReorderElementCommand(el, target, 'Bring Forward'))
  refreshOverlay()
}

/** Move the selected element one step backward in the z-order. */
export function sendBackward(history: CommandHistory): void {
  const sel = getSelection()
  if (sel.length !== 1) return
  const el = sel[0]
  const prev = el.previousElementSibling
  if (!prev) return
  history.execute(new ReorderElementCommand(el, prev, 'Send Backward'))
  refreshOverlay()
}

/** Move the selected element to the front of its parent. */
export function bringToFront(history: CommandHistory): void {
  const sel = getSelection()
  if (sel.length !== 1) return
  const el = sel[0]
  history.execute(new ReorderElementCommand(el, null, 'Bring to Front'))
  refreshOverlay()
}

/** Move the selected element to the back of its parent. */
export function sendToBack(history: CommandHistory): void {
  const sel = getSelection()
  if (sel.length !== 1) return
  const el = sel[0]
  const parent = el.parentElement
  if (!parent || parent.firstElementChild === el) return
  history.execute(new ReorderElementCommand(el, parent.firstElementChild, 'Send to Back'))
  refreshOverlay()
}
