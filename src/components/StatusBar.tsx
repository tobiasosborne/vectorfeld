import type { CSSProperties } from 'react'

interface StatusBarProps {
  cursorX?: number
  cursorY?: number
  zoomPercent?: number
  fileName?: string
  fileSize?: string
  format?: string
  onZoomIn?: () => void
  onZoomOut?: () => void
}

const pillStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  background: 'var(--color-panel-solid)',
  border: '1px solid var(--color-border)',
  borderRadius: 999,
  padding: '2px 4px',
}

const chipBtnStyle: CSSProperties = {
  width: 22,
  height: 22,
  border: 0,
  background: 'transparent',
  color: 'var(--color-faint)',
  cursor: 'default',
  fontSize: 12,
}

const monoStyle: CSSProperties = {
  fontFamily: 'ui-monospace, JetBrains Mono, monospace',
  color: 'var(--color-text)',
  fontSize: 11,
  padding: '0 6px',
}

const dividerStyle: CSSProperties = {
  color: 'var(--color-border-strong)',
  margin: '0 2px',
}

const labelStyle: CSSProperties = {
  color: 'var(--color-muted)',
  fontSize: 11.5,
  fontFamily: 'ui-monospace, JetBrains Mono, monospace',
}

export function StatusBar({
  cursorX = 0,
  cursorY = 0,
  zoomPercent = 100,
  fileName,
  fileSize,
  format,
  onZoomIn,
  onZoomOut,
}: StatusBarProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        width: '100%',
        gap: 14,
        fontSize: 11.5,
        color: 'var(--color-muted)',
      }}
    >
      {/* Saved indicator */}
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span
          data-role="saved-dot"
          style={{ width: 6, height: 6, borderRadius: 99, background: '#4aa85a' }}
        />
        Saved
      </span>

      <span style={dividerStyle}>│</span>

      {/* Page navigator (single-page stub) */}
      <div data-role="page-nav" style={pillStyle}>
        <button style={chipBtnStyle} disabled>◂</button>
        <span style={monoStyle}>Page 1 / 1</span>
        <button style={chipBtnStyle} disabled>▸</button>
      </div>

      <span style={dividerStyle}>│</span>

      {/* Cursor coordinates */}
      <span style={labelStyle}>X: {cursorX.toFixed(1)} mm</span>
      <span style={labelStyle}>Y: {cursorY.toFixed(1)} mm</span>

      {/* File info (right-aligned) */}
      <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
        {fileName && <span>{fileName}</span>}
        {format && <span>· {format}</span>}
        {fileSize && <span>· {fileSize}</span>}
      </span>

      <span style={dividerStyle}>│</span>

      {/* Zoom */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button
          data-role="zoom-out"
          onClick={onZoomOut}
          style={chipBtnStyle}
        >
          −
        </button>
        <span style={monoStyle}>{zoomPercent.toFixed(0)}%</span>
        <button
          data-role="zoom-in"
          onClick={onZoomIn}
          style={chipBtnStyle}
        >
          +
        </button>
      </div>
    </div>
  )
}
