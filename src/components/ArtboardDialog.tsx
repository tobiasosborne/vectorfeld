import { useState } from 'react'
import type { DocumentDimensions } from './Canvas'

const PRESETS: { name: string; width: number; height: number }[] = [
  { name: 'A4', width: 210, height: 297 },
  { name: 'A3', width: 297, height: 420 },
  { name: 'Letter', width: 215.9, height: 279.4 },
  { name: 'A5', width: 148, height: 210 },
  { name: 'Square 100', width: 100, height: 100 },
]

interface ArtboardDialogProps {
  dimensions: DocumentDimensions
  onApply: (dimensions: DocumentDimensions) => void
  onClose: () => void
}

export function ArtboardDialog({ dimensions, onApply, onClose }: ArtboardDialogProps) {
  const [width, setWidth] = useState(String(dimensions.width))
  const [height, setHeight] = useState(String(dimensions.height))

  const handleApply = () => {
    const w = parseFloat(width)
    const h = parseFloat(height)
    if (isNaN(w) || isNaN(h) || w <= 0 || h <= 0) return
    onApply({ width: w, height: h })
    onClose()
  }

  const handlePreset = (preset: typeof PRESETS[number]) => {
    setWidth(String(preset.width))
    setHeight(String(preset.height))
  }

  const handleSwapOrientation = () => {
    setWidth(height)
    setHeight(width)
  }

  const inputStyle = {
    width: '100%',
    border: '1px solid var(--color-border)',
    borderRadius: 6,
    padding: '6px 8px',
    fontSize: 13,
    fontFamily: 'ui-monospace, JetBrains Mono, monospace',
    background: 'var(--color-panel-solid)',
    color: 'var(--color-text)',
  }
  const presetBtnStyle = {
    padding: '4px 10px',
    fontSize: 11.5,
    border: '1px solid var(--color-border)',
    borderRadius: 999,
    background: 'var(--color-panel-solid)',
    color: 'var(--color-text)',
    cursor: 'default',
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(20, 14, 8, 0.22)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
      }}
      data-testid="artboard-dialog"
    >
      <div
        data-role="panel"
        style={{
          background: 'var(--color-panel-solid)',
          border: '1px solid var(--color-border)',
          borderRadius: 14,
          padding: 20,
          width: 320,
          boxShadow: '0 30px 60px -20px rgba(60,40,20,0.3)',
        }}
      >
        <h3 style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text)', margin: '0 0 14px' }}>Document Setup</h3>

        <div style={{ display: 'flex', gap: 4, marginBottom: 14, flexWrap: 'wrap' }}>
          {PRESETS.map((p) => (
            <button
              key={p.name}
              onClick={() => handlePreset(p)}
              style={presetBtnStyle}
            >
              {p.name}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'end', marginBottom: 14 }}>
          <label style={{ flex: 1 }}>
            <span style={{ fontSize: 10, letterSpacing: 0.14, textTransform: 'uppercase', color: 'var(--color-faint)', display: 'block', marginBottom: 4 }}>Width (mm)</span>
            <input
              type="number"
              value={width}
              onChange={(e) => setWidth(e.target.value)}
              style={inputStyle}
              min="1"
              step="0.1"
              data-testid="artboard-width"
            />
          </label>
          <button
            onClick={handleSwapOrientation}
            title="Swap orientation"
            style={{ ...presetBtnStyle, padding: '4px 8px' }}
          >
            ↔
          </button>
          <label style={{ flex: 1 }}>
            <span style={{ fontSize: 10, letterSpacing: 0.14, textTransform: 'uppercase', color: 'var(--color-faint)', display: 'block', marginBottom: 4 }}>Height (mm)</span>
            <input
              type="number"
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              style={inputStyle}
              min="1"
              step="0.1"
              data-testid="artboard-height"
            />
          </label>
        </div>

        <div style={{ display: 'flex', gap: 6, justifyContent: 'end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '6px 14px',
              fontSize: 12,
              border: '1px solid var(--color-border)',
              borderRadius: 999,
              background: 'transparent',
              color: 'var(--color-muted)',
              cursor: 'default',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            data-testid="artboard-apply"
            style={{
              padding: '6px 16px',
              fontSize: 12,
              fontWeight: 500,
              border: 0,
              borderRadius: 999,
              background: 'linear-gradient(180deg, var(--color-accent), var(--color-accent-text))',
              color: '#fff',
              cursor: 'default',
              boxShadow: '0 4px 10px -4px var(--color-accent), 0 1px 0 rgba(255,255,255,0.25) inset',
            }}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  )
}

export { PRESETS }
