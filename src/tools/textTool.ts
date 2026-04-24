import { registerTool, setActiveTool, setKeyboardCapture } from './registry'
import type { ToolConfig } from './registry'
import { screenToDoc } from '../model/coordinates'
import { AddElementCommand } from '../model/commands'
import type { DocumentModel } from '../model/document'
import type { CommandHistory } from '../model/commands'
import type { Point } from '../model/coordinates'
import { getDefaultStyle } from '../model/defaultStyle'
import { setSelection } from '../model/selection'

const DEFAULT_FONT_FAMILY = 'sans-serif'
const DEFAULT_FONT_SIZE = 16

interface TextToolState {
  editing: boolean
  text: string
  cursorPos: number
  selStart: number // selection anchor (where shift+arrow started)
  selEnd: number   // selection cursor end
  position: Point
  previewText: SVGTextElement | null
  caret: SVGLineElement | null
  selectionRect: SVGRectElement | null
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
    cursorPos: 0,
    selStart: 0,
    selEnd: 0,
    position: { x: 0, y: 0 },
    previewText: null,
    caret: null,
    selectionRect: null,
    caretVisible: true,
    caretInterval: null,
  }

  function caretDocSize(svg: SVGSVGElement): number {
    const vb = svg.viewBox.baseVal
    if (vb.width === 0 || svg.clientWidth === 0) return 1
    return 1 * (vb.width / svg.clientWidth)
  }

  /** Approximate x-offset for a character position in the text */
  function charOffset(pos: number): number {
    if (pos === 0 || !state.previewText) return 0
    try {
      // Try getSubStringLength for accurate measurement
      if (state.previewText.getSubStringLength) {
        return state.previewText.getSubStringLength(0, pos)
      }
    } catch {
      // fallback
    }
    // Approximate fallback
    const totalLen = (() => {
      try { return state.previewText!.getComputedTextLength() } catch { return 0 }
    })()
    if (totalLen === 0 || state.text.length === 0) {
      return pos * DEFAULT_FONT_SIZE * 0.6
    }
    return totalLen * (pos / state.text.length)
  }

  function hasSelection(): boolean {
    return state.selStart !== state.selEnd
  }

  function selectionRange(): [number, number] {
    return [Math.min(state.selStart, state.selEnd), Math.max(state.selStart, state.selEnd)]
  }

  function clearTextSelection() {
    state.selStart = state.cursorPos
    state.selEnd = state.cursorPos
    if (state.selectionRect) {
      state.selectionRect.style.display = 'none'
    }
  }

  function updateSelectionVisual(_svg: SVGSVGElement) {
    if (!state.selectionRect) return
    if (!hasSelection()) {
      state.selectionRect.style.display = 'none'
      return
    }
    const [start, end] = selectionRange()
    const x1 = state.position.x + charOffset(start)
    const x2 = state.position.x + charOffset(end)
    const y = state.position.y - DEFAULT_FONT_SIZE * 0.8
    const h = DEFAULT_FONT_SIZE

    state.selectionRect.setAttribute('x', String(x1))
    state.selectionRect.setAttribute('y', String(y))
    state.selectionRect.setAttribute('width', String(Math.max(x2 - x1, 0.1)))
    state.selectionRect.setAttribute('height', String(h))
    state.selectionRect.style.display = ''
  }

  function updateCaret(svg: SVGSVGElement) {
    if (!state.caret) return

    const x = state.position.x + charOffset(state.cursorPos)
    const y1 = state.position.y - DEFAULT_FONT_SIZE * 0.8
    const y2 = state.position.y + DEFAULT_FONT_SIZE * 0.2

    state.caret.setAttribute('x1', String(x))
    state.caret.setAttribute('y1', String(y1))
    state.caret.setAttribute('x2', String(x))
    state.caret.setAttribute('y2', String(y2))

    updateSelectionVisual(svg)
  }

  function startBlink(_svg: SVGSVGElement) {
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
    state.selectionRect?.remove()
    state.previewText = null
    state.caret = null
    state.selectionRect = null
    state.text = ''
    state.cursorPos = 0
    state.selStart = 0
    state.selEnd = 0
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
    const defaults = getDefaultStyle()
    // Text uses fill for its color (not stroke). Use stroke default as text fill
    // when the fill default is 'none' (common for shape tools).
    const textFill = defaults.fill !== 'none' ? defaults.fill : defaults.stroke
    const cmd = new AddElementCommand(doc, layer, 'text', {
      x: String(pos.x),
      y: String(pos.y),
      'font-family': DEFAULT_FONT_FAMILY,
      'font-size': String(DEFAULT_FONT_SIZE),
      fill: textFill,
    })
    history.execute(cmd)

    const el = cmd.getElement()
    if (el) {
      el.textContent = textContent
      // Auto-select the committed text + switch to the select tool so the
      // Properties panel / Frame inputs operate on it immediately. Mirrors
      // rectTool's post-create pattern. Without this, after Escape the
      // selection is empty and the Frame inputs disappear.
      setSelection([el])
      setActiveTool('select')
    }
  }

  function updatePreview() {
    if (state.previewText) {
      state.previewText.textContent = state.text
    }
  }

  function deleteSelection() {
    if (!hasSelection()) return false
    const [start, end] = selectionRange()
    state.text = state.text.slice(0, start) + state.text.slice(end)
    state.cursorPos = start
    clearTextSelection()
    updatePreview()
    return true
  }

  function startEditing(svg: SVGSVGElement, pos: Point) {
    state.editing = true
    state.text = ''
    state.cursorPos = 0
    state.selStart = 0
    state.selEnd = 0
    state.position = pos
    setKeyboardCapture(true)

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

    // Selection highlight rect
    const selRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    selRect.setAttribute('fill', '#2563eb')
    selRect.setAttribute('opacity', '0.3')
    selRect.setAttribute('data-role', 'preview')
    selRect.setAttribute('pointer-events', 'none')
    selRect.style.display = 'none'
    svg.appendChild(selRect)
    state.selectionRect = selRect

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
    onDeactivate() {
      if (state.editing) commit()
    },
    handlers: {
      onMouseDown(e: MouseEvent) {
        const svg = getSvg()
        if (!svg || e.button !== 0) return
        const pt = screenToDoc(svg, e.clientX, e.clientY)

        if (state.editing) {
          commit()
          startEditing(svg, pt)
        } else {
          startEditing(svg, pt)
        }
      },

      onKeyDown(e: KeyboardEvent) {
        if (!state.editing) return
        const svg = getSvg()

        if (e.key === 'Escape' || e.key === 'Enter') {
          e.preventDefault()
          commit()
          return
        }

        if (e.key === 'ArrowLeft') {
          e.preventDefault()
          if (e.shiftKey) {
            if (state.selStart === state.selEnd) {
              state.selStart = state.cursorPos
            }
            state.cursorPos = Math.max(0, state.cursorPos - 1)
            state.selEnd = state.cursorPos
          } else {
            if (hasSelection()) {
              state.cursorPos = selectionRange()[0]
              clearTextSelection()
            } else {
              state.cursorPos = Math.max(0, state.cursorPos - 1)
              clearTextSelection()
            }
          }
          if (svg) updateCaret(svg)
          return
        }

        if (e.key === 'ArrowRight') {
          e.preventDefault()
          if (e.shiftKey) {
            if (state.selStart === state.selEnd) {
              state.selStart = state.cursorPos
            }
            state.cursorPos = Math.min(state.text.length, state.cursorPos + 1)
            state.selEnd = state.cursorPos
          } else {
            if (hasSelection()) {
              state.cursorPos = selectionRange()[1]
              clearTextSelection()
            } else {
              state.cursorPos = Math.min(state.text.length, state.cursorPos + 1)
              clearTextSelection()
            }
          }
          if (svg) updateCaret(svg)
          return
        }

        if (e.key === 'Home') {
          e.preventDefault()
          if (e.shiftKey) {
            if (state.selStart === state.selEnd) state.selStart = state.cursorPos
            state.cursorPos = 0
            state.selEnd = 0
          } else {
            state.cursorPos = 0
            clearTextSelection()
          }
          if (svg) updateCaret(svg)
          return
        }

        if (e.key === 'End') {
          e.preventDefault()
          if (e.shiftKey) {
            if (state.selStart === state.selEnd) state.selStart = state.cursorPos
            state.cursorPos = state.text.length
            state.selEnd = state.text.length
          } else {
            state.cursorPos = state.text.length
            clearTextSelection()
          }
          if (svg) updateCaret(svg)
          return
        }

        if (e.key === 'Backspace') {
          e.preventDefault()
          if (deleteSelection()) {
            if (svg) updateCaret(svg)
            return
          }
          if (state.cursorPos > 0) {
            state.text = state.text.slice(0, state.cursorPos - 1) + state.text.slice(state.cursorPos)
            state.cursorPos--
            clearTextSelection()
            updatePreview()
            if (svg) updateCaret(svg)
          }
          return
        }

        if (e.key === 'Delete') {
          e.preventDefault()
          if (deleteSelection()) {
            if (svg) updateCaret(svg)
            return
          }
          if (state.cursorPos < state.text.length) {
            state.text = state.text.slice(0, state.cursorPos) + state.text.slice(state.cursorPos + 1)
            clearTextSelection()
            updatePreview()
            if (svg) updateCaret(svg)
          }
          return
        }

        // Ctrl+A: select all
        if (e.ctrlKey && e.key === 'a') {
          e.preventDefault()
          state.selStart = 0
          state.selEnd = state.text.length
          state.cursorPos = state.text.length
          if (svg) updateCaret(svg)
          return
        }

        // Skip non-printable keys and other Ctrl combos
        if (e.ctrlKey || e.altKey || e.metaKey) return
        if (e.key.length !== 1) return

        e.preventDefault()
        // Delete selection if exists, then insert
        deleteSelection()
        state.text = state.text.slice(0, state.cursorPos) + e.key + state.text.slice(state.cursorPos)
        state.cursorPos++
        clearTextSelection()
        updatePreview()
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
