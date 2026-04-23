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
      data-role="panel"
      style={{
        position: 'fixed',
        left: x,
        top: y,
        minWidth: 180,
        padding: 4,
        zIndex: 100,
        background: 'var(--color-panel-solid)',
        border: '1px solid var(--color-border)',
        borderRadius: 10,
        boxShadow: '0 10px 30px -8px rgba(60,40,20,0.18)',
      }}
    >
      {items.map((item, i) =>
        item.separator ? (
          <div key={i} style={{ borderTop: '1px solid var(--color-border)', margin: '4px 0' }} />
        ) : (
          <button
            key={i}
            disabled={item.disabled}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => { item.action(); onClose() }}
            style={{
              width: '100%',
              textAlign: 'left',
              padding: '6px 10px',
              fontSize: 12,
              background: 'transparent',
              border: 0,
              borderRadius: 6,
              color: item.disabled ? 'var(--color-faint)' : 'var(--color-text)',
              cursor: 'default',
              opacity: item.disabled ? 0.5 : 1,
            }}
            onMouseEnter={(e) => { if (!item.disabled) e.currentTarget.style.background = 'var(--color-accent-tint)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
          >
            {item.label}
          </button>
        )
      )}
    </div>
  )
}
