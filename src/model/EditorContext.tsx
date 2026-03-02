import { createContext, useContext, useEffect, useMemo, useRef } from 'react'
import type { ReactNode } from 'react'
import { CommandHistory, AddElementCommand, RemoveElementCommand, ModifyAttributeCommand, CompoundCommand, ReorderElementCommand, GroupCommand, UngroupCommand } from './commands'
import { createDocumentModel } from './document'
import type { DocumentModel } from './document'
import { generateId } from './document'
import { getSelection, setSelection, clearSelection, refreshOverlay } from './selection'
import { isKeyboardCaptured } from '../tools/registry'
import { toggleGridVisible, toggleGridSnap } from '../model/grid'

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
          const pasteOffset = 5
          if (tag === 'rect' || tag === 'text' || tag === 'image') {
            attrs.x = String(parseFloat(attrs.x || '0') + pasteOffset)
            attrs.y = String(parseFloat(attrs.y || '0') + pasteOffset)
          } else if (tag === 'ellipse' || tag === 'circle') {
            attrs.cx = String(parseFloat(attrs.cx || '0') + pasteOffset)
            attrs.cy = String(parseFloat(attrs.cy || '0') + pasteOffset)
          } else if (tag === 'line') {
            attrs.x1 = String(parseFloat(attrs.x1 || '0') + pasteOffset)
            attrs.y1 = String(parseFloat(attrs.y1 || '0') + pasteOffset)
            attrs.x2 = String(parseFloat(attrs.x2 || '0') + pasteOffset)
            attrs.y2 = String(parseFloat(attrs.y2 || '0') + pasteOffset)
          } else if (tag === 'path' || tag === 'g') {
            // For path/group: offset via translate in transform
            const existing = attrs.transform || ''
            attrs.transform = `translate(${pasteOffset}, ${pasteOffset}) ${existing}`.trim()
          }
          // Update rotation center in transform if present
          if (attrs.transform) {
            const rotMatch = attrs.transform.match(/rotate\(([-\d.]+)(?:,\s*([-\d.]+),\s*([-\d.]+))?\)/)
            if (rotMatch && tag !== 'path' && tag !== 'g') {
              const angle = rotMatch[1]
              const cx = parseFloat(rotMatch[2] || '0') + pasteOffset
              const cy = parseFloat(rotMatch[3] || '0') + pasteOffset
              attrs.transform = `rotate(${angle}, ${cx}, ${cy})`
            }
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

      // Skip single-key bindings during keyboard capture (text editing)
      // but still allow Ctrl combos
      if (isKeyboardCaptured() && !e.ctrlKey) return

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
        const sel = getSelection()
        if (sel.length > 0) {
          e.preventDefault()
          const step = e.shiftKey ? 10 : 1
          const dx = e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0
          const dy = e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0
          const cmds: ModifyAttributeCommand[] = []
          for (const el of sel) {
            const tag = el.tagName
            if (tag === 'image') {
              cmds.push(new ModifyAttributeCommand(el, 'x', String(parseFloat(el.getAttribute('x') || '0') + dx)))
              cmds.push(new ModifyAttributeCommand(el, 'y', String(parseFloat(el.getAttribute('y') || '0') + dy)))
            } else if (tag === 'line') {
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
            } else if (tag === 'path' || tag === 'g') {
              // Move via translate transform
              const existing = el.getAttribute('transform') || ''
              const transMatch = existing.match(/translate\(([-\d.]+),\s*([-\d.]+)\)/)
              const tx = (transMatch ? parseFloat(transMatch[1]) : 0) + dx
              const ty = (transMatch ? parseFloat(transMatch[2]) : 0) + dy
              const newTransform = transMatch
                ? existing.replace(/translate\([-\d.]+,\s*[-\d.]+\)/, `translate(${tx}, ${ty})`)
                : `translate(${tx}, ${ty}) ${existing}`.trim()
              cmds.push(new ModifyAttributeCommand(el, 'transform', newTransform))
            }
            // Update rotation center in transform
            const transform = el.getAttribute('transform')
            if (transform && tag !== 'path' && tag !== 'g') {
              const rotMatch = transform.match(/rotate\(([-\d.]+)(?:,\s*([-\d.]+),\s*([-\d.]+))?\)/)
              if (rotMatch) {
                const angle = rotMatch[1]
                const cx = parseFloat(rotMatch[2] || '0') + dx
                const cy = parseFloat(rotMatch[3] || '0') + dy
                cmds.push(new ModifyAttributeCommand(el, 'transform', `rotate(${angle}, ${cx}, ${cy})`))
              }
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
      } else if (e.ctrlKey && (e.key === "'" || e.key === '"') && !e.shiftKey) {
        // Toggle grid
        e.preventDefault()
        toggleGridVisible()
      } else if (e.ctrlKey && (e.key === '"' || (e.key === "'" && e.shiftKey))) {
        // Toggle snap-to-grid (Shift+' produces " on most keyboards)
        e.preventDefault()
        toggleGridSnap()
      } else if (e.ctrlKey && (e.key === ']' || e.code === 'BracketRight') && !e.shiftKey) {
        // Bring forward (one step)
        const sel = getSelection()
        if (sel.length === 1) {
          e.preventDefault()
          const el = sel[0]
          const next = el.nextElementSibling
          if (next) {
            const target = next.nextElementSibling // insert after next
            history.execute(new ReorderElementCommand(el, target, 'Bring Forward'))
            refreshOverlay()
          }
        }
      } else if (e.ctrlKey && (e.key === '[' || e.code === 'BracketLeft') && !e.shiftKey) {
        // Send backward (one step)
        const sel = getSelection()
        if (sel.length === 1) {
          e.preventDefault()
          const el = sel[0]
          const prev = el.previousElementSibling
          if (prev) {
            history.execute(new ReorderElementCommand(el, prev, 'Send Backward'))
            refreshOverlay()
          }
        }
      } else if (e.ctrlKey && e.shiftKey && (e.key === '}' || e.code === 'BracketRight')) {
        // Bring to front
        const sel = getSelection()
        if (sel.length === 1) {
          e.preventDefault()
          const el = sel[0]
          history.execute(new ReorderElementCommand(el, null, 'Bring to Front'))
          refreshOverlay()
        }
      } else if (e.ctrlKey && e.shiftKey && (e.key === '{' || e.code === 'BracketLeft')) {
        // Send to back
        const sel = getSelection()
        if (sel.length === 1) {
          e.preventDefault()
          const el = sel[0]
          const parent = el.parentElement
          if (parent && parent.firstElementChild !== el) {
            history.execute(new ReorderElementCommand(el, parent.firstElementChild, 'Send to Back'))
            refreshOverlay()
          }
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
