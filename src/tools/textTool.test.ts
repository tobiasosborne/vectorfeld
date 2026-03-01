import { describe, it, expect, beforeEach } from 'vitest'
import { createTextTool } from './textTool'
import { createDocumentModel, resetIdCounter } from '../model/document'
import { CommandHistory } from '../model/commands'
import { setKeyboardCapture, isKeyboardCaptured, clearRegistry } from './registry'
import type { DocumentModel } from '../model/document'

function makeSvg(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 210 297')
  Object.defineProperty(svg, 'clientWidth', { value: 800, writable: true })
  Object.defineProperty(svg, 'clientHeight', { value: 600, writable: true })
  const layer = document.createElementNS('http://www.w3.org/2000/svg', 'g')
  layer.setAttribute('data-layer-name', 'Layer 1')
  svg.appendChild(layer)
  document.body.appendChild(svg)
  return svg
}

function mockScreenToDoc(svg: SVGSVGElement) {
  const scaleX = 210 / 800
  const scaleY = 297 / 600
  svg.getScreenCTM = () =>
    ({
      a: 1 / scaleX,
      b: 0,
      c: 0,
      d: 1 / scaleY,
      e: 0,
      f: 0,
      inverse() {
        return { a: scaleX, b: 0, c: 0, d: scaleY, e: 0, f: 0 }
      },
    }) as unknown as DOMMatrix
  svg.createSVGPoint = () =>
    ({
      x: 0,
      y: 0,
      matrixTransform(m: DOMMatrix) {
        return { x: this.x * (m as unknown as { a: number }).a, y: this.y * (m as unknown as { d: number }).d }
      },
    }) as unknown as SVGPoint
}

describe('Text Tool', () => {
  let svg: SVGSVGElement
  let doc: DocumentModel
  let history: CommandHistory

  beforeEach(() => {
    document.body.innerHTML = ''
    resetIdCounter()
    clearRegistry()
    setKeyboardCapture(false)
    svg = makeSvg()
    mockScreenToDoc(svg)
    doc = createDocumentModel(svg)
    history = new CommandHistory()
  })

  function makeTool() {
    return createTextTool(
      () => svg,
      () => doc,
      () => history
    )
  }

  function mouseEvent(clientX: number, clientY: number, button = 0): MouseEvent {
    return new MouseEvent('mousedown', { clientX, clientY, button })
  }

  function keyEvent(key: string, opts?: Partial<KeyboardEventInit>): KeyboardEvent {
    return new KeyboardEvent('keydown', { key, ...opts })
  }

  it('has correct name, icon, and shortcut', () => {
    const tool = makeTool()
    expect(tool.name).toBe('text')
    expect(tool.icon).toBe('T')
    expect(tool.shortcut).toBe('t')
  })

  it('enters editing mode on click', () => {
    const tool = makeTool()
    tool.handlers.onMouseDown!(mouseEvent(400, 300))

    // Should have preview text and caret
    const preview = svg.querySelector('text[data-role="preview"]')
    expect(preview).not.toBeNull()
    const caret = svg.querySelector('line[data-role="preview"]')
    expect(caret).not.toBeNull()
  })

  it('sets keyboard capture when editing', () => {
    const tool = makeTool()
    expect(isKeyboardCaptured()).toBe(false)
    tool.handlers.onMouseDown!(mouseEvent(400, 300))
    expect(isKeyboardCaptured()).toBe(true)
  })

  it('adds typed characters to preview text', () => {
    const tool = makeTool()
    tool.handlers.onMouseDown!(mouseEvent(400, 300))
    tool.handlers.onKeyDown!(keyEvent('H'))
    tool.handlers.onKeyDown!(keyEvent('i'))

    const preview = svg.querySelector('text[data-role="preview"]')
    expect(preview!.textContent).toBe('Hi')
  })

  it('handles backspace to delete characters', () => {
    const tool = makeTool()
    tool.handlers.onMouseDown!(mouseEvent(400, 300))
    tool.handlers.onKeyDown!(keyEvent('A'))
    tool.handlers.onKeyDown!(keyEvent('B'))
    tool.handlers.onKeyDown!(keyEvent('C'))
    tool.handlers.onKeyDown!(keyEvent('Backspace'))

    const preview = svg.querySelector('text[data-role="preview"]')
    expect(preview!.textContent).toBe('AB')
  })

  it('commits text on Enter', () => {
    const tool = makeTool()
    tool.handlers.onMouseDown!(mouseEvent(400, 300))
    tool.handlers.onKeyDown!(keyEvent('H'))
    tool.handlers.onKeyDown!(keyEvent('e'))
    tool.handlers.onKeyDown!(keyEvent('l'))
    tool.handlers.onKeyDown!(keyEvent('l'))
    tool.handlers.onKeyDown!(keyEvent('o'))
    tool.handlers.onKeyDown!(keyEvent('Enter'))

    const layer = svg.querySelector('g[data-layer-name]')!
    const textEl = layer.querySelector('text')
    expect(textEl).not.toBeNull()
    expect(textEl!.textContent).toBe('Hello')
    expect(textEl!.getAttribute('font-family')).toBe('sans-serif')
    expect(textEl!.getAttribute('fill')).toBe('#000000')
  })

  it('commits text on Escape', () => {
    const tool = makeTool()
    tool.handlers.onMouseDown!(mouseEvent(400, 300))
    tool.handlers.onKeyDown!(keyEvent('T'))
    tool.handlers.onKeyDown!(keyEvent('e'))
    tool.handlers.onKeyDown!(keyEvent('s'))
    tool.handlers.onKeyDown!(keyEvent('t'))
    tool.handlers.onKeyDown!(keyEvent('Escape'))

    const layer = svg.querySelector('g[data-layer-name]')!
    const textEl = layer.querySelector('text')
    expect(textEl).not.toBeNull()
    expect(textEl!.textContent).toBe('Test')
  })

  it('clears keyboard capture on commit', () => {
    const tool = makeTool()
    tool.handlers.onMouseDown!(mouseEvent(400, 300))
    expect(isKeyboardCaptured()).toBe(true)

    tool.handlers.onKeyDown!(keyEvent('A'))
    tool.handlers.onKeyDown!(keyEvent('Enter'))
    expect(isKeyboardCaptured()).toBe(false)
  })

  it('cleans up preview elements on commit', () => {
    const tool = makeTool()
    tool.handlers.onMouseDown!(mouseEvent(400, 300))
    tool.handlers.onKeyDown!(keyEvent('X'))
    tool.handlers.onKeyDown!(keyEvent('Enter'))

    const previews = svg.querySelectorAll('[data-role="preview"]')
    expect(previews.length).toBe(0)
  })

  it('does not commit empty text', () => {
    const tool = makeTool()
    tool.handlers.onMouseDown!(mouseEvent(400, 300))
    tool.handlers.onKeyDown!(keyEvent('Enter'))

    const layer = svg.querySelector('g[data-layer-name]')!
    expect(layer.querySelector('text')).toBeNull()
  })

  it('committed text is undoable', () => {
    const tool = makeTool()
    tool.handlers.onMouseDown!(mouseEvent(400, 300))
    tool.handlers.onKeyDown!(keyEvent('A'))
    tool.handlers.onKeyDown!(keyEvent('B'))
    tool.handlers.onKeyDown!(keyEvent('Enter'))

    const layer = svg.querySelector('g[data-layer-name]')!
    expect(layer.querySelector('text')).not.toBeNull()

    history.undo()
    expect(layer.querySelector('text')).toBeNull()

    history.redo()
    const redone = layer.querySelector('text')
    expect(redone).not.toBeNull()
    expect(redone!.textContent).toBe('AB')
  })

  it('commits current text and starts new on clicking elsewhere', () => {
    const tool = makeTool()
    tool.handlers.onMouseDown!(mouseEvent(400, 300))
    tool.handlers.onKeyDown!(keyEvent('A'))

    // Click elsewhere to commit and start new
    tool.handlers.onMouseDown!(mouseEvent(600, 500))

    const layer = svg.querySelector('g[data-layer-name]')!
    expect(layer.querySelectorAll('text').length).toBe(1)
    expect(layer.querySelector('text')!.textContent).toBe('A')
  })

  it('ignores Ctrl key combos', () => {
    const tool = makeTool()
    tool.handlers.onMouseDown!(mouseEvent(400, 300))
    tool.handlers.onKeyDown!(keyEvent('z', { ctrlKey: true }))

    const preview = svg.querySelector('text[data-role="preview"]')
    expect(preview!.textContent).toBe('')
  })

  it('ignores non-left mouse button', () => {
    const tool = makeTool()
    tool.handlers.onMouseDown!(mouseEvent(400, 300, 2)) // right click

    const previews = svg.querySelectorAll('[data-role="preview"]')
    expect(previews.length).toBe(0)
  })
})
