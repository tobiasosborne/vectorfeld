import { createContext, useContext, useEffect, useMemo, useRef } from 'react'
import type { ReactNode } from 'react'
import { CommandHistory, RemoveElementCommand, CompoundCommand, GroupCommand, UngroupCommand } from './commands'
import { createDocumentModel } from './document'
import type { DocumentModel } from './document'
import { generateId } from './document'
import { getSelection, setSelection, clearSelection } from './selection'
import { isKeyboardCaptured } from '../tools/registry'
import { toggleGridVisible, toggleGridSnap } from '../model/grid'
import { copySelection, cutSelection, pasteClipboard, duplicateSelection } from './clipboard'
import { nudgeSelection } from './nudge'
import { bringForward, sendBackward, bringToFront, sendToBack } from './zOrder'
import { DocumentState, captureActiveDocumentState, setActiveDocument } from './documentState'

interface EditorContextValue {
  history: CommandHistory
  doc: DocumentModel | null
  /** Per-document state bundle (selection, grid, guides, etc.).
   *  Swappable via setActiveDocument() when implementing multi-document. */
  state: DocumentState
  setSvg: (svg: SVGSVGElement) => void
}

const EditorContext = createContext<EditorContextValue | null>(null)

export function EditorProvider({ children }: { children: ReactNode }) {
  const history = useMemo(() => new CommandHistory(), [])
  const docRef = useRef<DocumentModel | null>(null)
  const clipboardRef = useRef<string[]>([])
  // On first mount, capture whatever singletons were already initialised at
  // module-load time into a single DocumentState. Future multi-doc support
  // will create additional DocumentStates and swap between them via
  // setActiveDocument(); for now there is exactly one.
  const stateRef = useRef<DocumentState | null>(null)
  if (!stateRef.current) {
    stateRef.current = captureActiveDocumentState()
    setActiveDocument(stateRef.current)
  }

  const value = useMemo<EditorContextValue>(
    () => ({
      history,
      get doc() {
        return docRef.current
      },
      get state() {
        return stateRef.current!
      },
      setSvg(svg: SVGSVGElement) {
        docRef.current = createDocumentModel(svg)
      },
    }),
    [history]
  )

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      // Skip single-key bindings during keyboard capture (text editing)
      // but still allow Ctrl combos
      if (isKeyboardCaptured() && !e.ctrlKey) return

      if (e.ctrlKey && e.key === 'c' && !e.shiftKey) {
        const sel = getSelection()
        if (sel.length > 0) {
          e.preventDefault()
          clipboardRef.current = copySelection()
        }
      } else if (e.ctrlKey && e.key === 'x' && !e.shiftKey) {
        if (getSelection().length > 0 && docRef.current) {
          e.preventDefault()
          cutSelection(clipboardRef, history, docRef.current)
        }
      } else if (e.ctrlKey && e.key === 'v' && !e.shiftKey) {
        e.preventDefault()
        if (docRef.current) pasteClipboard(clipboardRef, history, docRef.current)
      } else if (e.ctrlKey && e.key === 'd' && !e.shiftKey) {
        if (getSelection().length > 0 && docRef.current) {
          e.preventDefault()
          duplicateSelection(clipboardRef, history, docRef.current)
        }
      } else if (e.ctrlKey && e.key === 'g' && !e.shiftKey) {
        const sel = getSelection()
        if (sel.length > 0 && docRef.current) {
          e.preventDefault()
          const parent = sel[0].parentElement
          if (!parent) return
          const group = document.createElementNS('http://www.w3.org/2000/svg', 'g')
          group.setAttribute('id', generateId())
          const cmd = new GroupCommand(parent, group, sel)
          history.execute(cmd)
          setSelection([group])
        }
      } else if (e.ctrlKey && e.key === 'G' && e.shiftKey) {
        const sel = getSelection()
        if (sel.length === 1 && sel[0].tagName === 'g' && !sel[0].hasAttribute('data-layer-name')) {
          e.preventDefault()
          const group = sel[0]
          const parent = group.parentElement
          if (!parent) return
          const children = Array.from(group.children)
          const cmd = new UngroupCommand(parent, group)
          history.execute(cmd)
          setSelection(children)
        }
      } else if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        history.undo()
      } else if (e.ctrlKey && e.key === 'Z' && e.shiftKey) {
        e.preventDefault()
        history.redo()
      } else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && !e.ctrlKey) {
        if (getSelection().length > 0) {
          e.preventDefault()
          const step = e.shiftKey ? 10 : 1
          const dx = e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0
          const dy = e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0
          nudgeSelection(history, dx, dy)
        }
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && !e.ctrlKey) {
        const sel = getSelection()
        if (sel.length > 0 && docRef.current) {
          e.preventDefault()
          const cmds = sel.map((el) => new RemoveElementCommand(docRef.current!, el))
          const compound = new CompoundCommand(cmds, 'Delete')
          history.execute(compound)
          clearSelection()
        }
      } else if (e.ctrlKey && (e.key === "'" || e.key === '"') && !e.shiftKey) {
        e.preventDefault()
        toggleGridVisible()
      } else if (e.ctrlKey && (e.key === '"' || (e.key === "'" && e.shiftKey))) {
        e.preventDefault()
        toggleGridSnap()
      } else if (e.ctrlKey && (e.key === ']' || e.code === 'BracketRight') && !e.shiftKey) {
        e.preventDefault()
        bringForward(history)
      } else if (e.ctrlKey && (e.key === '[' || e.code === 'BracketLeft') && !e.shiftKey) {
        e.preventDefault()
        sendBackward(history)
      } else if (e.ctrlKey && e.shiftKey && (e.key === '}' || e.code === 'BracketRight')) {
        e.preventDefault()
        bringToFront(history)
      } else if (e.ctrlKey && e.shiftKey && (e.key === '{' || e.code === 'BracketLeft')) {
        e.preventDefault()
        sendToBack(history)
      } else if (e.ctrlKey && e.key === 'a' && !e.shiftKey) {
        e.preventDefault()
        if (docRef.current) {
          const layers = docRef.current.getLayerElements()
          const all: Element[] = []
          for (const layer of layers) {
            if (layer.getAttribute('data-locked') === 'true') continue
            if ((layer as SVGElement).style.display === 'none') continue
            for (const child of Array.from(layer.children)) {
              all.push(child)
            }
          }
          setSelection(all)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [history])

  return (
    <EditorContext.Provider value={value}>{children}</EditorContext.Provider>
  )
}

export function useEditor(): EditorContextValue {
  const ctx = useContext(EditorContext)
  if (!ctx) throw new Error('useEditor must be used within EditorProvider')
  return ctx
}
