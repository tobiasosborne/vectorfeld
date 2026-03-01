import { describe, it, expect, beforeEach } from 'vitest'
import {
  ReorderElementCommand,
  GroupCommand,
  UngroupCommand,
} from './commands'

const SVG_NS = 'http://www.w3.org/2000/svg'

/** Helper: create an SVG element with an optional id. */
function el(tag: string, id?: string): Element {
  const e = document.createElementNS(SVG_NS, tag)
  if (id) e.setAttribute('id', id)
  return e
}

// ---------------------------------------------------------------------------
// ReorderElementCommand
// ---------------------------------------------------------------------------

describe('ReorderElementCommand', () => {
  let parent: Element
  let a: Element
  let b: Element
  let c: Element

  beforeEach(() => {
    document.body.innerHTML = ''
    parent = el('g', 'parent')
    a = el('rect', 'A')
    b = el('rect', 'B')
    c = el('rect', 'C')
    parent.appendChild(a)
    parent.appendChild(b)
    parent.appendChild(c)
    document.body.appendChild(parent)
  })

  function childIds(): string[] {
    return Array.from(parent.children).map((e) => e.getAttribute('id')!)
  }

  it('execute() moves element before newNextSibling', () => {
    // Move C before A  ->  C, A, B
    const cmd = new ReorderElementCommand(c, a)
    cmd.execute()
    expect(childIds()).toEqual(['C', 'A', 'B'])
  })

  it('execute() appends to end when newNextSibling is null', () => {
    // Move A to end  ->  B, C, A
    const cmd = new ReorderElementCommand(a, null)
    cmd.execute()
    expect(childIds()).toEqual(['B', 'C', 'A'])
  })

  it('undo() restores original position', () => {
    // Move C before A, then undo  ->  A, B, C
    const cmd = new ReorderElementCommand(c, a)
    cmd.execute()
    expect(childIds()).toEqual(['C', 'A', 'B'])
    cmd.undo()
    expect(childIds()).toEqual(['A', 'B', 'C'])
  })

  it('redo (execute again) after undo works correctly', () => {
    const cmd = new ReorderElementCommand(c, a)
    cmd.execute()
    cmd.undo()
    expect(childIds()).toEqual(['A', 'B', 'C'])
    // redo
    cmd.execute()
    expect(childIds()).toEqual(['C', 'A', 'B'])
  })

  it('undo() appends to end when element was originally last', () => {
    // Move C (last child) before B  ->  A, C, B
    const cmd = new ReorderElementCommand(c, b)
    cmd.execute()
    expect(childIds()).toEqual(['A', 'C', 'B'])
    cmd.undo()
    // C was originally last (no nextSibling), so undo appends it
    expect(childIds()).toEqual(['A', 'B', 'C'])
  })

  it('uses custom description when provided', () => {
    const cmd = new ReorderElementCommand(a, c, 'Move to front')
    expect(cmd.description).toBe('Move to front')
  })

  it('uses default description when none provided', () => {
    const cmd = new ReorderElementCommand(a, c)
    expect(cmd.description).toBe('Reorder')
  })
})

// ---------------------------------------------------------------------------
// GroupCommand
// ---------------------------------------------------------------------------

describe('GroupCommand', () => {
  let parent: Element
  let a: Element
  let b: Element
  let c: Element
  let group: Element

  beforeEach(() => {
    document.body.innerHTML = ''
    parent = el('g', 'parent')
    a = el('rect', 'A')
    b = el('rect', 'B')
    c = el('rect', 'C')
    parent.appendChild(a)
    parent.appendChild(b)
    parent.appendChild(c)
    group = el('g', 'group')
    document.body.appendChild(parent)
  })

  it('execute() creates group containing children, inserted at first child position', () => {
    // Group A and B
    const cmd = new GroupCommand(parent, group, [a, b])
    cmd.execute()

    // group should be where A was (before C)
    expect(parent.children[0]).toBe(group)
    expect(parent.children[1]).toBe(c)
    expect(parent.children.length).toBe(2)

    // A and B are inside the group
    expect(group.children[0]).toBe(a)
    expect(group.children[1]).toBe(b)
    expect(group.children.length).toBe(2)
  })

  it('undo() moves children back to parent and removes group', () => {
    const cmd = new GroupCommand(parent, group, [a, b])
    cmd.execute()
    cmd.undo()

    // Children are back in parent, before where the group was
    expect(parent.contains(a)).toBe(true)
    expect(parent.contains(b)).toBe(true)
    expect(parent.contains(group)).toBe(false)
    expect(parent.children.length).toBe(3)

    // Order should be: A, B, C (children inserted before the group, then group removed)
    const ids = Array.from(parent.children).map((e) => e.getAttribute('id'))
    expect(ids).toEqual(['A', 'B', 'C'])
  })

  it('redo works correctly', () => {
    const cmd = new GroupCommand(parent, group, [a, b])
    cmd.execute()
    cmd.undo()

    // redo
    cmd.execute()
    expect(parent.children[0]).toBe(group)
    expect(parent.children[1]).toBe(c)
    expect(group.children[0]).toBe(a)
    expect(group.children[1]).toBe(b)
  })

  it('groups all children of the parent', () => {
    const cmd = new GroupCommand(parent, group, [a, b, c])
    cmd.execute()

    expect(parent.children.length).toBe(1)
    expect(parent.children[0]).toBe(group)
    expect(group.children.length).toBe(3)
  })

  it('groups a single child', () => {
    const cmd = new GroupCommand(parent, group, [b])
    cmd.execute()

    // group inserted where B was (between A and C)
    expect(parent.children[0]).toBe(a)
    expect(parent.children[1]).toBe(group)
    expect(parent.children[2]).toBe(c)
    expect(group.children[0]).toBe(b)
  })
})

// ---------------------------------------------------------------------------
// UngroupCommand
// ---------------------------------------------------------------------------

describe('UngroupCommand', () => {
  let parent: Element
  let group: Element
  let x: Element
  let y: Element
  let after: Element

  beforeEach(() => {
    document.body.innerHTML = ''
    parent = el('g', 'parent')
    group = el('g', 'group')
    x = el('rect', 'X')
    y = el('rect', 'Y')
    after = el('rect', 'after')

    group.appendChild(x)
    group.appendChild(y)
    parent.appendChild(group)
    parent.appendChild(after)
    document.body.appendChild(parent)
  })

  it('execute() moves children out of group, removes group', () => {
    const cmd = new UngroupCommand(parent, group)
    cmd.execute()

    // Group should be removed
    expect(parent.contains(group)).toBe(false)

    // Children are now direct children of parent, before 'after'
    const ids = Array.from(parent.children).map((e) => e.getAttribute('id'))
    expect(ids).toEqual(['X', 'Y', 'after'])
  })

  it('undo() re-creates group with children', () => {
    const cmd = new UngroupCommand(parent, group)
    cmd.execute()
    cmd.undo()

    // Group is re-inserted before 'after'
    expect(parent.contains(group)).toBe(true)
    expect(group.children[0]).toBe(x)
    expect(group.children[1]).toBe(y)

    const ids = Array.from(parent.children).map((e) => e.getAttribute('id'))
    expect(ids).toEqual(['group', 'after'])
  })

  it('redo works correctly', () => {
    const cmd = new UngroupCommand(parent, group)
    cmd.execute()
    cmd.undo()

    // redo
    cmd.execute()
    expect(parent.contains(group)).toBe(false)

    const ids = Array.from(parent.children).map((e) => e.getAttribute('id'))
    expect(ids).toEqual(['X', 'Y', 'after'])
  })

  it('handles ungrouping when group is the last child', () => {
    // Rearrange: group is the last child (no nextSibling)
    parent.innerHTML = ''
    const before = el('rect', 'before')
    group.appendChild(x)
    group.appendChild(y)
    parent.appendChild(before)
    parent.appendChild(group)

    const cmd = new UngroupCommand(parent, group)
    cmd.execute()

    const ids = Array.from(parent.children).map((e) => e.getAttribute('id'))
    expect(ids).toEqual(['before', 'X', 'Y'])

    // undo re-inserts group at end (no nextSibling -> appendChild)
    cmd.undo()
    const idsAfterUndo = Array.from(parent.children).map((e) => e.getAttribute('id'))
    expect(idsAfterUndo).toEqual(['before', 'group'])
    expect(group.children.length).toBe(2)
  })

  it('handles ungrouping a group with a single child', () => {
    group.innerHTML = ''
    const solo = el('rect', 'solo')
    group.appendChild(solo)

    const cmd = new UngroupCommand(parent, group)
    cmd.execute()

    expect(parent.contains(group)).toBe(false)
    expect(parent.contains(solo)).toBe(true)
  })
})
