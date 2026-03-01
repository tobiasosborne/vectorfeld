import { createContext, useContext, useEffect, useMemo, useRef } from 'react'
import type { ReactNode } from 'react'
import { CommandHistory, AddElementCommand, RemoveElementCommand, ModifyAttributeCommand, CompoundCommand } from './commands'
import { createDocumentModel } from './document'
import type { DocumentModel } from './document'
import { generateId } from './document'
import { getSelection, setSelection, clearSelection, refreshOverlay } from './selection'

interface EditorContextValue {
  history: CommandHistory
  doc: DocumentModel | null
  setSvg: (svg: SVGSVGElement) => void
}

const EditorContext = createContext<EditorContextValue | null>(null)

export function EditorProvider({ children }: { children: ReactNode }) {
  const history = useMemo(() => new CommandHistory(), [])
  const docRef = useRef<DocumentModel | null>(null)
  const clipboardRef = useRef<string[]>([])

  const value = useMemo<EditorContextValue>(
    () => ({
      history,
      get doc() {
        return docRef.current
      },
      setSvg(svg: SVGSVGElement) {
        docRef.current = createDocumentModel(svg)
      },
    }),
    [history]
  )

  // Undo/redo keybindings
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      const pasteClipboard = () => {
        if (clipboardRef.current.length === 0 || !docRef.current) return
        const doc = docRef.current
        const layer = doc.getActiveLayer()
        if (!layer) return
        const cmds: AddElementCommand[] = []
        for (const html of clipboardRef.current) {
          const temp = document.createElementNS('http://www.w3.org/2000/svg', 'g')
          temp.innerHTML = html
          const original = temp.firstElementChild
          if (!original) continue
          const attrs: Record<string, string> = {}
          for (const attr of original.attributes) {
            attrs[attr.name] = attr.value
          }
          // Offset pasted elements by 5mm
          const tag = original.tagName
          if (tag === 'rect' || tag === 'text') {
            attrs.x = String(parseFloat(attrs.x || '0') + 5)
            attrs.y = String(parseFloat(attrs.y || '0') + 5)
          } else if (tag === 'ellipse' || tag === 'circle') {
            attrs.cx = String(parseFloat(attrs.cx || '0') + 5)
            attrs.cy = String(parseFloat(attrs.cy || '0') + 5)
          } else if (tag === 'line') {
            attrs.x1 = String(parseFloat(attrs.x1 || '0') + 5)
            attrs.y1 = String(parseFloat(attrs.y1 || '0') + 5)
            attrs.x2 = String(parseFloat(attrs.x2 || '0') + 5)
            attrs.y2 = String(parseFloat(attrs.y2 || '0') + 5)
          }
          attrs.id = generateId()
          const cmd = new AddElementCommand(doc, layer, tag, attrs)
          cmds.push(cmd)
        }
        if (cmds.length > 0) {
          const compound = new CompoundCommand(cmds, 'Paste')
          history.execute(compound)
          // Select pasted elements
          const pasted = cmds.map((c) => c.getElement()).filter(Boolean) as Element[]
          setSelection(pasted)
        }
      }

      if (e.ctrlKey && e.key === 'c' && !e.shiftKey) {
        const sel = getSelection()
        if (sel.length > 0) {
          e.preventDefault()
          const serializer = new XMLSerializer()
          clipboardRef.current = sel.map((el) => serializer.serializeToString(el))
        }
      } else if (e.ctrlKey && e.key === 'x' && !e.shiftKey) {
        const sel = getSelection()
        if (sel.length > 0 && docRef.current) {
          e.preventDefault()
          const serializer = new XMLSerializer()
          clipboardRef.current = sel.map((el) => serializer.serializeToString(el))
          const cmds = sel.map((el) => new RemoveElementCommand(docRef.current!, el))
          history.execute(new CompoundCommand(cmds, 'Cut'))
          clearSelection()
        }
      } else if (e.ctrlKey && e.key === 'v' && !e.shiftKey) {
        e.preventDefault()
        pasteClipboard()
      } else if (e.ctrlKey && e.key === 'd' && !e.shiftKey) {
        const sel = getSelection()
        if (sel.length > 0) {
          e.preventDefault()
          const serializer = new XMLSerializer()
          clipboardRef.current = sel.map((el) => serializer.serializeToString(el))
          pasteClipboard()
        }
      } else if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        history.undo()
      } else if (e.ctrlKey && e.key === 'Z' && e.shiftKey) {
        e.preventDefault()
        history.redo()
      } else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && !e.ctrlKey) {
        const sel = getSelection()
        if (sel.length > 0) {
          e.preventDefault()
          const step = e.shiftKey ? 10 : 1
          const dx = e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0
          const dy = e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0
          const cmds: ModifyAttributeCommand[] = []
          for (const el of sel) {
            const tag = el.tagName
            if (tag === 'line') {
              cmds.push(new ModifyAttributeCommand(el, 'x1', String(parseFloat(el.getAttribute('x1') || '0') + dx)))
              cmds.push(new ModifyAttributeCommand(el, 'y1', String(parseFloat(el.getAttribute('y1') || '0') + dy)))
              cmds.push(new ModifyAttributeCommand(el, 'x2', String(parseFloat(el.getAttribute('x2') || '0') + dx)))
              cmds.push(new ModifyAttributeCommand(el, 'y2', String(parseFloat(el.getAttribute('y2') || '0') + dy)))
            } else if (tag === 'rect' || tag === 'text') {
              cmds.push(new ModifyAttributeCommand(el, 'x', String(parseFloat(el.getAttribute('x') || '0') + dx)))
              cmds.push(new ModifyAttributeCommand(el, 'y', String(parseFloat(el.getAttribute('y') || '0') + dy)))
            } else if (tag === 'ellipse' || tag === 'circle') {
              cmds.push(new ModifyAttributeCommand(el, 'cx', String(parseFloat(el.getAttribute('cx') || '0') + dx)))
              cmds.push(new ModifyAttributeCommand(el, 'cy', String(parseFloat(el.getAttribute('cy') || '0') + dy)))
            }
          }
          if (cmds.length > 0) {
            history.execute(new CompoundCommand(cmds, 'Nudge'))
            refreshOverlay()
          }
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
