import { describe, it, expect, beforeEach } from 'vitest'
import { createPenTool, buildPathD } from './penTool'
import type { AnchorPoint } from './penTool'
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

  function mouseDown(clientX: number, clientY: number, button = 0): MouseEvent {
    return new MouseEvent('mousedown', { clientX, clientY, button })
  }

  function mouseMove(clientX: number, clientY: number): MouseEvent {
    return new MouseEvent('mousemove', { clientX, clientY })
  }

  function mouseUp(clientX: number, clientY: number): MouseEvent {
    return new MouseEvent('mouseup', { clientX, clientY })
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
    tool.handlers.onMouseDown!(mouseDown(100, 100))
    tool.handlers.onMouseUp!(mouseUp(100, 100))

    const preview = svg.querySelector('path[data-role="preview"]')
    expect(preview).not.toBeNull()
  })

  it('creates anchor points on subsequent clicks', () => {
    const tool = makeTool()
    tool.handlers.onMouseDown!(mouseDown(100, 100))
    tool.handlers.onMouseUp!(mouseUp(100, 100))
    tool.handlers.onMouseDown!(mouseDown(200, 200))
    tool.handlers.onMouseUp!(mouseUp(200, 200))
    tool.handlers.onMouseDown!(mouseDown(300, 150))
    tool.handlers.onMouseUp!(mouseUp(300, 150))

    const anchors = svg.querySelectorAll('rect[data-role="preview"]')
    expect(anchors.length).toBe(3)
  })

  it('commits path on Enter', () => {
    const tool = makeTool()
    tool.handlers.onMouseDown!(mouseDown(100, 100))
    tool.handlers.onMouseUp!(mouseUp(100, 100))
    tool.handlers.onMouseDown!(mouseDown(200, 200))
    tool.handlers.onMouseUp!(mouseUp(200, 200))
    tool.handlers.onKeyDown!(keyEvent('Enter'))

    const layer = svg.querySelector('g[data-layer-name]')!
    const path = layer.querySelector('path')
    expect(path).not.toBeNull()
    expect(path!.getAttribute('d')).toContain('M')
    expect(path!.getAttribute('d')).toContain('L')
  })

  it('cancels path on Escape without committing', () => {
    const tool = makeTool()
    tool.handlers.onMouseDown!(mouseDown(100, 100))
    tool.handlers.onMouseUp!(mouseUp(100, 100))
    tool.handlers.onMouseDown!(mouseDown(200, 200))
    tool.handlers.onMouseUp!(mouseUp(200, 200))
    tool.handlers.onKeyDown!(keyEvent('Escape'))

    const layer = svg.querySelector('g[data-layer-name]')!
    const path = layer.querySelector('path')
    expect(path).toBeNull()
    // Preview elements should also be cleaned up
    const previews = svg.querySelectorAll('[data-role="preview"]')
    expect(previews.length).toBe(0)
  })

  it('committed path is undoable', () => {
    const tool = makeTool()
    tool.handlers.onMouseDown!(mouseDown(100, 100))
    tool.handlers.onMouseUp!(mouseUp(100, 100))
    tool.handlers.onMouseDown!(mouseDown(200, 200))
    tool.handlers.onMouseUp!(mouseUp(200, 200))
    tool.handlers.onKeyDown!(keyEvent('Enter'))

    const layer = svg.querySelector('g[data-layer-name]')!
    expect(layer.querySelector('path')).not.toBeNull()
    history.undo()
    expect(layer.querySelector('path')).toBeNull()
    history.redo()
    expect(layer.querySelector('path')).not.toBeNull()
  })

  it('closes path with Z when clicking near first anchor', () => {
    const tool = makeTool()
    tool.handlers.onMouseDown!(mouseDown(100, 100))
    tool.handlers.onMouseUp!(mouseUp(100, 100))
    tool.handlers.onMouseDown!(mouseDown(300, 100))
    tool.handlers.onMouseUp!(mouseUp(300, 100))
    tool.handlers.onMouseDown!(mouseDown(300, 300))
    tool.handlers.onMouseUp!(mouseUp(300, 300))
    // Click near first point to close
    tool.handlers.onMouseDown!(mouseDown(101, 101))

    const layer = svg.querySelector('g[data-layer-name]')!
    const path = layer.querySelector('path')
    expect(path).not.toBeNull()
    expect(path!.getAttribute('d')).toContain('Z')
  })

  it('ignores non-left mouse button', () => {
    const tool = makeTool()
    tool.handlers.onMouseDown!(mouseDown(100, 100, 2))
    expect(svg.querySelectorAll('[data-role="preview"]').length).toBe(0)
  })

  // Bezier tests
  describe('buildPathD with Bezier handles', () => {
    it('uses L for straight segments', () => {
      const anchors: AnchorPoint[] = [
        { pos: { x: 0, y: 0 }, handleOut: null, handleIn: null },
        { pos: { x: 10, y: 10 }, handleOut: null, handleIn: null },
      ]
      const d = buildPathD(anchors)
      expect(d).toBe('M 0 0 L 10 10')
    })

    it('uses C for segments with handles', () => {
      const anchors: AnchorPoint[] = [
        { pos: { x: 0, y: 0 }, handleOut: { x: 5, y: 0 }, handleIn: null },
        { pos: { x: 10, y: 10 }, handleOut: null, handleIn: { x: 5, y: 10 } },
      ]
      const d = buildPathD(anchors)
      expect(d).toBe('M 0 0 C 5 0 5 10 10 10')
    })

    it('uses C when only outgoing handle exists', () => {
      const anchors: AnchorPoint[] = [
        { pos: { x: 0, y: 0 }, handleOut: { x: 5, y: 0 }, handleIn: null },
        { pos: { x: 10, y: 10 }, handleOut: null, handleIn: null },
      ]
      const d = buildPathD(anchors)
      // cp2 defaults to the destination point
      expect(d).toBe('M 0 0 C 5 0 10 10 10 10')
    })

    it('mixes L and C segments', () => {
      const anchors: AnchorPoint[] = [
        { pos: { x: 0, y: 0 }, handleOut: null, handleIn: null },
        { pos: { x: 10, y: 0 }, handleOut: { x: 15, y: 5 }, handleIn: null },
        { pos: { x: 20, y: 10 }, handleOut: null, handleIn: { x: 15, y: 5 } },
      ]
      const d = buildPathD(anchors)
      expect(d).toBe('M 0 0 L 10 0 C 15 5 15 5 20 10')
    })
  })

  describe('drag to create Bezier handles', () => {
    it('creates handles when dragging after mousedown', () => {
      const tool = makeTool()
      // First point: click-release (no handle)
      tool.handlers.onMouseDown!(mouseDown(100, 100))
      tool.handlers.onMouseUp!(mouseUp(100, 100))

      // Second point: click and drag to create handle
      tool.handlers.onMouseDown!(mouseDown(300, 100))
      tool.handlers.onMouseMove!(mouseMove(350, 50)) // drag outward
      tool.handlers.onMouseUp!(mouseUp(350, 50))

      // Finish and check
      tool.handlers.onKeyDown!(keyEvent('Enter'))

      const layer = svg.querySelector('g[data-layer-name]')!
      const path = layer.querySelector('path')
      expect(path).not.toBeNull()
      const d = path!.getAttribute('d')!
      // Should contain C command for cubic Bezier
      expect(d).toContain('C')
    })

    it('shows handle visuals during drag', () => {
      const tool = makeTool()
      tool.handlers.onMouseDown!(mouseDown(100, 100))
      tool.handlers.onMouseUp!(mouseUp(100, 100))

      // Start dragging second point
      tool.handlers.onMouseDown!(mouseDown(300, 100))
      tool.handlers.onMouseMove!(mouseMove(350, 50))

      // Should see control handle circles
      const circles = svg.querySelectorAll('circle[data-role="preview"]')
      expect(circles.length).toBeGreaterThan(0)
    })

    it('plain click creates no handles', () => {
      const tool = makeTool()
      tool.handlers.onMouseDown!(mouseDown(100, 100))
      tool.handlers.onMouseUp!(mouseUp(100, 100))
      tool.handlers.onMouseDown!(mouseDown(200, 200))
      tool.handlers.onMouseUp!(mouseUp(200, 200))
      tool.handlers.onKeyDown!(keyEvent('Enter'))

      const layer = svg.querySelector('g[data-layer-name]')!
      const path = layer.querySelector('path')
      const d = path!.getAttribute('d')!
      expect(d).not.toContain('C')
      expect(d).toContain('L')
    })
  })
})
