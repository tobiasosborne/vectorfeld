import { useState, useRef, useEffect } from 'react'

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

interface MenuBarProps {
  menus: MenuDef[]
}

export function MenuBar({ menus }: MenuBarProps) {
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
    <div ref={barRef} className="h-7 bg-chrome-100 border-b border-chrome-300 flex items-center px-1 gap-0">
      <span className="text-xs font-semibold text-chrome-700 select-none px-2 mr-1">vectorfeld</span>
      {menus.map((menu, idx) => (
        <div key={menu.label} className="relative">
          <button
            className={`px-2 py-0.5 text-xs hover:bg-chrome-200 rounded ${openMenu === idx ? 'bg-chrome-200' : ''}`}
            onClick={() => setOpenMenu(openMenu === idx ? null : idx)}
            onMouseEnter={() => openMenu !== null && setOpenMenu(idx)}
          >
            {menu.label}
          </button>
          {openMenu === idx && (
            <div className="absolute top-full left-0 mt-0.5 bg-white border border-chrome-300 shadow-md rounded min-w-[180px] py-1 z-50">
              {menu.items.map((item, i) =>
                item.separator ? (
                  <div key={i} className="border-t border-chrome-200 my-1" />
                ) : (
                  <button
                    key={i}
                    disabled={item.disabled}
                    className={`w-full text-left px-3 py-1 text-xs flex justify-between items-center ${item.disabled ? 'text-chrome-300 cursor-default' : 'hover:bg-accent/10'}`}
                    onClick={() => {
                      if (item.disabled) return
                      item.action?.()
                      setOpenMenu(null)
                    }}
                  >
                    <span>{item.label}</span>
                    {item.shortcut && (
                      <span className={`ml-4 ${item.disabled ? 'text-chrome-300' : 'text-chrome-400'}`}>{item.shortcut}</span>
                    )}
                  </button>
                )
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
