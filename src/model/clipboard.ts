/**
 * Clipboard operations: copy, cut, paste, duplicate.
 * Extracted from EditorContext for testability.
 */

import { AddElementCommand, RemoveElementCommand, CompoundCommand } from './commands'
import type { CommandHistory } from './commands'
import type { DocumentModel } from './document'
import { generateId } from './document'
import { computeTranslateAttrs } from './geometry'
import { getSelection, setSelection, clearSelection } from './selection'

const PASTE_OFFSET = 5

/** Serialize the current selection into an array of XML strings. */
export function copySelection(): string[] {
  const sel = getSelection()
  if (sel.length === 0) return []
  const serializer = new XMLSerializer()
  return sel.map((el) => serializer.serializeToString(el))
}

/** Copy the current selection, then remove it via RemoveElementCommand. */
export function cutSelection(clipboard: { current: string[] }, history: CommandHistory, doc: DocumentModel): void {
  const sel = getSelection()
  if (sel.length === 0) return
  clipboard.current = copySelection()
  const cmds = sel.map((el) => new RemoveElementCommand(doc, el))
  history.execute(new CompoundCommand(cmds, 'Cut'))
  clearSelection()
}

/**
 * Paste elements from clipboard into the active layer with a 5mm offset.
 * Uses computeTranslateAttrs from geometry.ts for position offset.
 */
export function pasteClipboard(clipboard: { current: string[] }, history: CommandHistory, doc: DocumentModel): void {
  if (clipboard.current.length === 0) return
  const layer = doc.getActiveLayer()
  if (!layer) return

  const cmds: AddElementCommand[] = []
  for (const html of clipboard.current) {
    const temp = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    temp.innerHTML = html
    const original = temp.firstElementChild
    if (!original) continue

    // Collect base attributes from the serialized element
    const attrs: Record<string, string> = {}
    for (const attr of original.attributes) {
      attrs[attr.name] = attr.value
    }

    // Apply paste offset via computeTranslateAttrs
    const tag = original.tagName
    const changes = computeTranslateAttrs(original, PASTE_OFFSET, PASTE_OFFSET)
    for (const [key, value] of changes) {
      attrs[key] = value
    }

    attrs.id = generateId()
    const cmd = new AddElementCommand(doc, layer, tag, attrs)
    cmds.push(cmd)
  }

  if (cmds.length > 0) {
    const compound = new CompoundCommand(cmds, 'Paste')
    history.execute(compound)
    const pasted = cmds.map((c) => c.getElement()).filter(Boolean) as Element[]
    setSelection(pasted)
  }
}

/** Copy the current selection into the clipboard and immediately paste it. */
export function duplicateSelection(clipboard: { current: string[] }, history: CommandHistory, doc: DocumentModel): void {
  const sel = getSelection()
  if (sel.length === 0) return
  clipboard.current = copySelection()
  pasteClipboard(clipboard, history, doc)
}
