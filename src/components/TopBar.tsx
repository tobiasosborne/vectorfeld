import { useState, useRef, useEffect, type CSSProperties } from 'react'

interface MenuItem {
  label: string
  shortcut?: string
  action?: () => void
  separator?: boolean
  disabled?: boolean
}

interface MenuDef {
  label: string
  items: MenuItem[]
}

interface TopBarProps {
  menus: MenuDef[]
  activeDocName: string
  dirty: boolean
  onExportPdf: () => void
  onSplit?: () => void   // inert in v1 — multi-doc work in vectorfeld-4w7
}

const tabStyle = (active: boolean): CSSProperties => ({
  height: 30,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '0 14px',
  borderRadius: 999,
  background: active ? 'var(--color-panel-solid)' : 'transparent',
  boxShadow: active
    ? '0 0 0 1px var(--color-border), 0 2px 6px rgba(60,40,20,0.06)'
    : 'none',
  color: active ? 'var(--color-text)' : 'var(--color-muted)',
  fontSize: 12.5,
  fontWeight: active ? 500 : 400,
  cursor: 'default',
  whiteSpace: 'nowrap',
})

const menuWordStyle: CSSProperties = {
  fontSize: 12.5,
  color: 'var(--color-muted)',
  padding: '4px 6px',
  cursor: 'default',
  background: 'transparent',
  border: 0,
  borderRadius: 6,
}

export function TopBar({ menus, activeDocName, dirty, onExportPdf, onSplit }: TopBarProps) {
  const [openMenu, setOpenMenu] = useState<number | null>(null)
  const barRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (openMenu === null) return
    const handleClick = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setOpenMenu(null)
      }
    }
    window.addEventListener('mousedown', handleClick)
    return () => window.removeEventListener('mousedown', handleClick)
  }, [openMenu])

  return (
    <div ref={barRef} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', minWidth: 0 }}>
      {/* Brand mark + menu words */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingLeft: 8 }}>
        <div
          data-role="brand"
          style={{
            width: 22,
            height: 22,
            borderRadius: 7,
            background: 'linear-gradient(135deg, var(--color-accent), var(--color-accent-text))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div style={{ width: 7, height: 11, background: 'var(--color-panel-solid)', borderRadius: 2 }} />
        </div>
        <div style={{ width: 1, height: 20, background: 'var(--color-border)' }} />
        {menus.map((menu, idx) => (
          <div key={menu.label} style={{ position: 'relative' }}>
            <button
              style={{ ...menuWordStyle, background: openMenu === idx ? 'var(--color-panel-solid)' : 'transparent' }}
              onClick={() => setOpenMenu(openMenu === idx ? null : idx)}
              onMouseEnter={() => openMenu !== null && setOpenMenu(idx)}
            >
              {menu.label}
            </button>
            {openMenu === idx && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  marginTop: 4,
                  background: 'var(--color-panel-solid)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 10,
                  boxShadow: '0 10px 30px -8px rgba(60,40,20,0.18)',
                  minWidth: 220,
                  padding: 4,
                  zIndex: 50,
                }}
              >
                {menu.items.map((item, i) =>
                  item.separator ? (
                    <div key={i} style={{ borderTop: '1px solid var(--color-border)', margin: '4px 0' }} />
                  ) : (
                    <button
                      key={i}
                      disabled={item.disabled}
                      onClick={() => {
                        if (item.disabled) return
                        item.action?.()
                        setOpenMenu(null)
                      }}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '6px 10px',
                        fontSize: 12,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 14,
                        whiteSpace: 'nowrap',
                        background: 'transparent',
                        border: 0,
                        borderRadius: 6,
                        color: item.disabled ? 'var(--color-faint)' : 'var(--color-text)',
                        cursor: item.disabled ? 'default' : 'default',
                      }}
                      onMouseEnter={e => { if (!item.disabled) e.currentTarget.style.background = 'var(--color-accent-tint)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                    >
                      <span>{item.label}</span>
                      {item.shortcut && (
                        <span style={{ color: 'var(--color-faint)', fontSize: 11 }}>{item.shortcut}</span>
                      )}
                    </button>
                  ),
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Tabs — single-doc stub for v1, multi-doc lands in vectorfeld-4w7 */}
      <div style={{ display: 'flex', gap: 4, flex: 1, overflow: 'hidden', marginLeft: 12 }}>
        <div data-role="tab" style={tabStyle(true)}>
          {dirty && (
            <div
              data-role="tab-dirty-dot"
              style={{ width: 5, height: 5, borderRadius: 99, background: 'var(--color-accent)' }}
            />
          )}
          <span>{activeDocName}</span>
        </div>
      </div>

      {/* Split (inert stub) + Export PDF */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button
          data-role="split"
          onClick={onSplit}
          title="Split view (coming in multi-doc)"
          style={{
            height: 28,
            padding: '0 12px',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'transparent',
            border: '1px solid var(--color-border)',
            borderRadius: 999,
            color: 'var(--color-muted)',
            fontSize: 12,
            cursor: 'default',
          }}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
            <rect x="2" y="3" width="5" height="10" rx="1" stroke="currentColor" strokeWidth="1.2" />
            <rect x="9" y="3" width="5" height="10" rx="1" stroke="currentColor" strokeWidth="1.2" />
          </svg>
          Split
        </button>
        <button
          onClick={onExportPdf}
          style={{
            height: 28,
            padding: '0 14px',
            background: 'linear-gradient(180deg, var(--color-accent), var(--color-accent-text))',
            color: '#fff',
            border: 0,
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 500,
            boxShadow: '0 4px 10px -4px var(--color-accent), 0 1px 0 rgba(255,255,255,0.25) inset',
            cursor: 'default',
          }}
        >
          Export PDF
        </button>
      </div>
    </div>
  )
}
