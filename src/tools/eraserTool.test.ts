/**
 * eraserTool.test.ts
 *
 * Tests for the P0 fix: eraser drag + undo must not throw NotFoundError
 * and must restore elements in correct z-order.
 *
 * Strategy: vi.mock hitTestElement so the drag sequence is fully controlled
 * without needing real SVG geometry (jsdom doesn't support it).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createEraserTool } from './eraserTool'
import { createDocumentModel, resetIdCounter } from '../model/document'
import { CommandHistory } from '../model/commands'
import { commandTouchesSource } from '../model/commands'
import { clearSelection, setOverlayGroup } from '../model/selection'
import type { DocumentModel } from '../model/document'

// ── Mock geometry so we can drive hitTestElement from tests ──────────────────
vi.mock('../model/geometry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../model/geometry')>()
  return {
    ...actual,
    hitTestElement: vi.fn(() => null),
  }
})

import { hitTestElement } from '../model/geometry'
const mockHitTest = hitTestElement as ReturnType<typeof vi.fn>

// ── SVG harness ──────────────────────────────────────────────────────────────

function makeSvg(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 210 297')
  Object.defineProperty(svg, 'clientWidth', { value: 800, writable: true })
  Object.defineProperty(svg, 'clientHeight', { value: 600, writable: true })

  const layer = document.createElementNS('http://www.w3.org/2000/svg', 'g')
  layer.setAttribute('data-layer-name', 'Layer 1')
  svg.appendChild(layer)

  const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'g')
  overlay.setAttribute('data-role', 'overlay')
  svg.appendChild(overlay)

  document.body.appendChild(svg)
  return svg
}

function addRect(
  svg: SVGSVGElement,
  x: number,
  y: number,
  id?: string,
  srcTagged = false
): SVGRectElement {
  const layer = svg.querySelector('g[data-layer-name]')!
  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  rect.setAttribute('x', String(x))
  rect.setAttribute('y', String(y))
  rect.setAttribute('width', '20')
  rect.setAttribute('height', '20')
  if (id) rect.setAttribute('id', id)
  if (srcTagged) {
    rect.setAttribute('data-src-page', '1')
    rect.setAttribute('data-src-layer-id', 'layer-0')
  }
  ;(rect as any).getBBox = () => ({ x, y, width: 20, height: 20 })
  layer.appendChild(rect)
  return rect
}

function mouseDown(clientX = 0, clientY = 0): MouseEvent {
  return new MouseEvent('mousedown', { clientX, clientY, button: 0, bubbles: true })
}
function mouseMove(clientX = 0, clientY = 0): MouseEvent {
  return new MouseEvent('mousemove', { clientX, clientY, bubbles: true })
}
function mouseUp(): MouseEvent {
  return new MouseEvent('mouseup', { bubbles: true })
}

// ── Test suite ───────────────────────────────────────────────────────────────

describe('EraserTool', () => {
  let svg: SVGSVGElement
  let doc: DocumentModel
  let history: CommandHistory

  beforeEach(() => {
    document.body.innerHTML = ''
    resetIdCounter()
    clearSelection()
    mockHitTest.mockReset()
    mockHitTest.mockReturnValue(null)

    svg = makeSvg()
    doc = createDocumentModel(svg)
    history = new CommandHistory()

    const overlay = svg.querySelector('g[data-role="overlay"]') as SVGGElement
    setOverlayGroup(overlay)
  })

  function makeTool() {
    return createEraserTool(
      () => svg,
      () => doc,
      () => history
    )
  }

  // ── Tool metadata ────────────────────────────────────────────────────────

  describe('tool config', () => {
    it('has correct name, icon, shortcut, cursor', () => {
      const tool = makeTool()
      expect(tool.name).toBe('eraser')
      expect(tool.icon).toBe('X')
      expect(tool.shortcut).toBe('x')
      expect(tool.cursor).toBe('crosshair')
    })
  })

  // ── Single-element erase round-trip ─────────────────────────────────────

  describe('single-element erase', () => {
    it('removes element and pushes to history', () => {
      const tool = makeTool()
      const rect = addRect(svg, 10, 10, 'r1')

      // Return rect on mousedown hit, then null on subsequent moves
      mockHitTest.mockReturnValueOnce(rect).mockReturnValue(null)

      tool.handlers.onMouseDown!(mouseDown(50, 50))
      tool.handlers.onMouseUp!(mouseUp())

      expect(rect.parentElement).toBeNull()
      expect(history.canUndo).toBe(true)
    })

    it('undo restores the element to its original parent', () => {
      const tool = makeTool()
      const layer = svg.querySelector('g[data-layer-name]')!
      const rect = addRect(svg, 10, 10, 'r1')

      mockHitTest.mockReturnValueOnce(rect).mockReturnValue(null)

      tool.handlers.onMouseDown!(mouseDown(50, 50))
      tool.handlers.onMouseUp!(mouseUp())
      expect(rect.parentElement).toBeNull()

      history.undo()
      expect(rect.parentElement).toBe(layer)
    })

    it('redo re-removes the element', () => {
      const tool = makeTool()
      const rect = addRect(svg, 10, 10, 'r1')

      mockHitTest.mockReturnValueOnce(rect).mockReturnValue(null)

      tool.handlers.onMouseDown!(mouseDown(50, 50))
      tool.handlers.onMouseUp!(mouseUp())
      history.undo()
      history.redo()

      expect(rect.parentElement).toBeNull()
    })
  })

  // ── Three-sibling erase: the P0 bug scenario ─────────────────────────────

  describe('three-sibling erase (P0 bug: undo must not throw)', () => {
    it('(a) all three detached after execute', () => {
      const tool = makeTool()
      const r1 = addRect(svg, 10, 10, 'r1')
      const r2 = addRect(svg, 40, 10, 'r2')
      const r3 = addRect(svg, 70, 10, 'r3')

      // Simulate drag A→B→C: hit on mousedown then two moves
      mockHitTest
        .mockReturnValueOnce(r1)
        .mockReturnValueOnce(r2)
        .mockReturnValueOnce(r3)
        .mockReturnValue(null)

      tool.handlers.onMouseDown!(mouseDown(10, 10))
      tool.handlers.onMouseMove!(mouseMove(40, 10))
      tool.handlers.onMouseMove!(mouseMove(70, 10))
      tool.handlers.onMouseUp!(mouseUp())

      expect(r1.parentElement).toBeNull()
      expect(r2.parentElement).toBeNull()
      expect(r3.parentElement).toBeNull()
    })

    it('(b) undo does NOT throw and restores all three in original z-order', () => {
      const tool = makeTool()
      const layer = svg.querySelector('g[data-layer-name]')!
      const r1 = addRect(svg, 10, 10, 'r1')
      const r2 = addRect(svg, 40, 10, 'r2')
      const r3 = addRect(svg, 70, 10, 'r3')

      mockHitTest
        .mockReturnValueOnce(r1)
        .mockReturnValueOnce(r2)
        .mockReturnValueOnce(r3)
        .mockReturnValue(null)

      tool.handlers.onMouseDown!(mouseDown(10, 10))
      tool.handlers.onMouseMove!(mouseMove(40, 10))
      tool.handlers.onMouseMove!(mouseMove(70, 10))
      tool.handlers.onMouseUp!(mouseUp())

      // P0 fix: this must NOT throw NotFoundError
      expect(() => history.undo()).not.toThrow()

      // All three must be back in the layer
      expect(r1.parentElement).toBe(layer)
      expect(r2.parentElement).toBe(layer)
      expect(r3.parentElement).toBe(layer)

      // z-order must be preserved: r1 before r2 before r3
      const children = Array.from(layer.children)
      expect(children.indexOf(r1)).toBeLessThan(children.indexOf(r2))
      expect(children.indexOf(r2)).toBeLessThan(children.indexOf(r3))
    })

    it('(c) redo re-removes all three', () => {
      const tool = makeTool()
      const r1 = addRect(svg, 10, 10, 'r1')
      const r2 = addRect(svg, 40, 10, 'r2')
      const r3 = addRect(svg, 70, 10, 'r3')

      mockHitTest
        .mockReturnValueOnce(r1)
        .mockReturnValueOnce(r2)
        .mockReturnValueOnce(r3)
        .mockReturnValue(null)

      tool.handlers.onMouseDown!(mouseDown(10, 10))
      tool.handlers.onMouseMove!(mouseMove(40, 10))
      tool.handlers.onMouseMove!(mouseMove(70, 10))
      tool.handlers.onMouseUp!(mouseUp())
      history.undo()
      history.redo()

      expect(r1.parentElement).toBeNull()
      expect(r2.parentElement).toBeNull()
      expect(r3.parentElement).toBeNull()
    })
  })

  // ── Drag feedback: visibility:hidden, NOT DOM removal ────────────────────

  describe('drag feedback: elements hidden not detached', () => {
    it('elements are still in the DOM (visibility:hidden) during drag, detached only after mouseUp', () => {
      const tool = makeTool()
      const layer = svg.querySelector('g[data-layer-name]')!
      const r1 = addRect(svg, 10, 10, 'r1')
      const r2 = addRect(svg, 40, 10, 'r2')

      mockHitTest
        .mockReturnValueOnce(r1)  // mousedown
        .mockReturnValueOnce(r2)  // mousemove
        .mockReturnValue(null)

      tool.handlers.onMouseDown!(mouseDown(10, 10))
      // After mousedown: r1 still in DOM but hidden
      expect(r1.parentElement).toBe(layer)
      expect((r1 as SVGElement).style.visibility).toBe('hidden')

      tool.handlers.onMouseMove!(mouseMove(40, 10))
      // After mousemove: r2 also still in DOM but hidden
      expect(r2.parentElement).toBe(layer)
      expect((r2 as SVGElement).style.visibility).toBe('hidden')

      // Commit: both actually removed from DOM
      tool.handlers.onMouseUp!(mouseUp())
      expect(r1.parentElement).toBeNull()
      expect(r2.parentElement).toBeNull()
    })
  })

  // ── touchesSource: free correctness win via RemoveElementCommand ─────────

  describe('touchesSource propagation', () => {
    it('compound command touchesSource = true when any erased element is src-tagged', () => {
      const tool = makeTool()
      const plain = addRect(svg, 10, 10, 'plain')
      const srcRect = addRect(svg, 40, 10, 'src', true /* srcTagged */)

      mockHitTest
        .mockReturnValueOnce(plain)
        .mockReturnValueOnce(srcRect)
        .mockReturnValue(null)

      tool.handlers.onMouseDown!(mouseDown(10, 10))
      tool.handlers.onMouseMove!(mouseMove(40, 10))
      tool.handlers.onMouseUp!(mouseUp())

      // CompoundCommand.touchesSource() returns OR of children
      const lastCmd = (history as any).undoStack[(history as any).undoStack.length - 1]
      expect(commandTouchesSource(lastCmd)).toBe(true)
    })

    it('compound command touchesSource = false when no src-tagged elements', () => {
      const tool = makeTool()
      const plain1 = addRect(svg, 10, 10, 'p1')
      const plain2 = addRect(svg, 40, 10, 'p2')

      mockHitTest
        .mockReturnValueOnce(plain1)
        .mockReturnValueOnce(plain2)
        .mockReturnValue(null)

      tool.handlers.onMouseDown!(mouseDown(10, 10))
      tool.handlers.onMouseMove!(mouseMove(40, 10))
      tool.handlers.onMouseUp!(mouseUp())

      const lastCmd = (history as any).undoStack[(history as any).undoStack.length - 1]
      expect(commandTouchesSource(lastCmd)).toBe(false)
    })
  })

  // ── Deduplicate: same element hit multiple times during drag ─────────────

  describe('deduplication', () => {
    it('erasing the same element twice in one drag only removes it once', () => {
      const tool = makeTool()
      const layer = svg.querySelector('g[data-layer-name]')!
      const rect = addRect(svg, 10, 10, 'r1')

      // mousedown returns rect, mousemove returns same rect (duplicate hit)
      mockHitTest
        .mockReturnValueOnce(rect)
        .mockReturnValueOnce(rect)
        .mockReturnValue(null)

      tool.handlers.onMouseDown!(mouseDown(10, 10))
      tool.handlers.onMouseMove!(mouseMove(10, 10))
      tool.handlers.onMouseUp!(mouseUp())

      expect(rect.parentElement).toBeNull()

      // Undo must restore it exactly once (not duplicate-append)
      history.undo()
      expect(layer.querySelectorAll('#r1').length).toBe(1)
    })
  })

  // ── No-op drag: mouseDown + mouseUp with no hits ─────────────────────────

  describe('no-op drag', () => {
    it('does not push to history when no elements hit', () => {
      const tool = makeTool()
      addRect(svg, 10, 10, 'r1')

      mockHitTest.mockReturnValue(null)

      tool.handlers.onMouseDown!(mouseDown(200, 200))
      tool.handlers.onMouseUp!(mouseUp())

      expect(history.canUndo).toBe(false)
    })
  })
})
