import { useState, useRef, useEffect } from 'react'

const PRESET_COLORS = [
  '#000000', '#333333', '#666666', '#999999', '#cccccc', '#ffffff',
  '#ff0000', '#ff6600', '#ffcc00', '#33cc33', '#0099ff', '#6633ff',
  '#cc0066', '#ff3399', '#00cccc', '#336633', '#003366', '#660033',
]

interface ColorPickerProps {
  value: string
  onChange: (color: string) => void
  allowNone?: boolean
}

export function ColorPicker({ value, onChange, allowNone = true }: ColorPickerProps) {
  const [open, setOpen] = useState(false)
  const [hexInput, setHexInput] = useState(value)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setHexInput(value)
  }, [value])

  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const handleHexSubmit = () => {
    let hex = hexInput.trim()
    if (!hex.startsWith('#')) hex = '#' + hex
    if (/^#[0-9a-fA-F]{3,6}$/.test(hex)) {
      onChange(hex)
      setOpen(false)
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="w-6 h-6 border border-chrome-300 cursor-pointer"
        style={{
          backgroundColor: value === 'none' ? 'transparent' : value,
          backgroundImage: value === 'none'
            ? 'linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%), linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%)'
            : undefined,
          backgroundSize: value === 'none' ? '6px 6px' : undefined,
          backgroundPosition: value === 'none' ? '0 0, 3px 3px' : undefined,
        }}
        title={value}
      />
      {open && (
        <div className="absolute top-7 left-0 z-50 bg-white border border-chrome-300 p-2 shadow-lg w-44">
          <div className="grid grid-cols-6 gap-1 mb-2">
            {PRESET_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => { onChange(color); setOpen(false) }}
                className="w-5 h-5 border border-chrome-200 cursor-pointer"
                style={{ backgroundColor: color }}
                title={color}
              />
            ))}
          </div>
          {allowNone && (
            <button
              onClick={() => { onChange('none'); setOpen(false) }}
              className="text-xs text-chrome-500 hover:text-chrome-800 mb-1 block"
            >
              None (transparent)
            </button>
          )}
          <div className="flex gap-1">
            <input
              type="text"
              value={hexInput}
              onChange={(e) => setHexInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleHexSubmit()}
              className="flex-1 border border-chrome-300 px-1 py-0.5 text-xs font-mono"
              placeholder="#000000"
            />
            <button
              onClick={handleHexSubmit}
              className="px-1 py-0.5 text-xs bg-chrome-100 border border-chrome-300"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
