import { describe, it, expect, beforeEach } from 'vitest'
import { createPenTool } from './penTool'
import { createDocumentModel, resetIdCounter } from '../model/document'
import { CommandHistory } from '../model/commands'
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
  // Mock getScreenCTM to return identity-like transform for testing
  // viewBox 0 0 210 297, clientWidth 800, clientHeight 600
  // scale: 210/800 = 0.2625 per pixel
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

describe('Pen Tool', () => {
  let svg: SVGSVGElement
  let doc: DocumentModel
  let history: CommandHistory

  beforeEach(() => {
    document.body.innerHTML = ''
    resetIdCounter()
    svg = makeSvg()
    mockScreenToDoc(svg)
    doc = createDocumentModel(svg)
    history = new CommandHistory()
  })

  function makeTool() {
    return createPenTool(
      () => svg,
      () => doc,
      () => history
    )
  }

  function mouseEvent(clientX: number, clientY: number, button = 0): MouseEvent {
    return new MouseEvent('mousedown', { clientX, clientY, button })
  }

  function mouseMoveEvent(clientX: number, clientY: number): MouseEvent {
    return new MouseEvent('mousemove', { clientX, clientY })
  }

  function keyEvent(key: string): KeyboardEvent {
    return new KeyboardEvent('keydown', { key })
  }

  it('has correct name, icon, and shortcut', () => {
    const tool = makeTool()
    expect(tool.name).toBe('pen')
    expect(tool.icon).toBe('P')
    expect(tool.shortcut).toBe('p')
  })

  it('creates a preview path on first click', () => {
    const tool = makeTool()
    tool.handlers.onMouseDown!(mouseEvent(100, 100))

    const preview = svg.querySelector('path[data-role="preview"]')
    expect(preview).not.toBeNull()
    expect(preview!.getAttribute('d')).toContain('M')
  })

  it('creates a preview rubber-band line on first click', () => {
    const tool = makeTool()
    tool.handlers.onMouseDown!(mouseEvent(100, 100))

    const line = svg.querySelector('line[data-role="preview"]')
    expect(line).not.toBeNull()
    expect(line!.getAttribute('stroke-dasharray')).toBe('2 1')
  })

  it('creates an anchor point on first click', () => {
    const tool = makeTool()
    tool.handlers.onMouseDown!(mouseEvent(100, 100))

    const anchors = svg.querySelectorAll('rect[data-role="preview"]')
    expect(anchors.length).toBe(1)
  })

  it('adds anchor points on subsequent clicks', () => {
    const tool = makeTool()
    tool.handlers.onMouseDown!(mouseEvent(100, 100))
    tool.handlers.onMouseDown!(mouseEvent(200, 200))
    tool.handlers.onMouseDown!(mouseEvent(300, 150))

    const anchors = svg.querySelectorAll('rect[data-role="preview"]')
    expect(anchors.length).toBe(3)
  })

  it('updates preview path d attribute on each click', () => {
    const tool = makeTool()
    tool.handlers.onMouseDown!(mouseEvent(100, 100))
    tool.handlers.onMouseDown!(mouseEvent(200, 200))

    const path = svg.querySelector('path[data-role="preview"]')
    const d = path!.getAttribute('d')!
    expect(d).toContain('M')
    expect(d).toContain('L')
  })

  it('updates rubber-band line on mouse move', () => {
    const tool = makeTool()
    tool.handlers.onMouseDown!(mouseEvent(100, 100))
    tool.handlers.onMouseMove!(mouseMoveEvent(200, 200))

    const line = svg.querySelector('line[data-role="preview"]')
    // Line endpoint should have been updated
    const x2 = parseFloat(line!.getAttribute('x2')!)
    const y2 = parseFloat(line!.getAttribute('y2')!)
    expect(x2).toBeGreaterThan(0)
    expect(y2).toBeGreaterThan(0)
  })

  it('commits path to document on Enter key', () => {
    const tool = makeTool()
    tool.handlers.onMouseDown!(mouseEvent(100, 100))
    tool.handlers.onMouseDown!(mouseEvent(200, 200))
    tool.handlers.onMouseDown!(mouseEvent(300, 150))
    tool.handlers.onKeyDown!(keyEvent('Enter'))

    const layer = svg.querySelector('g[data-layer-name]')!
    const path = layer.querySelector('path')
    expect(path).not.toBeNull()
    expect(path!.getAttribute('d')).toContain('M')
    expect(path!.getAttribute('d')).toContain('L')
    expect(path!.getAttribute('fill')).toBe('none')
    expect(path!.getAttribute('stroke')).toBe('#000000')
  })

  it('cleans up preview elements on Enter', () => {
    const tool = makeTool()
    tool.handlers.onMouseDown!(mouseEvent(100, 100))
    tool.handlers.onMouseDown!(mouseEvent(200, 200))
    tool.handlers.onKeyDown!(keyEvent('Enter'))

    const previews = svg.querySelectorAll('[data-role="preview"]')
    expect(previews.length).toBe(0)
  })

  it('cancels on Escape — no path added', () => {
    const tool = makeTool()
    tool.handlers.onMouseDown!(mouseEvent(100, 100))
    tool.handlers.onMouseDown!(mouseEvent(200, 200))
    tool.handlers.onKeyDown!(keyEvent('Escape'))

    const layer = svg.querySelector('g[data-layer-name]')!
    expect(layer.querySelector('path')).toBeNull()
    const previews = svg.querySelectorAll('[data-role="preview"]')
    expect(previews.length).toBe(0)
  })

  it('does not commit with less than 2 points', () => {
    const tool = makeTool()
    tool.handlers.onMouseDown!(mouseEvent(100, 100))
    tool.handlers.onKeyDown!(keyEvent('Enter'))

    const layer = svg.querySelector('g[data-layer-name]')!
    expect(layer.querySelector('path')).toBeNull()
  })

  it('committed path is undoable', () => {
    const tool = makeTool()
    tool.handlers.onMouseDown!(mouseEvent(100, 100))
    tool.handlers.onMouseDown!(mouseEvent(200, 200))
    tool.handlers.onKeyDown!(keyEvent('Enter'))

    const layer = svg.querySelector('g[data-layer-name]')!
    expect(layer.querySelector('path')).not.toBeNull()

    history.undo()
    expect(layer.querySelector('path')).toBeNull()

    history.redo()
    expect(layer.querySelector('path')).not.toBeNull()
  })

  it('can start a new path after finishing one', () => {
    const tool = makeTool()
    // First path
    tool.handlers.onMouseDown!(mouseEvent(100, 100))
    tool.handlers.onMouseDown!(mouseEvent(200, 200))
    tool.handlers.onKeyDown!(keyEvent('Enter'))

    // Second path
    tool.handlers.onMouseDown!(mouseEvent(300, 300))
    tool.handlers.onMouseDown!(mouseEvent(400, 400))
    tool.handlers.onKeyDown!(keyEvent('Enter'))

    const layer = svg.querySelector('g[data-layer-name]')!
    const paths = layer.querySelectorAll('path')
    expect(paths.length).toBe(2)
  })

  it('ignores non-left mouse button clicks', () => {
    const tool = makeTool()
    tool.handlers.onMouseDown!(mouseEvent(100, 100, 2)) // right click

    const previews = svg.querySelectorAll('[data-role="preview"]')
    expect(previews.length).toBe(0)
  })

  // S8-03: Close path by clicking first anchor
  describe('close path by clicking first anchor', () => {
    it('closes path with Z when clicking near first anchor', () => {
      const tool = makeTool()
      // Place 3 points (screen coords → doc coords via mock)
      // scaleX = 210/800 = 0.2625, so screen 100 → doc 26.25
      tool.handlers.onMouseDown!(mouseEvent(100, 100))
      tool.handlers.onMouseDown!(mouseEvent(300, 100))
      tool.handlers.onMouseDown!(mouseEvent(300, 300))
      // Click very close to first point to close
      tool.handlers.onMouseDown!(mouseEvent(101, 101))

      const layer = svg.querySelector('g[data-layer-name]')!
      const path = layer.querySelector('path')
      expect(path).not.toBeNull()
      expect(path!.getAttribute('d')).toContain('Z')
    })

    it('highlights first anchor when cursor is near it', () => {
      const tool = makeTool()
      tool.handlers.onMouseDown!(mouseEvent(100, 100))
      tool.handlers.onMouseDown!(mouseEvent(300, 200))

      // Move near first anchor
      tool.handlers.onMouseMove!(mouseMoveEvent(101, 101))

      const firstAnchor = svg.querySelectorAll('rect[data-role="preview"]')[0]
      expect(firstAnchor.getAttribute('fill')).toBe('#ff4444')
    })

    it('reverts first anchor color when cursor moves away', () => {
      const tool = makeTool()
      tool.handlers.onMouseDown!(mouseEvent(100, 100))
      tool.handlers.onMouseDown!(mouseEvent(300, 200))

      // Move near, then away
      tool.handlers.onMouseMove!(mouseMoveEvent(101, 101))
      tool.handlers.onMouseMove!(mouseMoveEvent(400, 400))

      const firstAnchor = svg.querySelectorAll('rect[data-role="preview"]')[0]
      expect(firstAnchor.getAttribute('fill')).toBe('#2563eb')
    })

    it('does not close path if only one point placed', () => {
      const tool = makeTool()
      tool.handlers.onMouseDown!(mouseEvent(100, 100))
      // Click same position — should be treated as adding a second point, not closing
      tool.handlers.onMouseDown!(mouseEvent(101, 101))

      const layer = svg.querySelector('g[data-layer-name]')!
      expect(layer.querySelector('path')).toBeNull()
      // Should still be drawing (2 points placed)
      const anchors = svg.querySelectorAll('rect[data-role="preview"]')
      expect(anchors.length).toBe(2)
    })
  })

  // S8-04: Finish open path with Enter or double-click
  describe('finish open path', () => {
    it('finishes path on Enter without Z', () => {
      const tool = makeTool()
      tool.handlers.onMouseDown!(mouseEvent(100, 100))
      tool.handlers.onMouseDown!(mouseEvent(300, 200))
      tool.handlers.onKeyDown!(keyEvent('Enter'))

      const layer = svg.querySelector('g[data-layer-name]')!
      const path = layer.querySelector('path')
      expect(path).not.toBeNull()
      expect(path!.getAttribute('d')).not.toContain('Z')
    })

    it('cancels path on Escape — discards everything', () => {
      const tool = makeTool()
      tool.handlers.onMouseDown!(mouseEvent(100, 100))
      tool.handlers.onMouseDown!(mouseEvent(300, 200))
      tool.handlers.onKeyDown!(keyEvent('Escape'))

      const layer = svg.querySelector('g[data-layer-name]')!
      expect(layer.querySelector('path')).toBeNull()
    })
  })
})
