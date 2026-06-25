/**
 * Clipboard operations: copy, cut, paste, duplicate.
 * Extracted from EditorContext for testability.
 */

import { AddElementCommand, RemoveElementCommand, CompoundCommand } from './commands'
import type { CommandHistory } from './commands'
import type { DocumentModel } from './document'
import { generateId } from './document'
import { computeTranslateAttrs } from './geometry'
import { sanitizeSvgTree } from './fileio'
import { getSelection, setSelection, clearSelection } from './selection'

const PASTE_OFFSET = 5

/**
 * Rewrite all [id] attributes inside `root` (including `root` itself) to fresh
 * generated ids, then remap any intra-subtree url(#old) / #old references on
 * the load-bearing presentation attributes and href attributes.
 *
 * IMPORTANT: only ids that exist INSIDE the copied subtree are remapped.
 * References to shared <defs> ids (e.g. vf-marker-*, shared gradients) are
 * intentionally left untouched because their target is NOT in the Map.
 */
function uniquifyIds(root: Element): void {
  // Pass 1: collect all [id] elements within the subtree and allocate fresh ids.
  const idMap = new Map<string, string>()

  if (root.hasAttribute('id')) {
    idMap.set(root.getAttribute('id')!, generateId())
  }
  for (const el of root.querySelectorAll('[id]')) {
    idMap.set(el.getAttribute('id')!, generateId())
  }

  // Apply the new ids.
  if (root.hasAttribute('id')) {
    root.setAttribute('id', idMap.get(root.getAttribute('id')!)!)
  }
  for (const el of root.querySelectorAll('[id]')) {
    const oldId = el.getAttribute('id')!
    el.setAttribute('id', idMap.get(oldId)!)
  }

  // Pass 2: rewrite intra-subtree references on the subtree (root + all descendants).
  const REF_ATTRS = ['fill', 'stroke', 'marker-start', 'marker-mid', 'marker-end', 'clip-path', 'mask', 'filter']
  const allNodes: Element[] = [root, ...Array.from(root.querySelectorAll('*'))]

  for (const el of allNodes) {
    // url(#old) attributes
    for (const attr of REF_ATTRS) {
      const val = el.getAttribute(attr)
      if (val) {
        const m = val.match(/^url\(#(.+)\)$/)
        if (m && idMap.has(m[1])) {
          el.setAttribute(attr, `url(#${idMap.get(m[1])})`)
        }
      }
    }
    // href / xlink:href of the form "#old"
    for (const hrefAttr of ['href', 'xlink:href']) {
      const val = el.getAttribute(hrefAttr)
      if (val && val.startsWith('#')) {
        const oldId = val.slice(1)
        if (idMap.has(oldId)) {
          el.setAttribute(hrefAttr, `#${idMap.get(oldId)}`)
        }
      }
    }
  }
}

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
 * Paste elements from clipboard into the active layer.
 *
 * `offset` controls how far the pasted copy is shifted from the original.
 * Defaults to PASTE_OFFSET (5mm, Illustrator-style duplicate). Pass `0`
 * for "Paste in Place" — exact-overlay behaviour used when compositing
 * imported PDF elements onto an existing background.
 */
export function pasteClipboard(
  clipboard: { current: string[] },
  history: CommandHistory,
  doc: DocumentModel,
  offset: number = PASTE_OFFSET,
): void {
  if (clipboard.current.length === 0) return
  const layer = doc.getActiveLayer()
  if (!layer) return

  const cmds: AddElementCommand[] = []
  for (const html of clipboard.current) {
    const temp = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    temp.innerHTML = html
    sanitizeSvgTree(temp)
    const original = temp.firstElementChild
    if (!original) continue

    // Collect base attributes from the serialized element
    const attrs: Record<string, string> = {}
    for (const attr of original.attributes) {
      attrs[attr.name] = attr.value
    }

    // Apply paste offset via computeTranslateAttrs (skip if offset=0 for
    // Paste in Place — preserves exact source coordinates).
    const tag = original.tagName
    if (offset !== 0) {
      const changes = computeTranslateAttrs(original, offset, offset)
      for (const [key, value] of changes) {
        attrs[key] = value
      }
    }

    attrs.id = generateId()
    const cmd = new AddElementCommand(doc, layer, tag, attrs)
    cmds.push(cmd)
  }

  if (cmds.length > 0) {
    const compound = new CompoundCommand(cmds, 'Paste')
    history.execute(compound)
    // Transfer child nodes from parsed originals into the newly created elements
    for (let i = 0; i < cmds.length; i++) {
      const created = cmds[i].getElement()
      if (!created) continue
      const temp = document.createElementNS('http://www.w3.org/2000/svg', 'g')
      temp.innerHTML = clipboard.current[i]
      const original = temp.firstElementChild
      if (!original) continue
      while (original.firstChild) {
        created.appendChild(original.firstChild)
      }
      // Regenerate all descendant ids and remap intra-subtree refs so that
      // pasted containers never share ids with the originals (invalid SVG).
      uniquifyIds(created)
    }
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
