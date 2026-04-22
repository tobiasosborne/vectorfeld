import { useEffect, useRef } from 'react'

export interface ContextMenuItem {
  label: string
  action: () => void
  separator?: boolean
  disabled?: boolean
}

interface ContextMenuProps {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', handleClick)
    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('mousedown', handleClick)
      window.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      className="fixed bg-white border border-chrome-300 shadow-lg rounded min-w-[160px] py-1 z-[100]"
      style={{ left: x, top: y }}
    >
      {items.map((item, i) =>
        item.separator ? (
          <div key={i} className="border-t border-chrome-200 my-1" />
        ) : (
          <button
            key={i}
            className="w-full text-left px-3 py-1 text-xs hover:bg-accent/10 disabled:opacity-40 disabled:cursor-default"
            disabled={item.disabled}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => { item.action(); onClose() }}
          >
            {item.label}
          </button>
        )
      )}
    </div>
  )
}
