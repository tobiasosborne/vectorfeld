import { registerTool, setKeyboardCapture } from './registry'
import type { ToolConfig } from './registry'
import { screenToDoc } from '../model/coordinates'
import { AddElementCommand } from '../model/commands'
import type { DocumentModel } from '../model/document'
import type { CommandHistory } from '../model/commands'
import type { Point } from '../model/coordinates'

const DEFAULT_FONT_FAMILY = 'sans-serif'
const DEFAULT_FONT_SIZE = 16 // px (SVG units = mm, so this is 16mm ≈ 45pt)

interface TextToolState {
  editing: boolean
  text: string
  position: Point
  previewText: SVGTextElement | null
  caret: SVGLineElement | null
  caretVisible: boolean
  caretInterval: ReturnType<typeof setInterval> | null
}

export function createTextTool(
  getSvg: () => SVGSVGElement | null,
  getDoc: () => DocumentModel | null,
  getHistory: () => CommandHistory
): ToolConfig {
  const state: TextToolState = {
    editing: false,
    text: '',
    position: { x: 0, y: 0 },
    previewText: null,
    caret: null,
    caretVisible: true,
    caretInterval: null,
  }

  function caretDocSize(svg: SVGSVGElement): number {
    const vb = svg.viewBox.baseVal
    if (vb.width === 0 || svg.clientWidth === 0) return 1
    return 1 * (vb.width / svg.clientWidth)
  }

  function updateCaret(svg: SVGSVGElement) {
    if (!state.caret || !state.previewText) return

    // Position caret after the last character
    let textWidth = 0
    try {
      textWidth = state.previewText.getComputedTextLength()
    } catch {
      // jsdom fallback: approximate width based on character count
      textWidth = state.text.length * DEFAULT_FONT_SIZE * 0.6
    }

    const x = state.position.x + textWidth
    const y1 = state.position.y - DEFAULT_FONT_SIZE * 0.8
    const y2 = state.position.y + DEFAULT_FONT_SIZE * 0.2

    state.caret.setAttribute('x1', String(x))
    state.caret.setAttribute('y1', String(y1))
    state.caret.setAttribute('x2', String(x))
    state.caret.setAttribute('y2', String(y2))
  }

  function startBlink(svg: SVGSVGElement) {
    stopBlink()
    state.caretVisible = true
    if (state.caret) state.caret.style.display = ''
    state.caretInterval = setInterval(() => {
      state.caretVisible = !state.caretVisible
      if (state.caret) {
        state.caret.style.display = state.caretVisible ? '' : 'none'
      }
    }, 530)
  }

  function stopBlink() {
    if (state.caretInterval !== null) {
      clearInterval(state.caretInterval)
      state.caretInterval = null
    }
  }

  function cleanup() {
    stopBlink()
    state.previewText?.remove()
    state.caret?.remove()
    state.previewText = null
    state.caret = null
    state.text = ''
    state.editing = false
    setKeyboardCapture(false)
  }

  function commit() {
    const svg = getSvg()
    if (!svg) { cleanup(); return }

    const textContent = state.text.trim()
    if (textContent.length === 0) { cleanup(); return }

    const pos = { ...state.position }
    cleanup()

    const doc = getDoc()
    if (!doc) return
    const layer = doc.getActiveLayer()
    if (!layer) return

    const history = getHistory()
    const cmd = new AddElementCommand(doc, layer, 'text', {
      x: String(pos.x),
      y: String(pos.y),
      'font-family': DEFAULT_FONT_FAMILY,
      'font-size': String(DEFAULT_FONT_SIZE),
      fill: '#000000',
    })
    history.execute(cmd)

    // Set text content on the created element (AddElementCommand only sets attributes).
    // The DOM node is reused on redo, so textContent persists through undo/redo.
    const el = cmd.getElement()
    if (el) {
      el.textContent = textContent
    }
  }

  function startEditing(svg: SVGSVGElement, pos: Point) {
    state.editing = true
    state.text = ''
    state.position = pos
    setKeyboardCapture(true)

    // Create preview text element
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    text.setAttribute('x', String(pos.x))
    text.setAttribute('y', String(pos.y))
    text.setAttribute('font-family', DEFAULT_FONT_FAMILY)
    text.setAttribute('font-size', String(DEFAULT_FONT_SIZE))
    text.setAttribute('fill', '#000000')
    text.setAttribute('data-role', 'preview')
    text.setAttribute('pointer-events', 'none')
    text.textContent = ''
    svg.appendChild(text)
    state.previewText = text

    // Create blinking caret
    const sw = caretDocSize(svg)
    const caret = document.createElementNS('http://www.w3.org/2000/svg', 'line')
    caret.setAttribute('stroke', '#000000')
    caret.setAttribute('stroke-width', String(sw))
    caret.setAttribute('data-role', 'preview')
    caret.setAttribute('pointer-events', 'none')
    svg.appendChild(caret)
    state.caret = caret

    updateCaret(svg)
    startBlink(svg)
  }

  return {
    name: 'text',
    icon: 'T',
    shortcut: 't',
    cursor: 'text',
    handlers: {
      onMouseDown(e: MouseEvent) {
        const svg = getSvg()
        if (!svg || e.button !== 0) return
        const pt = screenToDoc(svg, e.clientX, e.clientY)

        if (state.editing) {
          // Commit current text, then start new at new position
          commit()
          startEditing(svg, pt)
        } else {
          startEditing(svg, pt)
        }
      },

      onKeyDown(e: KeyboardEvent) {
        if (!state.editing) return
        const svg = getSvg()

        if (e.key === 'Escape') {
          e.preventDefault()
          commit()
          return
        }

        if (e.key === 'Enter') {
          e.preventDefault()
          commit()
          return
        }

        if (e.key === 'Backspace') {
          e.preventDefault()
          if (state.text.length > 0) {
            state.text = state.text.slice(0, -1)
            if (state.previewText) {
              state.previewText.textContent = state.text
            }
            if (svg) updateCaret(svg)
          }
          return
        }

        // Skip non-printable keys and Ctrl combos
        if (e.ctrlKey || e.altKey || e.metaKey) return
        if (e.key.length !== 1) return

        e.preventDefault()
        state.text += e.key
        if (state.previewText) {
          state.previewText.textContent = state.text
        }
        if (svg) updateCaret(svg)
      },
    },
  }
}

export function registerTextTool(
  getSvg: () => SVGSVGElement | null,
  getDoc: () => DocumentModel | null,
  getHistory: () => CommandHistory
): void {
  registerTool(createTextTool(getSvg, getDoc, getHistory))
}
