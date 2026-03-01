import { createContext, useContext, useEffect, useMemo, useRef } from 'react'
import type { ReactNode } from 'react'
import { CommandHistory, RemoveElementCommand, CompoundCommand } from './commands'
import { createDocumentModel } from './document'
import type { DocumentModel } from './document'
import { getSelection, clearSelection } from './selection'

interface EditorContextValue {
  history: CommandHistory
  doc: DocumentModel | null
  setSvg: (svg: SVGSVGElement) => void
}

const EditorContext = createContext<EditorContextValue | null>(null)

export function EditorProvider({ children }: { children: ReactNode }) {
  const history = useMemo(() => new CommandHistory(), [])
  const docRef = useRef<DocumentModel | null>(null)

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

      if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        history.undo()
      } else if (e.ctrlKey && e.key === 'Z' && e.shiftKey) {
        e.preventDefault()
        history.redo()
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
