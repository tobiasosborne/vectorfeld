/**
 * Text-on-path operations — place text along an SVG path using <textPath>.
 */
import type { DocumentModel } from './document'
import type { CommandHistory } from './commands'
import { CompoundCommand, RemoveElementCommand, AddElementCommand } from './commands'

/**
 * Place text on a path. Requires exactly 1 text element and 1 path element selected.
 * Creates a new <text> element containing a <textPath> referencing the path.
 * The original text element is removed; the path is kept for reference.
 */
export function placeTextOnPath(
  doc: DocumentModel,
  history: CommandHistory,
  textEl: Element,
  pathEl: Element
): void {
  const textContent = textEl.textContent || ''
  if (!textContent.trim()) return

  // Ensure path has an id for href reference
  let pathId = pathEl.getAttribute('id')
  if (!pathId) {
    pathId = doc.addElement(pathEl.parentElement!, 'path', {}).getAttribute('id') || ''
    // Oops — we don't want a new element, just an id. Set it directly.
    pathEl.setAttribute('id', pathId || `vf-path-${Date.now()}`)
    pathId = pathEl.getAttribute('id')!
  }

  const parent = textEl.parentElement
  if (!parent) return

  // Collect text style attributes
  const styleAttrs: Record<string, string> = {}
  for (const attr of ['font-size', 'font-family', 'font-weight', 'font-style',
    'fill', 'stroke', 'stroke-width', 'opacity', 'letter-spacing']) {
    const val = textEl.getAttribute(attr)
    if (val) styleAttrs[attr] = val
  }

  // Build new text element with textPath child
  // We'll use AddElementCommand for the text, then manually add textPath
  const cmds: Array<{ execute(): void; undo(): void; description: string }> = []
  cmds.push(new RemoveElementCommand(doc, textEl))

  const addCmd = new AddElementCommand(doc, parent, 'text', styleAttrs)
  cmds.push(addCmd)

  // After executing, we need to add the textPath child
  const compound = new CompoundCommand(cmds, 'Place Text on Path')
  history.execute(compound)

  // Now find the newly added text element and append textPath
  const newTextEl = addCmd.getElement()
  if (newTextEl) {
    const textPathEl = document.createElementNS('http://www.w3.org/2000/svg', 'textPath')
    textPathEl.setAttribute('href', `#${pathId}`)
    textPathEl.setAttribute('startOffset', '0%')
    textPathEl.textContent = textContent
    newTextEl.appendChild(textPathEl)
  }
}

/**
 * Release text from a path. Converts a textPath back to a standalone text element.
 */
export function releaseTextFromPath(
  doc: DocumentModel,
  history: CommandHistory,
  textEl: Element
): void {
  const textPath = textEl.querySelector('textPath')
  if (!textPath) return

  const textContent = textPath.textContent || ''
  const parent = textEl.parentElement
  if (!parent) return

  // Collect style attributes
  const styleAttrs: Record<string, string> = {}
  for (const attr of ['font-size', 'font-family', 'font-weight', 'font-style',
    'fill', 'stroke', 'stroke-width', 'opacity', 'letter-spacing']) {
    const val = textEl.getAttribute(attr)
    if (val) styleAttrs[attr] = val
  }

  // Get approximate position from the referenced path
  const pathRef = textPath.getAttribute('href')?.replace('#', '')
  const pathEl = pathRef ? doc.svg.querySelector(`#${pathRef}`) : null
  const x = pathEl?.getAttribute('x') || textEl.getAttribute('x') || '0'
  const y = pathEl?.getAttribute('y') || textEl.getAttribute('y') || '0'

  const cmds: Array<{ execute(): void; undo(): void; description: string }> = []
  cmds.push(new RemoveElementCommand(doc, textEl))

  const addCmd = new AddElementCommand(doc, parent, 'text', { ...styleAttrs, x, y })
  cmds.push(addCmd)

  history.execute(new CompoundCommand(cmds, 'Release Text from Path'))

  // Set text content on the new element
  const newEl = addCmd.getElement()
  if (newEl) {
    newEl.textContent = textContent
  }
}

/**
 * Check if a text element has a textPath child.
 */
export function hasTextPath(el: Element): boolean {
  return el.tagName === 'text' && el.querySelector('textPath') !== null
}
