import { describe, it, expect, afterEach } from 'vitest'
import { enterTextEdit } from './textEdit'
import { CommandHistory } from '../model/commands'
import { isEditableTarget } from '../model/EditorContext'

const SVG_NS = 'http://www.w3.org/2000/svg'

/** Build a source-shaped <text> run (single tspan with a per-char x-array)
 *  attached to an <svg> in the document body, plus a fresh history. */
function setup(content = 'Hello'): { text: SVGTextElement; svg: SVGSVGElement; history: CommandHistory } {
  const svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement
  const layer = document.createElementNS(SVG_NS, 'g')
  layer.setAttribute('data-layer-name', 'Layer 1')
  const text = document.createElementNS(SVG_NS, 'text') as SVGTextElement
  text.setAttribute('x', '10')
  text.setAttribute('y', '20')
  text.setAttribute('font-family', 'Helvetica')
  text.setAttribute('font-size', '6')
  text.setAttribute('fill', '#000000')
  const tspan = document.createElementNS(SVG_NS, 'tspan')
  tspan.setAttribute('x', '10 14 19 23 27')
  tspan.textContent = content
  text.appendChild(tspan)
  layer.appendChild(text)
  svg.appendChild(layer)
  document.body.appendChild(svg)
  return { text, svg, history: new CommandHistory() }
}

function fireBlur(ta: HTMLTextAreaElement) {
  ta.dispatchEvent(new Event('blur'))
}
function fireKey(ta: HTMLTextAreaElement, key: string) {
  ta.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
}

describe('enterTextEdit', () => {
  afterEach(() => {
    document.querySelectorAll('svg, textarea').forEach((n) => n.remove())
  })

  it('mounts a focused, editable <textarea> seeded with the run content', () => {
    const { text, svg, history } = setup('Hello')
    const ta = enterTextEdit(text, svg, null, history)
    expect(ta.tagName).toBe('TEXTAREA')
    expect(document.body.contains(ta)).toBe(true)
    expect(document.activeElement).toBe(ta)
    expect(ta.value).toBe('Hello')
    // The textarea auto-suppresses global shortcuts (Ctrl+Z etc.) while focused.
    expect(isEditableTarget(ta)).toBe(true)
    // Real <text> hidden but kept in the DOM (identity/selection survive).
    expect((text as SVGElement).style.visibility).toBe('hidden')
    expect(text.isConnected).toBe(true)
  })

  it('commit with UNCHANGED text pushes no command and restores visibility', () => {
    const { text, svg, history } = setup('Hello')
    const ta = enterTextEdit(text, svg, null, history)
    fireBlur(ta) // value untouched
    expect(history.canUndo).toBe(false)
    expect(text.textContent).toBe('Hello')
    expect((text as SVGElement).style.visibility).toBe('')
    expect(document.querySelector('textarea')).toBeNull()
  })

  it('commit with CHANGED text executes one EditTextCommand', () => {
    const { text, svg, history } = setup('Hello')
    const ta = enterTextEdit(text, svg, null, history)
    ta.value = 'World'
    fireBlur(ta)
    expect(history.canUndo).toBe(true)
    expect(text.textContent).toBe('World')
    expect((text as SVGElement).style.visibility).toBe('')
    // Undo restores the original run byte-exact (incl. the x-array).
    history.undo()
    expect(text.textContent).toBe('Hello')
    expect(text.querySelector('tspan')!.getAttribute('x')).toBe('10 14 19 23 27')
  })

  it('Enter commits without inserting a newline', () => {
    const { text, svg, history } = setup('Hello')
    const ta = enterTextEdit(text, svg, null, history)
    ta.value = 'World'
    fireKey(ta, 'Enter')
    expect(history.canUndo).toBe(true)
    expect(text.textContent).toBe('World')
    expect(document.querySelector('textarea')).toBeNull()
  })

  it('Escape discards the edit (no command, original restored)', () => {
    const { text, svg, history } = setup('Hello')
    const ta = enterTextEdit(text, svg, null, history)
    ta.value = 'World'
    fireKey(ta, 'Escape')
    expect(history.canUndo).toBe(false)
    expect(text.textContent).toBe('Hello')
    expect((text as SVGElement).style.visibility).toBe('')
    expect(document.querySelector('textarea')).toBeNull()
  })

  it('emptying the run REVERTS in v1 (no command, original kept)', () => {
    const { text, svg, history } = setup('Hello')
    const ta = enterTextEdit(text, svg, null, history)
    ta.value = '   '
    fireBlur(ta)
    expect(history.canUndo).toBe(false)
    expect(text.textContent).toBe('Hello')
  })
})
