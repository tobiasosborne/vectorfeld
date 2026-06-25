import { describe, it, expect, beforeEach } from 'vitest'
import {
  ReorderElementCommand,
  GroupCommand,
  UngroupCommand,
} from './commands'
import {
  parseTransform,
  multiplyMatrix,
  applyMatrixToPoint,
  type Matrix,
} from './matrix'

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

  // -------------------------------------------------------------------------
  // Cross-layer group + undo (vectorfeld-3yu.11): undo must restore each child
  // to its ORIGINAL layer, not dump everything into sel[0]'s layer.
  // -------------------------------------------------------------------------

  it('(cross-layer) undo restores each child to its original layer', () => {
    // Two separate layers, one element each.
    document.body.innerHTML = ''
    const p1 = el('g', 'layer1')
    const p2 = el('g', 'layer2')
    const aEl = el('rect', 'a')
    const bEl = el('rect', 'b')
    p1.appendChild(aEl)
    p2.appendChild(bEl)
    const root = document.createElementNS(SVG_NS, 'svg')
    root.appendChild(p1)
    root.appendChild(p2)
    document.body.appendChild(root)

    const grp = el('g', 'group')
    // GroupCommand is constructed with p1 as the nominal "parent" (sel[0]'s layer),
    // but bEl lives in p2. The fix captures per-child provenance.
    const cmd = new GroupCommand(p1, grp, [aEl, bEl])
    cmd.execute()

    // Both should be inside the group now.
    expect(grp.contains(aEl)).toBe(true)
    expect(grp.contains(bEl)).toBe(true)

    cmd.undo()

    // Each child must be back in its ORIGINAL layer — not both dumped into p1.
    expect(p1.children.length).toBe(1)
    expect(p1.children[0]).toBe(aEl)
    expect(p2.children.length).toBe(1)
    expect(p2.children[0]).toBe(bEl)
    expect(p1.contains(grp)).toBe(false)
    expect(p2.contains(grp)).toBe(false)
  })

  it('(cross-layer) redo after cross-layer undo re-groups correctly', () => {
    document.body.innerHTML = ''
    const p1 = el('g', 'layer1')
    const p2 = el('g', 'layer2')
    const aEl = el('rect', 'a')
    const bEl = el('rect', 'b')
    p1.appendChild(aEl)
    p2.appendChild(bEl)
    const root = document.createElementNS(SVG_NS, 'svg')
    root.appendChild(p1)
    root.appendChild(p2)
    document.body.appendChild(root)

    const grp = el('g', 'group')
    const cmd = new GroupCommand(p1, grp, [aEl, bEl])
    cmd.execute()
    cmd.undo()
    // redo
    cmd.execute()

    expect(grp.contains(aEl)).toBe(true)
    expect(grp.contains(bEl)).toBe(true)
    expect(p1.contains(grp)).toBe(true)
    expect(grp.children.length).toBe(2)
  })

  it('(within-layer) A,B,C group [a,b] undo does NOT throw and restores A,B,C order', () => {
    // Locks the NotFoundError fix: nextSibling of A is B (another grouped child),
    // so without the connectivity guard the naive insertBefore would throw.
    // origins: A.nextSib=B, B.nextSib=C. Restore reverse: B before C, then A before B → [A,B,C].
    const cmd = new GroupCommand(parent, group, [a, b])
    cmd.execute()
    expect(() => cmd.undo()).not.toThrow()
    const ids = Array.from(parent.children).map((e) => e.getAttribute('id'))
    expect(ids).toEqual(['A', 'B', 'C'])
  })

  it('(selection-order != document-order) undo still restores each child to its origin', () => {
    // Children passed in reverse document order: [C, A] instead of [A, C].
    // origins: C.nextSib=null (last child), A.nextSib=B.
    const cmd = new GroupCommand(parent, group, [c, a])
    cmd.execute()

    // group is inserted where C was (insertBefore = children[0] = C, so group before C)
    // Actually C is the first element in the children array, so group inserts before C.
    // After execute, parent has: [B, group], group has [C, A].
    cmd.undo()

    // C was originally last in parent (nextSib=null → append), A was before B (nextSib=B).
    // Reverse restore: i=1 (A): nextSib=B, B is connected and in parent → insertBefore(A, B) → parent=[A, B]
    // i=0 (C): nextSib=null → appendChild → parent=[A, B, C]
    expect(parent.children.length).toBe(3)
    expect(parent.contains(a)).toBe(true)
    expect(parent.contains(b)).toBe(true)
    expect(parent.contains(c)).toBe(true)
    expect(parent.contains(group)).toBe(false)
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

  // -------------------------------------------------------------------------
  // Transform baking (vectorfeld-3yu.4): ungrouping a transformed group must
  // bake the group's transform into each child (group ∘ child) so the child's
  // effective transform is preserved once it loses the group as an ancestor.
  // -------------------------------------------------------------------------

  /** Compare two matrices componentwise within float tolerance. */
  function expectMatrixClose(actual: Matrix, expected: Matrix, eps = 1e-6) {
    for (let i = 0; i < 6; i++) {
      expect(actual[i]).toBeCloseTo(expected[i], 5)
    }
    void eps
  }

  it('(a) bakes a translate group transform into the child (group ∘ child, child has none)', () => {
    group.setAttribute('transform', 'translate(10,20)')
    // x has no transform of its own.
    const groupM = parseTransform('translate(10,20)')

    const cmd = new UngroupCommand(parent, group)
    cmd.execute()

    const childM = parseTransform(x.getAttribute('transform') ?? '')
    // Effective child transform must equal groupM ∘ childM (childM = identity).
    expectMatrixClose(childM, multiplyMatrix(groupM, parseTransform('')))
  })

  it('(b) composes group ∘ child in the correct order when the child has its own transform', () => {
    group.setAttribute('transform', 'translate(10,20)')
    x.setAttribute('transform', 'translate(3,4)')
    const groupM = parseTransform('translate(10,20)')
    const childM = parseTransform('translate(3,4)')

    const cmd = new UngroupCommand(parent, group)
    cmd.execute()

    const baked = parseTransform(x.getAttribute('transform') ?? '')
    expectMatrixClose(baked, multiplyMatrix(groupM, childM))
    // Sanity: order matters. group∘child translate = (13,24), not commuted away.
    const p = applyMatrixToPoint(baked, 0, 0)
    expect(p.x).toBeCloseTo(13, 5)
    expect(p.y).toBeCloseTo(24, 5)
  })

  it('(c) rotate(90,5,5) group: a child corner maps via groupM ∘ childM', () => {
    group.setAttribute('transform', 'rotate(90,5,5)')
    const groupM = parseTransform('rotate(90,5,5)')

    const cmd = new UngroupCommand(parent, group)
    cmd.execute()

    const baked = parseTransform(x.getAttribute('transform') ?? '')
    // Pick an arbitrary local point and check it maps the same as groupM does
    // (child had no transform, so effective = groupM).
    const local = { x: 10, y: 7 }
    const viaBaked = applyMatrixToPoint(baked, local.x, local.y)
    const viaGroup = applyMatrixToPoint(groupM, local.x, local.y)
    expect(viaBaked.x).toBeCloseTo(viaGroup.x, 5)
    expect(viaBaked.y).toBeCloseTo(viaGroup.y, 5)
  })

  it('(d) skewed group (matrix with shear) composes the child correctly', () => {
    // matrix(1, 0, 0.5, 1, 3, 4) is a horizontal shear plus translate.
    group.setAttribute('transform', 'matrix(1, 0, 0.5, 1, 3, 4)')
    x.setAttribute('transform', 'scale(2,2)')
    const groupM = parseTransform('matrix(1, 0, 0.5, 1, 3, 4)')
    const childM = parseTransform('scale(2,2)')

    const cmd = new UngroupCommand(parent, group)
    cmd.execute()

    const baked = parseTransform(x.getAttribute('transform') ?? '')
    expectMatrixClose(baked, multiplyMatrix(groupM, childM))
  })

  it('(e) undo restores the EXACT original child transform string (incl. null→removed)', () => {
    group.setAttribute('transform', 'translate(10,20)')
    // x has its own transform, y has none.
    x.setAttribute('transform', 'rotate(15)')
    expect(y.hasAttribute('transform')).toBe(false)

    const cmd = new UngroupCommand(parent, group)
    cmd.execute()
    // After execute, both were baked.
    expect(x.getAttribute('transform')).not.toBe('rotate(15)')
    expect(y.hasAttribute('transform')).toBe(true)

    cmd.undo()
    // Byte-exact restore.
    expect(x.getAttribute('transform')).toBe('rotate(15)')
    expect(y.hasAttribute('transform')).toBe(false)
  })

  it('(f) redo equals first execute — re-bakes from captured original, no double-bake', () => {
    group.setAttribute('transform', 'translate(10,20)')
    x.setAttribute('transform', 'translate(3,4)')

    const cmd = new UngroupCommand(parent, group)
    cmd.execute()
    const afterFirst = x.getAttribute('transform')

    cmd.undo()
    cmd.execute() // redo
    const afterRedo = x.getAttribute('transform')

    // String-identical: the bake is computed from the pristine captured original
    // each time, so there is no cumulative drift.
    expect(afterRedo).toBe(afterFirst)
  })

  it('(g) no-transform group leaves the child transform string-IDENTICAL (fast path)', () => {
    // Group has NO transform attribute.
    expect(group.hasAttribute('transform')).toBe(false)
    x.setAttribute('transform', 'translate(3,4)')

    const cmd = new UngroupCommand(parent, group)
    cmd.execute()

    // Cheap reparent: child string is byte-identical, no matrix() rewrite.
    expect(x.getAttribute('transform')).toBe('translate(3,4)')
    expect(y.hasAttribute('transform')).toBe(false)
  })
})
