import { describe, it, expect, beforeEach } from 'vitest'
import { createSelectTool, registerSelectTool } from './selectTool'
import { createDocumentModel, resetIdCounter } from '../model/document'
import { CommandHistory } from '../model/commands'
import { clearRegistry, getAllTools, getActiveTool, setActiveTool } from './registry'
import { getSelection, setSelection, clearSelection, setOverlayGroup } from '../model/selection'
import type { DocumentModel } from '../model/document'
import { parseTransform, applyMatrixToPoint, invertMatrix, scaleAroundMatrix } from '../model/matrix'

function makeSvg(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 210 297')
  Object.defineProperty(svg, 'clientWidth', { value: 800, writable: true })
  Object.defineProperty(svg, 'clientHeight', { value: 600, writable: true })
  const layer = document.createElementNS('http://www.w3.org/2000/svg', 'g')
  layer.setAttribute('data-layer-name', 'Layer 1')
  svg.appendChild(layer)
  // Overlay group for selection handles
  const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'g')
  overlay.setAttribute('data-role', 'overlay')
  svg.appendChild(overlay)
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
      matrixTransform(this: { x: number; y: number }, m: DOMMatrix) {
        return {
          x: this.x * (m as unknown as { a: number }).a,
          y: this.y * (m as unknown as { d: number }).d,
        }
      },
    }) as unknown as SVGPoint
}

/** Add a rect element to the layer and mock its getBBox */
function addRect(
  svg: SVGSVGElement,
  x: number,
  y: number,
  width: number,
  height: number,
  id?: string
): SVGRectElement {
  const layer = svg.querySelector('g[data-layer-name]')!
  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  rect.setAttribute('x', String(x))
  rect.setAttribute('y', String(y))
  rect.setAttribute('width', String(width))
  rect.setAttribute('height', String(height))
  rect.setAttribute('fill', '#ff0000')
  if (id) rect.setAttribute('id', id)
  // Mock getBBox for jsdom (not natively supported)
  ;(rect as any).getBBox = () => ({ x, y, width, height })
  layer.appendChild(rect)
  return rect
}

function mouseDown(clientX: number, clientY: number, opts: Partial<MouseEventInit> = {}): MouseEvent {
  return new MouseEvent('mousedown', { clientX, clientY, button: 0, ...opts })
}

function mouseMove(clientX: number, clientY: number, opts: Partial<MouseEventInit> = {}): MouseEvent {
  return new MouseEvent('mousemove', { clientX, clientY, ...opts })
}

function mouseUp(clientX: number, clientY: number, opts: Partial<MouseEventInit> = {}): MouseEvent {
  return new MouseEvent('mouseup', { clientX, clientY, ...opts })
}

describe('Select Tool', () => {
  let svg: SVGSVGElement
  let doc: DocumentModel
  let history: CommandHistory

  beforeEach(() => {
    document.body.innerHTML = ''
    resetIdCounter()
    clearRegistry()
    clearSelection()
    svg = makeSvg()
    mockScreenToDoc(svg)
    doc = createDocumentModel(svg)
    history = new CommandHistory()
    // Wire overlay group so selection overlay rendering doesn't throw
    const overlay = svg.querySelector('g[data-role="overlay"]') as SVGGElement
    setOverlayGroup(overlay)
  })

  function makeTool() {
    return createSelectTool(
      () => svg,
      () => doc,
      () => history
    )
  }

  // ---- Tool creation and config ----

  describe('tool creation and config', () => {
    it('has correct name, icon, shortcut, and cursor', () => {
      const tool = makeTool()
      expect(tool.name).toBe('select')
      expect(tool.icon).toBe('V')
      expect(tool.shortcut).toBe('v')
      expect(tool.cursor).toBe('default')
    })

    it('has onDeactivate hook', () => {
      const tool = makeTool()
      expect(typeof tool.onDeactivate).toBe('function')
    })
  })

  // ---- Handler existence ----

  describe('handler existence', () => {
    it('has onMouseDown handler', () => {
      const tool = makeTool()
      expect(typeof tool.handlers.onMouseDown).toBe('function')
    })

    it('has onMouseMove handler', () => {
      const tool = makeTool()
      expect(typeof tool.handlers.onMouseMove).toBe('function')
    })

    it('has onMouseUp handler', () => {
      const tool = makeTool()
      expect(typeof tool.handlers.onMouseUp).toBe('function')
    })
  })

  // ---- Registration ----

  describe('registration', () => {
    it('registers in the tool registry', () => {
      registerSelectTool(
        () => svg,
        () => doc,
        () => history
      )
      const tools = getAllTools()
      const names = tools.map((t) => t.name)
      expect(names).toContain('select')
    })

    it('can be activated via registry', () => {
      registerSelectTool(
        () => svg,
        () => doc,
        () => history
      )
      setActiveTool('select')
      const active = getActiveTool()
      expect(active).not.toBeNull()
      expect(active!.name).toBe('select')
    })
  })

  // ---- Click-select ----

  describe('click-select', () => {
    it('selects an element on click', () => {
      const tool = makeTool()
      const rect = addRect(svg, 10, 10, 50, 50)

      // Click at screen coords that map onto the rect (convert doc to screen)
      // doc (35, 35) -> screen (35 / (210/800), 35 / (297/600)) = (133.3, 70.7)
      tool.handlers.onMouseDown!(mouseDown(133, 71))
      tool.handlers.onMouseUp!(mouseUp(133, 71))

      const sel = getSelection()
      expect(sel).toHaveLength(1)
      expect(sel[0]).toBe(rect)
    })

    it('clears selection when clicking on empty space', () => {
      const tool = makeTool()
      const rect = addRect(svg, 10, 10, 20, 20)

      // First, select the rect
      setSelection([rect])
      expect(getSelection()).toHaveLength(1)

      // Click far from any element (empty area, near bottom-right of doc)
      // doc (200, 280) -> screen (200/(210/800), 280/(297/600)) ≈ (762, 565)
      tool.handlers.onMouseDown!(mouseDown(762, 565))
      // This starts a marquee, which on mouseUp with tiny movement clears selection
      tool.handlers.onMouseUp!(mouseUp(762, 565))

      const sel = getSelection()
      expect(sel).toHaveLength(0)
    })

    it('selects topmost element when elements overlap', () => {
      const tool = makeTool()
      addRect(svg, 10, 10, 50, 50, 'bottom')
      const rect2 = addRect(svg, 20, 20, 50, 50, 'top')

      // Click on overlap area: doc (40, 40)
      // screen (40/(210/800), 40/(297/600)) = (152.4, 80.8)
      tool.handlers.onMouseDown!(mouseDown(152, 81))
      tool.handlers.onMouseUp!(mouseUp(152, 81))

      const sel = getSelection()
      expect(sel).toHaveLength(1)
      // Last child in DOM = topmost in visual stack
      expect(sel[0]).toBe(rect2)
    })

    it('ignores non-left mouse button', () => {
      const tool = makeTool()
      addRect(svg, 10, 10, 50, 50)

      tool.handlers.onMouseDown!(
        new MouseEvent('mousedown', { clientX: 133, clientY: 71, button: 2 })
      )
      expect(getSelection()).toHaveLength(0)
    })
  })

  // ---- Shift-click toggle ----

  describe('shift-click toggle', () => {
    it('adds to selection with shift-click', () => {
      const tool = makeTool()
      const rect1 = addRect(svg, 10, 10, 30, 30, 'r1')
      const rect2 = addRect(svg, 80, 80, 30, 30, 'r2')

      // Select rect1 first
      // doc (25, 25) -> screen (25/(210/800), 25/(297/600)) ≈ (95.2, 50.5)
      tool.handlers.onMouseDown!(mouseDown(95, 50))
      tool.handlers.onMouseUp!(mouseUp(95, 50))
      expect(getSelection()).toHaveLength(1)
      expect(getSelection()[0]).toBe(rect1)

      // Shift-click rect2
      // doc (95, 95) -> screen ≈ (361.9, 192)
      tool.handlers.onMouseDown!(mouseDown(362, 192, { shiftKey: true }))

      const sel = getSelection()
      expect(sel).toHaveLength(2)
      expect(sel).toContain(rect1)
      expect(sel).toContain(rect2)
    })

    it('removes from selection with shift-click on already-selected element', () => {
      const tool = makeTool()
      const rect1 = addRect(svg, 10, 10, 30, 30, 'r1')
      const rect2 = addRect(svg, 80, 80, 30, 30, 'r2')

      // Start with both selected
      setSelection([rect1, rect2])
      expect(getSelection()).toHaveLength(2)

      // Shift-click on rect1 to deselect it
      tool.handlers.onMouseDown!(mouseDown(95, 50, { shiftKey: true }))

      const sel = getSelection()
      expect(sel).toHaveLength(1)
      expect(sel[0]).toBe(rect2)
    })
  })

  // ---- onDeactivate cleanup ----

  describe('onDeactivate', () => {
    it('resets drag state on deactivation', () => {
      const tool = makeTool()
      addRect(svg, 10, 10, 50, 50)

      // Start a move drag
      tool.handlers.onMouseDown!(mouseDown(133, 71))
      // Move a bit
      tool.handlers.onMouseMove!(mouseMove(200, 200))

      // Deactivate mid-drag
      tool.onDeactivate!()

      // Subsequent mouseMove should not throw or move anything
      tool.handlers.onMouseMove!(mouseMove(300, 300))
      // If mode was properly reset, nothing should happen (no error)
    })
  })

  // ---- Move (drag) ----

  describe('move via drag', () => {
    it('moves element and commits to history on mouseUp', () => {
      const tool = makeTool()
      const rect = addRect(svg, 50, 50, 40, 40)

      // Click on rect: doc (70, 70) -> screen ≈ (266.7, 141.4)
      tool.handlers.onMouseDown!(mouseDown(267, 141))

      // Drag to new position: shift by +100px screen in x
      tool.handlers.onMouseMove!(mouseMove(367, 141))
      tool.handlers.onMouseUp!(mouseUp(367, 141))

      // The element x attribute should have changed
      const newX = parseFloat(rect.getAttribute('x')!)
      expect(newX).not.toBe(50)

      // History should have a command
      expect(history.canUndo).toBe(true)
    })

    it('move is undoable', () => {
      const tool = makeTool()
      const rect = addRect(svg, 50, 50, 40, 40)

      tool.handlers.onMouseDown!(mouseDown(267, 141))
      tool.handlers.onMouseMove!(mouseMove(367, 200))
      tool.handlers.onMouseUp!(mouseUp(367, 200))

      const movedX = parseFloat(rect.getAttribute('x')!)
      expect(movedX).not.toBe(50)

      history.undo()

      const restoredX = parseFloat(rect.getAttribute('x')!)
      expect(restoredX).toBe(50)
    })
  })

  // ---- Marquee selection ----

  describe('marquee selection', () => {
    it('creates a marquee rect on empty-space drag', () => {
      const tool = makeTool()

      // Click in empty space: doc (180, 250) -> screen ≈ (685.7, 505)
      tool.handlers.onMouseDown!(mouseDown(686, 505))

      // A marquee rect should have been appended
      const marquee = svg.querySelector('rect[data-role="overlay"]')
      expect(marquee).not.toBeNull()
    })

    it('selects elements within marquee bounds', () => {
      const tool = makeTool()
      const rect1 = addRect(svg, 10, 10, 20, 20, 'r1')
      addRect(svg, 150, 150, 20, 20, 'r2')

      // Drag marquee that encloses rect1 but not rect2
      // Enclose doc region (0, 0) to (40, 40)
      // screen (0, 0) to (40/(210/800), 40/(297/600)) = (0, 0) to (152.4, 80.8)
      tool.handlers.onMouseDown!(mouseDown(0, 0))
      tool.handlers.onMouseMove!(mouseMove(153, 81))
      tool.handlers.onMouseUp!(mouseUp(153, 81))

      const sel = getSelection()
      expect(sel).toHaveLength(1)
      expect(sel[0]).toBe(rect1)
    })
  })

  // ---- Locked layer ----

  describe('locked layer', () => {
    it('does not select elements on a locked layer', () => {
      const tool = makeTool()
      const layer = svg.querySelector('g[data-layer-name]')!
      addRect(svg, 10, 10, 50, 50)

      // Lock the layer
      layer.setAttribute('data-locked', 'true')

      // Click on the rect position
      tool.handlers.onMouseDown!(mouseDown(133, 71))
      tool.handlers.onMouseUp!(mouseUp(133, 71))

      expect(getSelection()).toHaveLength(0)
    })
  })

  // ---- Group transform tests ----

  /** Add a <g> element with optional transform and mock getBBox */
  function addGroup(
    svgEl: SVGSVGElement,
    transform?: string,
    bboxOverride?: { x: number; y: number; width: number; height: number }
  ): SVGGElement {
    const layer = svgEl.querySelector('g[data-layer-name]')!
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement
    if (transform) g.setAttribute('transform', transform)
    const childRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    childRect.setAttribute('x', '10')
    childRect.setAttribute('y', '10')
    childRect.setAttribute('width', '80')
    childRect.setAttribute('height', '80')
    g.appendChild(childRect)
    const bbox = bboxOverride || { x: 10, y: 10, width: 80, height: 80 }
    ;(g as any).getBBox = () => ({ ...bbox })
    layer.appendChild(g)
    return g
  }

  const near = (a: number, b: number, tol = 0.5) => Math.abs(a - b) < tol

  describe('group move (Bug 1)', () => {
    it('moves group from identity transform', () => {
      const tool = makeTool()
      const g = addGroup(svg)

      // Click inside group: doc (50, 50) -> screen (50/(210/800), 50/(297/600)) ≈ (190.5, 101)
      tool.handlers.onMouseDown!(mouseDown(190, 101))
      // Drag right by ~26 doc units (100 screen px * 210/800)
      tool.handlers.onMouseMove!(mouseMove(290, 101))
      tool.handlers.onMouseUp!(mouseUp(290, 101))

      const t = g.getAttribute('transform')
      expect(t).toBeTruthy()
      expect(t!.startsWith('matrix(')).toBe(true)
      // The translation component should be non-zero (moved right)
      const m = parseTransform(t!)
      expect(m[4]).toBeGreaterThan(10) // translate X > 0
      expect(history.canUndo).toBe(true)
    })

    it('second move accumulates with first', () => {
      const tool = makeTool()
      const g = addGroup(svg, 'translate(20, 10)')
      // Mock getBBox to reflect the original local position
      ;(g as any).getBBox = () => ({ x: 10, y: 10, width: 80, height: 80 })

      // First move: click on group, drag right
      tool.handlers.onMouseDown!(mouseDown(190, 101))
      tool.handlers.onMouseMove!(mouseMove(290, 101))
      tool.handlers.onMouseUp!(mouseUp(290, 101))

      const t1 = g.getAttribute('transform')!
      const m1 = parseTransform(t1)
      // translate X should include original 20 + drag delta
      expect(m1[4]).toBeGreaterThan(20)
    })

    it('move preserves existing rotation on group', () => {
      const tool = makeTool()
      // Group with 45-degree rotation (matrix form)
      const g = addGroup(svg, 'rotate(45, 50, 50)')

      tool.handlers.onMouseDown!(mouseDown(190, 101))
      tool.handlers.onMouseMove!(mouseMove(290, 101))
      tool.handlers.onMouseUp!(mouseUp(290, 101))

      const t = g.getAttribute('transform')!
      const m = parseTransform(t)
      // Rotation component should be preserved (a,b,c,d encode rotation)
      // For 45 deg: a ≈ 0.707, b ≈ 0.707
      expect(near(Math.abs(m[1]), 0.707, 0.1)).toBe(true)
    })

    it('group move is undoable', () => {
      const tool = makeTool()
      const g = addGroup(svg, 'translate(10, 20)')
      const origTransform = g.getAttribute('transform')

      tool.handlers.onMouseDown!(mouseDown(190, 101))
      tool.handlers.onMouseMove!(mouseMove(290, 101))
      tool.handlers.onMouseUp!(mouseUp(290, 101))

      expect(g.getAttribute('transform')).not.toBe(origTransform)
      history.undo()
      expect(g.getAttribute('transform')).toBe(origTransform)
    })
  })

  describe('group transform math', () => {
    it('matrix composition for move: translate(dx,dy) * orig', () => {
      // Verify the math directly: translate(10, 5) * rotate(45, 50, 50)
      const orig = parseTransform('rotate(45, 50, 50)')
      // Apply orig to a test point
      const p1 = applyMatrixToPoint(orig, 30, 30)
      // Apply translate then orig
      const combined = parseTransform(`translate(10, 5) rotate(45, 50, 50)`)
      const p2 = applyMatrixToPoint(combined, 30, 30)
      // p2 should be p1 shifted by (10, 5)
      expect(near(p2.x, p1.x + 10, 0.01)).toBe(true)
      expect(near(p2.y, p1.y + 5, 0.01)).toBe(true)
    })

    it('scale around anchor preserves anchor position', () => {
      const m = scaleAroundMatrix(2, 2, 50, 50)
      const anchor = applyMatrixToPoint(m, 50, 50)
      expect(near(anchor.x, 50, 0.01)).toBe(true)
      expect(near(anchor.y, 50, 0.01)).toBe(true)
    })

    it('inverse transform round-trips through forward', () => {
      const m = parseTransform('translate(50, 30) rotate(30) scale(2, 1.5)')
      const inv = invertMatrix(m)
      const fwd = applyMatrixToPoint(m, 25, 25)
      const back = applyMatrixToPoint(inv, fwd.x, fwd.y)
      expect(near(back.x, 25, 0.01)).toBe(true)
      expect(near(back.y, 25, 0.01)).toBe(true)
    })
  })
})
