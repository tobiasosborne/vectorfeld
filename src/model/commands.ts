import type { DocumentModel } from './document'
import { isFromSource } from './sourceTagging'

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

export class GroupCommand implements Command {
  readonly description = 'Group'
  private parent: Element
  private group: Element
  private children: Element[]
  private insertBefore: Element | null

  constructor(parent: Element, group: Element, children: Element[]) {
    this.parent = parent
    this.group = group
    this.children = [...children]
    this.insertBefore = children[0] // insert group where first child was
  }

  execute(): void {
    this.parent.insertBefore(this.group, this.insertBefore)
    for (const child of this.children) {
      this.group.appendChild(child)
    }
  }

  undo(): void {
    // Move children back to parent, before the group
    for (const child of this.children) {
      this.parent.insertBefore(child, this.group)
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

  constructor(parent: Element, group: Element) {
    this.parent = parent
    this.group = group
    this.children = Array.from(group.children)
    this.groupNextSibling = group.nextElementSibling
  }

  execute(): void {
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
