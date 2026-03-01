import { useEffect } from 'react'
import { findToolByShortcut, setActiveTool } from './registry'

export function useToolShortcuts(): void {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.ctrlKey || e.altKey || e.metaKey) return

      const tool = findToolByShortcut(e.key)
      if (tool) {
        e.preventDefault()
        setActiveTool(tool.name)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])
}
