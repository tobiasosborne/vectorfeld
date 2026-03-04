import { describe, it, expect } from 'vitest'
import { createFreeTransformTool } from './freeTransformTool'

describe('freeTransformTool', () => {
  it('creates tool with correct config', () => {
    const tool = createFreeTransformTool(
      () => null,
      () => null,
      () => ({ execute: () => {}, undo: () => {}, redo: () => {}, canUndo: false, canRedo: false, subscribe: () => () => {} }) as any
    )
    expect(tool.name).toBe('free-transform')
    expect(tool.shortcut).toBe('q')
    expect(tool.cursor).toBe('default')
  })

  it('has all required handlers', () => {
    const tool = createFreeTransformTool(() => null, () => null, () => ({} as any))
    expect(typeof tool.handlers.onMouseDown).toBe('function')
    expect(typeof tool.handlers.onMouseMove).toBe('function')
    expect(typeof tool.handlers.onMouseUp).toBe('function')
  })

  it('onMouseDown does nothing without svg', () => {
    const tool = createFreeTransformTool(() => null, () => null, () => ({} as any))
    // Should not throw
    const event = new MouseEvent('mousedown', { button: 0 })
    tool.handlers.onMouseDown!(event)
  })

  it('onMouseMove does nothing when idle', () => {
    const tool = createFreeTransformTool(() => null, () => null, () => ({} as any))
    const event = new MouseEvent('mousemove')
    tool.handlers.onMouseMove!(event)
    // No error = pass
  })

  it('onMouseUp does nothing when idle', () => {
    const tool = createFreeTransformTool(() => null, () => null, () => ({} as any))
    const event = new MouseEvent('mouseup')
    tool.handlers.onMouseUp!(event)
    // No error = pass
  })

  it('ignores non-left mouse button', () => {
    const tool = createFreeTransformTool(() => null, () => null, () => ({} as any))
    const event = new MouseEvent('mousedown', { button: 2 })
    tool.handlers.onMouseDown!(event)
    // No error, state stays idle
  })

  it('ignores mousedown when no selection', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as unknown as SVGSVGElement
    svg.setAttribute('viewBox', '0 0 210 297')
    Object.defineProperty(svg, 'clientWidth', { value: 800 })
    Object.defineProperty(svg, 'clientHeight', { value: 600 })

    const tool = createFreeTransformTool(() => svg, () => null, () => ({} as any))
    const event = new MouseEvent('mousedown', { button: 0, clientX: 100, clientY: 100 })
    tool.handlers.onMouseDown!(event)
    // No selection means no transform state initialized
  })

  it('icon is Q', () => {
    const tool = createFreeTransformTool(() => null, () => null, () => ({} as any))
    expect(tool.icon).toBe('Q')
  })
})
