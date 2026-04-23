import { useState, useEffect } from 'react'
import { getDefaultStyle, setDefaultStyle, subscribeDefaultStyle } from '../model/defaultStyle'

export function FillStrokeWidget() {
  const [style, setStyle] = useState(getDefaultStyle())

  useEffect(() => subscribeDefaultStyle(() => setStyle(getDefaultStyle())), [])

  const swap = () => {
    setDefaultStyle({ stroke: style.fill, fill: style.stroke })
  }

  const resetDefaults = () => {
    setDefaultStyle({ stroke: '#000000', fill: '#ffffff' })
  }

  const fillColor = style.fill === 'none' ? 'transparent' : style.fill
  const strokeColor = style.stroke === 'none' ? 'transparent' : style.stroke

  return (
    <div className="relative w-10 h-10 mx-auto" title="Fill & Stroke">
      {/* Reset to default (bottom-left) */}
      <button
        onClick={resetDefaults}
        className="absolute bottom-0 left-0 w-3 h-3 flex items-center justify-center"
        title="Default colors (black/white)"
      >
        <svg width="10" height="10" viewBox="0 0 10 10">
          <rect x="0" y="4" width="6" height="6" fill="#ffffff" stroke="#666" strokeWidth="0.8" />
          <rect x="0" y="4" width="3" height="3" fill="#000000" />
        </svg>
      </button>
      {/* Fill square (back, larger) */}
      <div
        className="absolute top-2 left-2 w-6 h-6 rounded-sm cursor-pointer"
        style={{
          border: '1px solid var(--color-border-strong)',
          backgroundColor: fillColor,
          backgroundImage: style.fill === 'none'
            ? 'linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%), linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%)'
            : undefined,
          backgroundSize: style.fill === 'none' ? '6px 6px' : undefined,
          backgroundPosition: style.fill === 'none' ? '0 0, 3px 3px' : undefined,
        }}
        title={`Fill: ${style.fill}`}
      />
      {/* Stroke square (front, overlapping top-left) */}
      <div
        className="absolute top-0 left-0 w-6 h-6 rounded-sm cursor-pointer"
        style={{
          border: `2px solid ${strokeColor}`,
          backgroundColor: 'transparent',
          backgroundImage: style.stroke === 'none'
            ? 'linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%), linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%)'
            : undefined,
          backgroundSize: style.stroke === 'none' ? '6px 6px' : undefined,
          backgroundPosition: style.stroke === 'none' ? '0 0, 3px 3px' : undefined,
        }}
        title={`Stroke: ${style.stroke}`}
      />
      {/* Swap arrow (top-right) */}
      <button
        onClick={swap}
        className="absolute top-0 right-0 w-4 h-4 flex items-center justify-center"
        style={{ color: 'var(--color-faint)' }}
        title="Swap fill & stroke"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2">
          <path d="M2 1L5 1L5 4" />
          <path d="M8 9L5 9L5 6" />
          <line x1="5" y1="1" x2="1" y2="5" />
          <line x1="5" y1="9" x2="9" y2="5" />
        </svg>
      </button>
    </div>
  )
}
