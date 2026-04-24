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
  testid?: string
}

export function ColorPicker({ value, onChange, allowNone = true, testid }: ColorPickerProps) {
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
        data-testid={testid ? `colorpicker-${testid}` : undefined}
        onClick={() => setOpen(!open)}
        className="w-6 h-6 cursor-pointer"
        style={{
          border: '1px solid var(--color-border-strong)',
          borderRadius: 4,
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
        <div
          data-role="panel"
          style={{
            position: 'absolute',
            top: 30,
            left: 0,
            zIndex: 50,
            background: 'var(--color-panel-solid)',
            border: '1px solid var(--color-border)',
            borderRadius: 10,
            padding: 10,
            boxShadow: '0 10px 30px -8px rgba(60,40,20,0.18)',
            width: 200,
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4, marginBottom: 8 }}>
            {PRESET_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => { onChange(color); setOpen(false) }}
                style={{
                  width: 22,
                  height: 22,
                  border: '1px solid var(--color-border)',
                  borderRadius: 4,
                  backgroundColor: color,
                  cursor: 'default',
                }}
                title={color}
              />
            ))}
          </div>
          {allowNone && (
            <button
              onClick={() => { onChange('none'); setOpen(false) }}
              style={{
                fontSize: 11,
                color: 'var(--color-muted)',
                background: 'transparent',
                border: 0,
                marginBottom: 4,
                padding: '2px 0',
                cursor: 'default',
                display: 'block',
              }}
            >
              None (transparent)
            </button>
          )}
          <div style={{ display: 'flex', gap: 4 }}>
            <input
              data-testid={testid ? `colorpicker-${testid}-hex` : undefined}
              type="text"
              value={hexInput}
              onChange={(e) => setHexInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleHexSubmit()}
              placeholder="#000000"
              style={{
                flex: 1,
                border: '1px solid var(--color-border)',
                borderRadius: 6,
                background: 'var(--color-panel-solid)',
                padding: '3px 6px',
                fontSize: 11,
                fontFamily: 'ui-monospace, JetBrains Mono, monospace',
                color: 'var(--color-text)',
              }}
            />
            <button
              onClick={handleHexSubmit}
              style={{
                padding: '3px 10px',
                fontSize: 11,
                background: 'var(--color-accent-tint)',
                color: 'var(--color-accent-text)',
                border: '1px solid var(--color-border)',
                borderRadius: 6,
                cursor: 'default',
              }}
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
