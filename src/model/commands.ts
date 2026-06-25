import type { DocumentModel } from './document'
import { isFromSource } from './sourceTagging'
import { parseTransform, multiplyMatrix, matrixToString } from './matrix'

export interface Command {
  readonly description: string
  execute(): void
  undo(): void
  /**
   * Optional. True iff this command mutates an element that originated from
   * a source PDF (tagged with `data-src-page` / `data-src-layer-id`). The
   * graft export engine (`vectorfeld-wjj`) reads this to decide per-element:
   *   - false (or absent) → graft from source byte-for-byte
   *   - true              → re-render via overlay content stream
   * Defaults to false (the safe choice — overlay-render is always correct,
   * just slower). CompoundCommand returns the OR of its children.
   * See `vectorfeld-5gk`.
   */
  touchesSource?(): boolean
}

/** Safe accessor: returns false when the command doesn't implement it. */
export function commandTouchesSource(cmd: Command): boolean {
  return cmd.touchesSource ? cmd.touchesSource() : false
}

const MAX_HISTORY = 200

export class CommandHistory {
  private undoStack: Command[] = []
  private redoStack: Command[] = []
  private listeners: Array<() => void> = []

  execute(cmd: Command): void {
    cmd.execute()
    this.undoStack.push(cmd)
    if (this.undoStack.length > MAX_HISTORY) {
      this.undoStack.splice(0, this.undoStack.length - MAX_HISTORY)
    }
    this.redoStack = []
    this.notify()
  }

  undo(): void {
    const cmd = this.undoStack.pop()
    if (!cmd) return
    cmd.undo()
    this.redoStack.push(cmd)
    this.notify()
  }

  redo(): void {
    const cmd = this.redoStack.pop()
    if (!cmd) return
    cmd.execute()
    this.undoStack.push(cmd)
    this.notify()
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0
  }

  subscribe(fn: () => void): () => void {
    this.listeners.push(fn)
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn)
    }
  }

  private notify(): void {
    this.listeners.forEach((fn) => fn())
  }
}

export class AddElementCommand implements Command {
  readonly description: string
  private doc: DocumentModel
  private parent: Element
  private tag: string
  private attrs: Record<string, string>
  private element: Element | null = null

  constructor(doc: DocumentModel, parent: Element, tag: string, attrs: Record<string, string>) {
    this.doc = doc
    this.parent = parent
    this.tag = tag
    this.attrs = attrs
    this.description = `Add ${tag}`
  }

  execute(): void {
    if (this.element) {
      // Re-add to parent if parent is still in the DOM
      if (this.parent.isConnected) {
        this.parent.appendChild(this.element)
      }
    } else {
      this.element = this.doc.addElement(this.parent, this.tag, this.attrs)
    }
  }

  undo(): void {
    if (this.element && this.element.parentElement) {
      this.doc.removeElement(this.element)
    }
  }

  getElement(): Element | null {
    return this.element
  }

  touchesSource(): boolean {
    // Add introduces a fresh, untagged element — overlay-only.
    return false
  }
}

export class RemoveElementCommand implements Command {
  readonly description: string
  private doc: DocumentModel
  private element: Element
  private removedParent: Element | null = null
  private nextSibling: Element | null = null

  constructor(doc: DocumentModel, element: Element) {
    this.doc = doc
    this.element = element
    this.description = `Remove ${element.tagName}`
  }

  execute(): void {
    const result = this.doc.removeElement(this.element)
    this.removedParent = result.parent
    this.nextSibling = result.nextSibling
  }

  undo(): void {
    if (!this.removedParent) return
    if (this.nextSibling) {
      this.removedParent.insertBefore(this.element, this.nextSibling)
    } else {
      this.removedParent.appendChild(this.element)
    }
  }

  touchesSource(): boolean {
    return isFromSource(this.element)
  }
}

export class ModifyAttributeCommand implements Command {
  readonly description: string
  private element: Element
  private attr: string
  private newValue: string
  private oldValue: string | null = null

  constructor(element: Element, attr: string, newValue: string) {
    this.element = element
    this.attr = attr
    this.newValue = newValue
    this.description = `Change ${attr}`
  }

  execute(): void {
    this.oldValue = this.element.getAttribute(this.attr)
    this.element.setAttribute(this.attr, this.newValue)
  }

  undo(): void {
    if (this.oldValue === null) {
      this.element.removeAttribute(this.attr)
    } else {
      this.element.setAttribute(this.attr, this.oldValue)
    }
  }

  touchesSource(): boolean {
    return isFromSource(this.element)
  }
}

export class ReorderElementCommand implements Command {
  readonly description: string
  private element: Element
  private parent: Element
  private oldNextSibling: Element | null = null
  private newNextSibling: Element | null

  constructor(element: Element, newNextSibling: Element | null, description?: string) {
    this.element = element
    this.parent = element.parentElement!
    this.newNextSibling = newNextSibling
    this.description = description ?? 'Reorder'
  }

  execute(): void {
    this.oldNextSibling = this.element.nextElementSibling
    if (this.newNextSibling) {
      this.parent.insertBefore(this.element, this.newNextSibling)
    } else {
      this.parent.appendChild(this.element)
    }
  }

  undo(): void {
    if (this.oldNextSibling) {
      this.parent.insertBefore(this.element, this.oldNextSibling)
    } else {
      this.parent.appendChild(this.element)
    }
  }

  touchesSource(): boolean {
    return isFromSource(this.element)
  }
}

/** Per-child provenance captured before execute() moves anything. */
interface ChildOrigin {
  el: Element
  parent: Element
  nextSibling: Element | null
}

export class GroupCommand implements Command {
  readonly description = 'Group'
  private parent: Element
  private group: Element
  private children: Element[]
  private insertBefore: Element | null
  /**
   * Per-child provenance captured at construction time (before execute() moves
   * any child into the group). Used by undo() to restore each child to its
   * ORIGINAL layer/parent at its original document position, regardless of
   * whether the selection spans multiple layers.
   *
   * Without this, undo() restored ALL children into sel[0]'s layer, silently
   * emptying other layers (vectorfeld-3yu.11).
   */
  private origins: ChildOrigin[]

  constructor(parent: Element, group: Element, children: Element[]) {
    this.parent = parent
    this.group = group
    this.children = [...children]
    this.insertBefore = children[0] // insert group where first child was
    // Capture provenance now, while each child is still in its original parent.
    this.origins = this.children.map((child) => ({
      el: child,
      parent: child.parentElement!,
      nextSibling: child.nextElementSibling,
    }))
  }

  execute(): void {
    this.parent.insertBefore(this.group, this.insertBefore)
    for (const child of this.children) {
      this.group.appendChild(child)
    }
  }

  undo(): void {
    // Restore in reverse order so that when we restore child[i], its captured
    // nextSibling (child[i+1]) is typically already back in the DOM, maximising
    // correct sibling placement. The connectivity guard makes either order safe.
    for (let i = this.origins.length - 1; i >= 0; i--) {
      const o = this.origins[i]
      // Connectivity guard: only use the captured nextSibling as the reference
      // if it is still in the DOM and is a child of the target parent. Otherwise
      // fall back to append (null ref), which is always safe and avoids the
      // NotFoundError that a dangling/ungrouped sibling would cause.
      const ref =
        o.nextSibling !== null &&
        o.nextSibling.isConnected &&
        o.nextSibling.parentElement === o.parent
          ? o.nextSibling
          : null
      o.parent.insertBefore(o.el, ref)
    }
    this.group.remove()
  }

  touchesSource(): boolean {
    return this.children.some(isFromSource)
  }
}

export class UngroupCommand implements Command {
  readonly description = 'Ungroup'
  private parent: Element
  private group: Element
  private children: Element[]
  private groupNextSibling: Element | null
  /**
   * Original `transform` attribute of each child captured at construction
   * (null when the attribute was absent). Used to (a) bake the group transform
   * from the pristine original on every execute()/redo() so redo is idempotent
   * (no double-bake), and (b) restore the byte-exact original string on undo().
   */
  private originalTransforms: Map<Element, string | null>

  constructor(parent: Element, group: Element) {
    this.parent = parent
    this.group = group
    this.children = Array.from(group.children)
    this.groupNextSibling = group.nextElementSibling
    this.originalTransforms = new Map(
      this.children.map((child) => [child, child.getAttribute('transform')])
    )
  }

  execute(): void {
    // In SVG a child's effective transform is `group ∘ child`. When we reparent
    // the child out of the <g>, the group's own transform vanishes, so we must
    // bake it into each child to keep them in place. We bake from the CAPTURED
    // ORIGINAL (not the current attribute) so redo after undo re-bakes exactly
    // once and is idempotent.
    //
    // NOTE: this distributes ONLY the `transform`. Imported groups can survive
    // sanitizeSvgTree carrying clip-path/mask/filter/opacity/style/class; those
    // are NOT distributed to children here and would be lost on ungroup. See
    // follow-up bead (non-transform group properties). Out of scope for this fix.
    const groupTransform = this.group.getAttribute('transform')

    // Fast path: a transform-less group needs no baking. Keep the cheap reparent
    // so child transform strings stay byte-identical (avoids float churn /
    // golden drift).
    if (groupTransform !== null) {
      const groupM = parseTransform(groupTransform)
      for (const child of this.children) {
        const original = this.originalTransforms.get(child) ?? null
        const baked = multiplyMatrix(groupM, parseTransform(original ?? ''))
        child.setAttribute('transform', matrixToString(baked))
      }
    }

    // Move children out of group, before the group
    for (const child of this.children) {
      this.parent.insertBefore(child, this.group)
    }
    this.group.remove()
  }

  undo(): void {
    // Re-insert group and move children back into it
    if (this.groupNextSibling) {
      this.parent.insertBefore(this.group, this.groupNextSibling)
    } else {
      this.parent.appendChild(this.group)
    }
    for (const child of this.children) {
      this.group.appendChild(child)
      // Restore the exact original transform string (removeAttribute when the
      // child originally had no transform attribute).
      const original = this.originalTransforms.get(child) ?? null
      if (original === null) {
        child.removeAttribute('transform')
      } else {
        child.setAttribute('transform', original)
      }
    }
  }

  touchesSource(): boolean {
    return this.children.some(isFromSource)
  }
}

export class CompoundCommand implements Command {
  readonly description: string
  private commands: Command[]

  constructor(commands: Command[], description?: string) {
    this.commands = commands
    this.description = description ?? commands.map((c) => c.description).join(', ')
  }

  execute(): void {
    for (const cmd of this.commands) {
      cmd.execute()
    }
  }

  undo(): void {
    for (let i = this.commands.length - 1; i >= 0; i--) {
      this.commands[i].undo()
    }
  }

  touchesSource(): boolean {
    return this.commands.some(commandTouchesSource)
  }
}
