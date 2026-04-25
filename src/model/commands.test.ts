import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  CommandHistory,
  AddElementCommand,
  RemoveElementCommand,
  ModifyAttributeCommand,
  ReorderElementCommand,
  GroupCommand,
  UngroupCommand,
  CompoundCommand,
  commandTouchesSource,
} from './commands'
import { createDocumentModel, resetIdCounter } from './document'
import type { DocumentModel } from './document'
import { PRIMARY_LAYER_ID } from './sourceTagging'

function makeSvg(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  const layer = document.createElementNS('http://www.w3.org/2000/svg', 'g')
  layer.setAttribute('data-layer-name', 'Layer 1')
  svg.appendChild(layer)
  document.body.appendChild(svg)
  return svg
}

describe('CommandHistory', () => {
  let history: CommandHistory

  beforeEach(() => {
    history = new CommandHistory()
  })

  it('starts with nothing to undo or redo', () => {
    expect(history.canUndo).toBe(false)
    expect(history.canRedo).toBe(false)
  })

  it('executes a command and enables undo', () => {
    const cmd = { description: 'test', execute: vi.fn(), undo: vi.fn() }
    history.execute(cmd)
    expect(cmd.execute).toHaveBeenCalledOnce()
    expect(history.canUndo).toBe(true)
  })

  it('undoes a command', () => {
    const cmd = { description: 'test', execute: vi.fn(), undo: vi.fn() }
    history.execute(cmd)
    history.undo()
    expect(cmd.undo).toHaveBeenCalledOnce()
    expect(history.canUndo).toBe(false)
    expect(history.canRedo).toBe(true)
  })

  it('redoes a command', () => {
    const cmd = { description: 'test', execute: vi.fn(), undo: vi.fn() }
    history.execute(cmd)
    history.undo()
    history.redo()
    expect(cmd.execute).toHaveBeenCalledTimes(2)
    expect(history.canUndo).toBe(true)
    expect(history.canRedo).toBe(false)
  })

  it('clears redo stack on new command', () => {
    const cmd1 = { description: 'a', execute: vi.fn(), undo: vi.fn() }
    const cmd2 = { description: 'b', execute: vi.fn(), undo: vi.fn() }
    history.execute(cmd1)
    history.undo()
    expect(history.canRedo).toBe(true)
    history.execute(cmd2)
    expect(history.canRedo).toBe(false)
  })

  it('notifies subscribers', () => {
    const listener = vi.fn()
    history.subscribe(listener)
    const cmd = { description: 'test', execute: vi.fn(), undo: vi.fn() }
    history.execute(cmd)
    expect(listener).toHaveBeenCalledOnce()
    history.undo()
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('unsubscribes correctly', () => {
    const listener = vi.fn()
    const unsub = history.subscribe(listener)
    unsub()
    const cmd = { description: 'test', execute: vi.fn(), undo: vi.fn() }
    history.execute(cmd)
    expect(listener).not.toHaveBeenCalled()
  })
})

describe('AddElementCommand', () => {
  let doc: DocumentModel
  let layer: Element

  beforeEach(() => {
    document.body.innerHTML = ''
    resetIdCounter()
    const svg = makeSvg()
    doc = createDocumentModel(svg)
    layer = doc.getActiveLayer()!
  })

  it('adds an element on execute', () => {
    const cmd = new AddElementCommand(doc, layer, 'rect', { width: '50' })
    cmd.execute()
    expect(layer.children.length).toBe(1)
    expect(layer.children[0].tagName).toBe('rect')
  })

  it('removes the element on undo', () => {
    const cmd = new AddElementCommand(doc, layer, 'rect', { width: '50' })
    cmd.execute()
    cmd.undo()
    expect(layer.children.length).toBe(0)
  })

  it('re-adds the same element on redo', () => {
    const cmd = new AddElementCommand(doc, layer, 'rect', { width: '50' })
    cmd.execute()
    const el = cmd.getElement()
    cmd.undo()
    cmd.execute()
    expect(cmd.getElement()).toBe(el) // same DOM node
    expect(layer.children.length).toBe(1)
  })
})

describe('RemoveElementCommand', () => {
  let doc: DocumentModel
  let layer: Element

  beforeEach(() => {
    document.body.innerHTML = ''
    resetIdCounter()
    const svg = makeSvg()
    doc = createDocumentModel(svg)
    layer = doc.getActiveLayer()!
  })

  it('removes an element on execute', () => {
    const el = doc.addElement(layer, 'rect', {})
    expect(layer.children.length).toBe(1)
    const cmd = new RemoveElementCommand(doc, el)
    cmd.execute()
    expect(layer.children.length).toBe(0)
  })

  it('restores the element on undo', () => {
    const el = doc.addElement(layer, 'rect', {})
    const cmd = new RemoveElementCommand(doc, el)
    cmd.execute()
    cmd.undo()
    expect(layer.children.length).toBe(1)
    expect(layer.children[0]).toBe(el)
  })

  it('restores element at correct position among siblings', () => {
    const el1 = doc.addElement(layer, 'rect', { id: 'r1' })
    const el2 = doc.addElement(layer, 'rect', { id: 'r2' })
    const el3 = doc.addElement(layer, 'rect', { id: 'r3' })
    const cmd = new RemoveElementCommand(doc, el2)
    cmd.execute()
    expect(layer.children.length).toBe(2)
    cmd.undo()
    expect(layer.children.length).toBe(3)
    expect(layer.children[0]).toBe(el1)
    expect(layer.children[1]).toBe(el2)
    expect(layer.children[2]).toBe(el3)
  })
})

describe('ModifyAttributeCommand', () => {
  it('changes attribute and restores on undo', () => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    el.setAttribute('fill', 'red')
    const cmd = new ModifyAttributeCommand(el, 'fill', 'blue')
    cmd.execute()
    expect(el.getAttribute('fill')).toBe('blue')
    cmd.undo()
    expect(el.getAttribute('fill')).toBe('red')
  })

  it('removes attribute on undo if it did not exist before', () => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    const cmd = new ModifyAttributeCommand(el, 'stroke', 'black')
    cmd.execute()
    expect(el.getAttribute('stroke')).toBe('black')
    cmd.undo()
    expect(el.hasAttribute('stroke')).toBe(false)
  })
})

describe('CompoundCommand', () => {
  it('executes all commands in order', () => {
    const order: number[] = []
    const cmd1 = { description: 'a', execute: () => order.push(1), undo: () => order.push(-1) }
    const cmd2 = { description: 'b', execute: () => order.push(2), undo: () => order.push(-2) }
    const compound = new CompoundCommand([cmd1, cmd2])
    compound.execute()
    expect(order).toEqual([1, 2])
  })

  it('undoes all commands in reverse order', () => {
    const order: number[] = []
    const cmd1 = { description: 'a', execute: () => order.push(1), undo: () => order.push(-1) }
    const cmd2 = { description: 'b', execute: () => order.push(2), undo: () => order.push(-2) }
    const compound = new CompoundCommand([cmd1, cmd2])
    compound.execute()
    order.length = 0
    compound.undo()
    expect(order).toEqual([-2, -1])
  })
})

describe('Command.touchesSource (graft classification)', () => {
  let svg: SVGSVGElement
  let doc: DocumentModel
  let layer: Element

  beforeEach(() => {
    resetIdCounter()
    svg = makeSvg()
    doc = createDocumentModel(svg)
    layer = svg.querySelector('[data-layer-name]')!
  })

  function addUntaggedRect(): Element {
    const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    layer.appendChild(r)
    return r
  }

  function addTaggedPath(): Element {
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    p.setAttribute('d', 'M0 0 L1 1')
    // Tag only this element — `tagImportedLayer` would walk the whole layer
    // and contaminate previously-added untagged siblings.
    p.setAttribute('data-src-page', '0')
    p.setAttribute('data-src-layer-id', PRIMARY_LAYER_ID)
    layer.appendChild(p)
    return p
  }

  it('AddElementCommand never touches source (new content)', () => {
    const cmd = new AddElementCommand(doc, layer, 'rect', { x: '0', y: '0' })
    expect(cmd.touchesSource()).toBe(false)
  })

  it('RemoveElementCommand: false on new content, true on tagged source content', () => {
    const fresh = addUntaggedRect()
    expect(new RemoveElementCommand(doc, fresh).touchesSource()).toBe(false)
    const fromSource = addTaggedPath()
    expect(new RemoveElementCommand(doc, fromSource).touchesSource()).toBe(true)
  })

  it('ModifyAttributeCommand: false on new, true on tagged', () => {
    const fresh = addUntaggedRect()
    expect(new ModifyAttributeCommand(fresh, 'x', '5').touchesSource()).toBe(false)
    const fromSource = addTaggedPath()
    expect(new ModifyAttributeCommand(fromSource, 'd', 'M2 2').touchesSource()).toBe(true)
  })

  it('ReorderElementCommand: false on new, true on tagged', () => {
    const fresh = addUntaggedRect()
    const fromSource = addTaggedPath()
    expect(new ReorderElementCommand(fresh, null).touchesSource()).toBe(false)
    expect(new ReorderElementCommand(fromSource, null).touchesSource()).toBe(true)
  })

  it('GroupCommand / UngroupCommand: true iff any wrapped child is tagged', () => {
    const fresh = addUntaggedRect()
    const fromSource = addTaggedPath()
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g')

    expect(new GroupCommand(layer, group, [fresh]).touchesSource()).toBe(false)
    expect(new GroupCommand(layer, group, [fresh, fromSource]).touchesSource()).toBe(true)

    const groupWithSource = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    groupWithSource.appendChild(fromSource)
    layer.appendChild(groupWithSource)
    expect(new UngroupCommand(layer, groupWithSource).touchesSource()).toBe(true)
  })

  it('CompoundCommand is the OR of its children', () => {
    const fresh = addUntaggedRect()
    const fromSource = addTaggedPath()
    const sourceMutate = new ModifyAttributeCommand(fromSource, 'd', 'M3 3')
    const freshMutate = new ModifyAttributeCommand(fresh, 'x', '7')

    expect(new CompoundCommand([freshMutate]).touchesSource()).toBe(false)
    expect(new CompoundCommand([freshMutate, sourceMutate]).touchesSource()).toBe(true)
    expect(new CompoundCommand([sourceMutate]).touchesSource()).toBe(true)
  })

  it('commandTouchesSource: false fallback when method absent', () => {
    const legacyCmd = { description: 'x', execute: vi.fn(), undo: vi.fn() }
    expect(commandTouchesSource(legacyCmd)).toBe(false)
  })
})
