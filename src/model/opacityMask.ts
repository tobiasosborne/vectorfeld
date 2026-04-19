/**
 * Opacity masks — use one shape's luminance to mask another.
 * Creates <mask> in <defs> and sets mask attribute.
 * Mirrors the clipping.ts pattern exactly.
 */

import type { DocumentModel } from './document'
import { generateId } from './document'
import type { CommandHistory, Command } from './commands'

export function hasMask(el: Element): boolean {
  return !!el.getAttribute('mask')
}

export class MaskCommand implements Command {
  readonly description = 'Make Opacity Mask'
  private maskId: string
  private maskEl: SVGMaskElement | null = null
  private originalParent: Element | null = null
  private originalNextSibling: Node | null = null
  private doc: DocumentModel
  private target: Element
  private maskShape: Element

  constructor(doc: DocumentModel, target: Element, maskShape: Element) {
    this.doc = doc
    this.target = target
    this.maskShape = maskShape
    this.maskId = generateId()
  }

  execute(): void {
    this.originalParent = this.maskShape.parentElement
    this.originalNextSibling = this.maskShape.nextSibling

    this.maskEl = document.createElementNS('http://www.w3.org/2000/svg', 'mask')
    this.maskEl.setAttribute('id', this.maskId)
    this.maskEl.appendChild(this.maskShape.cloneNode(true))
    this.doc.getDefs().appendChild(this.maskEl)

    this.maskShape.remove()
    this.target.setAttribute('mask', `url(#${this.maskId})`)
  }

  undo(): void {
    this.target.removeAttribute('mask')
    this.maskEl?.remove()
    if (this.originalParent) {
      if (this.originalNextSibling) {
        this.originalParent.insertBefore(this.maskShape, this.originalNextSibling)
      } else {
        this.originalParent.appendChild(this.maskShape)
      }
    }
  }
}

export class ReleaseMaskCommand implements Command {
  readonly description = 'Release Opacity Mask'
  private maskId = ''
  private maskEl: Element | null = null
  private restoredShape: Element | null = null
  private doc: DocumentModel
  private target: Element

  constructor(doc: DocumentModel, target: Element) {
    this.doc = doc
    this.target = target
  }

  execute(): void {
    const maskUrl = this.target.getAttribute('mask')
    if (!maskUrl) return
    const match = maskUrl.match(/url\(#([^)]+)\)/)
    if (!match) return
    this.maskId = match[1]

    this.maskEl = this.doc.getDefs().querySelector(`#${this.maskId}`)
    if (!this.maskEl) return

    const shape = this.maskEl.firstElementChild
    if (!shape) return

    this.restoredShape = shape.cloneNode(true) as Element
    this.restoredShape.setAttribute('id', generateId())
    const parent = this.target.parentElement
    if (parent) parent.insertBefore(this.restoredShape, this.target.nextSibling)

    this.target.removeAttribute('mask')
    this.maskEl.remove()
  }

  undo(): void {
    if (!this.maskEl || !this.restoredShape) return
    this.doc.getDefs().appendChild(this.maskEl)
    this.target.setAttribute('mask', `url(#${this.maskId})`)
    this.restoredShape.remove()
  }
}

export function makeOpacityMask(
  doc: DocumentModel,
  history: CommandHistory,
  elements: Element[]
): boolean {
  if (elements.length !== 2) return false
  const [target, maskShape] = elements
  history.execute(new MaskCommand(doc, target, maskShape))
  return true
}

export function releaseOpacityMask(
  doc: DocumentModel,
  history: CommandHistory,
  el: Element
): boolean {
  if (!hasMask(el)) return false
  history.execute(new ReleaseMaskCommand(doc, el))
  return true
}
