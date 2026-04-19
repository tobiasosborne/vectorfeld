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
      a: 1 / scaleX, b: 0, c: 0, d: 1 / scaleY, e: 0, f: 0,
      inverse() { return { a: scaleX, b: 0, c: 0, d: scaleY, e: 0, f: 0 } },
    }) as unknown as DOMMatrix
  svg.createSVGPoint = () =>
    ({
      x: 0, y: 0,
      matrixTransform(this: { x: number; y: number }, m: DOMMatrix) {
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
    return createTextTool(() => svg, () => doc, () => history)
  }

  function mouseEvent(x: number, y: number, button = 0): MouseEvent {
    return new MouseEvent('mousedown', { clientX: x, clientY: y, button })
  }

  function key(k: string, opts?: Partial<KeyboardEventInit>): KeyboardEvent {
    return new KeyboardEvent('keydown', { key: k, ...opts })
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
    expect(svg.querySelector('text[data-role="preview"]')).not.toBeNull()
    expect(isKeyboardCaptured()).toBe(true)
  })

  it('adds typed characters', () => {
    const tool = makeTool()
    tool.handlers.onMouseDown!(mouseEvent(400, 300))
    tool.handlers.onKeyDown!(key('H'))
    tool.handlers.onKeyDown!(key('i'))
    expect(svg.querySelector('text[data-role="preview"]')!.textContent).toBe('Hi')
  })

  it('commits text on Enter', () => {
    const tool = makeTool()
    tool.handlers.onMouseDown!(mouseEvent(400, 300))
    tool.handlers.onKeyDown!(key('A'))
    tool.handlers.onKeyDown!(key('B'))
    tool.handlers.onKeyDown!(key('Enter'))
    const layer = svg.querySelector('g[data-layer-name]')!
    expect(layer.querySelector('text')!.textContent).toBe('AB')
    expect(isKeyboardCaptured()).toBe(false)
  })

  it('commits on Escape', () => {
    const tool = makeTool()
    tool.handlers.onMouseDown!(mouseEvent(400, 300))
    tool.handlers.onKeyDown!(key('X'))
    tool.handlers.onKeyDown!(key('Escape'))
    expect(svg.querySelector('g[data-layer-name]')!.querySelector('text')!.textContent).toBe('X')
  })

  it('does not commit empty text', () => {
    const tool = makeTool()
    tool.handlers.onMouseDown!(mouseEvent(400, 300))
    tool.handlers.onKeyDown!(key('Enter'))
    expect(svg.querySelector('g[data-layer-name]')!.querySelector('text')).toBeNull()
  })

  it('committed text is undoable', () => {
    const tool = makeTool()
    tool.handlers.onMouseDown!(mouseEvent(400, 300))
    tool.handlers.onKeyDown!(key('A'))
    tool.handlers.onKeyDown!(key('Enter'))
    const layer = svg.querySelector('g[data-layer-name]')!
    expect(layer.querySelector('text')).not.toBeNull()
    history.undo()
    expect(layer.querySelector('text')).toBeNull()
    history.redo()
    expect(layer.querySelector('text')!.textContent).toBe('A')
  })

  // Cursor navigation tests
  describe('cursor navigation', () => {
    it('inserts at cursor position after ArrowLeft', () => {
      const tool = makeTool()
      tool.handlers.onMouseDown!(mouseEvent(400, 300))
      tool.handlers.onKeyDown!(key('A'))
      tool.handlers.onKeyDown!(key('B'))
      tool.handlers.onKeyDown!(key('ArrowLeft'))
      tool.handlers.onKeyDown!(key('X'))
      const preview = svg.querySelector('text[data-role="preview"]')!
      expect(preview.textContent).toBe('AXB')
    })

    it('handles ArrowRight after ArrowLeft', () => {
      const tool = makeTool()
      tool.handlers.onMouseDown!(mouseEvent(400, 300))
      tool.handlers.onKeyDown!(key('A'))
      tool.handlers.onKeyDown!(key('B'))
      tool.handlers.onKeyDown!(key('ArrowLeft'))
      tool.handlers.onKeyDown!(key('ArrowRight'))
      tool.handlers.onKeyDown!(key('C'))
      expect(svg.querySelector('text[data-role="preview"]')!.textContent).toBe('ABC')
    })

    it('Home moves cursor to start', () => {
      const tool = makeTool()
      tool.handlers.onMouseDown!(mouseEvent(400, 300))
      tool.handlers.onKeyDown!(key('A'))
      tool.handlers.onKeyDown!(key('B'))
      tool.handlers.onKeyDown!(key('Home'))
      tool.handlers.onKeyDown!(key('X'))
      expect(svg.querySelector('text[data-role="preview"]')!.textContent).toBe('XAB')
    })

    it('End moves cursor to end', () => {
      const tool = makeTool()
      tool.handlers.onMouseDown!(mouseEvent(400, 300))
      tool.handlers.onKeyDown!(key('A'))
      tool.handlers.onKeyDown!(key('B'))
      tool.handlers.onKeyDown!(key('Home'))
      tool.handlers.onKeyDown!(key('End'))
      tool.handlers.onKeyDown!(key('C'))
      expect(svg.querySelector('text[data-role="preview"]')!.textContent).toBe('ABC')
    })

    it('Backspace deletes character before cursor', () => {
      const tool = makeTool()
      tool.handlers.onMouseDown!(mouseEvent(400, 300))
      tool.handlers.onKeyDown!(key('A'))
      tool.handlers.onKeyDown!(key('B'))
      tool.handlers.onKeyDown!(key('C'))
      tool.handlers.onKeyDown!(key('ArrowLeft'))
      tool.handlers.onKeyDown!(key('Backspace'))
      expect(svg.querySelector('text[data-role="preview"]')!.textContent).toBe('AC')
    })

    it('Delete removes character after cursor', () => {
      const tool = makeTool()
      tool.handlers.onMouseDown!(mouseEvent(400, 300))
      tool.handlers.onKeyDown!(key('A'))
      tool.handlers.onKeyDown!(key('B'))
      tool.handlers.onKeyDown!(key('C'))
      tool.handlers.onKeyDown!(key('Home'))
      tool.handlers.onKeyDown!(key('Delete'))
      expect(svg.querySelector('text[data-role="preview"]')!.textContent).toBe('BC')
    })
  })

  describe('text selection', () => {
    it('Shift+ArrowLeft selects text', () => {
      const tool = makeTool()
      tool.handlers.onMouseDown!(mouseEvent(400, 300))
      tool.handlers.onKeyDown!(key('A'))
      tool.handlers.onKeyDown!(key('B'))
      tool.handlers.onKeyDown!(key('C'))
      tool.handlers.onKeyDown!(key('ArrowLeft', { shiftKey: true }))
      tool.handlers.onKeyDown!(key('ArrowLeft', { shiftKey: true }))
      // Typing replaces selection
      tool.handlers.onKeyDown!(key('X'))
      expect(svg.querySelector('text[data-role="preview"]')!.textContent).toBe('AX')
    })

    it('Ctrl+A selects all', () => {
      const tool = makeTool()
      tool.handlers.onMouseDown!(mouseEvent(400, 300))
      tool.handlers.onKeyDown!(key('H'))
      tool.handlers.onKeyDown!(key('e'))
      tool.handlers.onKeyDown!(key('l'))
      tool.handlers.onKeyDown!(key('l'))
      tool.handlers.onKeyDown!(key('o'))
      tool.handlers.onKeyDown!(key('a', { ctrlKey: true }))
      tool.handlers.onKeyDown!(key('X'))
      expect(svg.querySelector('text[data-role="preview"]')!.textContent).toBe('X')
    })

    it('Backspace deletes selection', () => {
      const tool = makeTool()
      tool.handlers.onMouseDown!(mouseEvent(400, 300))
      tool.handlers.onKeyDown!(key('A'))
      tool.handlers.onKeyDown!(key('B'))
      tool.handlers.onKeyDown!(key('C'))
      tool.handlers.onKeyDown!(key('ArrowLeft', { shiftKey: true }))
      tool.handlers.onKeyDown!(key('ArrowLeft', { shiftKey: true }))
      tool.handlers.onKeyDown!(key('Backspace'))
      expect(svg.querySelector('text[data-role="preview"]')!.textContent).toBe('A')
    })
  })
})
