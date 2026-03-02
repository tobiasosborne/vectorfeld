/**
 * Clipping masks — use one shape to clip another.
 * Creates <clipPath> in <defs> and sets clip-path attribute.
 */

import type { DocumentModel } from './document'
import { generateId } from './document'
import type { CommandHistory, Command } from './commands'
import { CompoundCommand } from './commands'

/** Check if an element has a clip-path attribute */
export function hasClipPath(el: Element): boolean {
  return !!el.getAttribute('clip-path')
}

/**
 * Make clipping mask command.
 * The clipShape is moved into a <clipPath> in defs, and the target gets clip-path="url(#...)".
 */
export class ClipMaskCommand implements Command {
  readonly description = 'Make Clipping Mask'
  private clipPathId: string
  private clipPathEl: SVGClipPathElement | null = null
  private originalParent: Element | null = null
  private originalNextSibling: Node | null = null

  constructor(
    private doc: DocumentModel,
    private target: Element,
    private clipShape: Element
  ) {
    this.clipPathId = generateId()
  }

  execute(): void {
    const defs = this.doc.getDefs()
    // Save original position for undo
    this.originalParent = this.clipShape.parentElement
    this.originalNextSibling = this.clipShape.nextSibling

    // Create clipPath element
    this.clipPathEl = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath')
    this.clipPathEl.setAttribute('id', this.clipPathId)
    // Clone the clip shape into clipPath (keeping original for undo)
    const clone = this.clipShape.cloneNode(true)
    this.clipPathEl.appendChild(clone)
    defs.appendChild(this.clipPathEl)

    // Remove clip shape from layer
    this.clipShape.remove()

    // Set clip-path on target
    this.target.setAttribute('clip-path', `url(#${this.clipPathId})`)
  }

  undo(): void {
    // Remove clip-path attribute
    this.target.removeAttribute('clip-path')

    // Remove clipPath from defs
    this.clipPathEl?.remove()

    // Restore clip shape to original position
    if (this.originalParent) {
      if (this.originalNextSibling) {
        this.originalParent.insertBefore(this.clipShape, this.originalNextSibling)
      } else {
        this.originalParent.appendChild(this.clipShape)
      }
    }
  }
}

/**
 * Release clipping mask command.
 * Moves the clip shape back into the layer and removes the clip-path attribute.
 */
export class ReleaseClipMaskCommand implements Command {
  readonly description = 'Release Clipping Mask'
  private clipPathId: string = ''
  private clipPathEl: Element | null = null
  private restoredShape: Element | null = null

  constructor(
    private doc: DocumentModel,
    private target: Element
  ) {}

  execute(): void {
    const clipUrl = this.target.getAttribute('clip-path')
    if (!clipUrl) return
    const match = clipUrl.match(/url\(#([^)]+)\)/)
    if (!match) return
    this.clipPathId = match[1]

    const defs = this.doc.getDefs()
    this.clipPathEl = defs.querySelector(`#${this.clipPathId}`)
    if (!this.clipPathEl) return

    // Get the first child of the clipPath (the clip shape)
    const shape = this.clipPathEl.firstElementChild
    if (!shape) return

    // Clone shape back into the layer
    this.restoredShape = shape.cloneNode(true) as Element
    this.restoredShape.setAttribute('id', generateId())
    const parent = this.target.parentElement
    if (parent) {
      parent.insertBefore(this.restoredShape, this.target.nextSibling)
    }

    // Remove clip-path attribute and clipPath element
    this.target.removeAttribute('clip-path')
    this.clipPathEl.remove()
  }

  undo(): void {
    if (!this.clipPathEl || !this.restoredShape) return
    // Re-add clipPath to defs
    this.doc.getDefs().appendChild(this.clipPathEl)
    // Re-set clip-path attribute
    this.target.setAttribute('clip-path', `url(#${this.clipPathId})`)
    // Remove restored shape
    this.restoredShape.remove()
  }
}

/**
 * Apply a clipping mask using the selection.
 * Expects exactly 2 elements: bottom = target, top = clip shape.
 */
export function makeClippingMask(
  doc: DocumentModel,
  history: CommandHistory,
  elements: Element[]
): boolean {
  if (elements.length !== 2) return false
  // Last in DOM order = top = clip shape
  const [target, clipShape] = elements
  const cmd = new ClipMaskCommand(doc, target, clipShape)
  history.execute(cmd)
  return true
}

/**
 * Release a clipping mask from the selected element.
 */
export function releaseClippingMask(
  doc: DocumentModel,
  history: CommandHistory,
  el: Element
): boolean {
  if (!hasClipPath(el)) return false
  const cmd = new ReleaseClipMaskCommand(doc, el)
  history.execute(cmd)
  return true
}
