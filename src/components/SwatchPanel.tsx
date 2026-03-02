import { useState, useEffect } from 'react'
import { getSwatches, addSwatch, removeSwatch, subscribeSwatches } from '../model/swatches'
import type { Swatch } from '../model/swatches'

interface SwatchPanelProps {
  onColorSelect: (color: string) => void
  currentColor?: string
}

export function SwatchPanel({ onColorSelect, currentColor }: SwatchPanelProps) {
  const [swatches, setSwatches] = useState<Swatch[]>(getSwatches())

  useEffect(() => {
    return subscribeSwatches(() => setSwatches(getSwatches()))
  }, [])

  const handleAdd = () => {
    const name = prompt('Swatch name:')
    if (!name) return
    const color = currentColor || '#000000'
    addSwatch(name, color)
  }

  return (
    <div className="mt-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-chrome-500 font-medium">Swatches</span>
        <button
          className="text-xs text-chrome-400 hover:text-chrome-700"
          onClick={handleAdd}
          title="Save current color as swatch"
        >
          +
        </button>
      </div>
      <div className="flex flex-wrap gap-1">
        {swatches.map(s => (
          <button
            key={s.id}
            className="w-5 h-5 rounded-sm border border-chrome-300 hover:border-chrome-600"
            style={{ backgroundColor: s.color }}
            title={`${s.name} (${s.color})`}
            onClick={() => onColorSelect(s.color)}
            onContextMenu={(e) => { e.preventDefault(); removeSwatch(s.id) }}
          />
        ))}
      </div>
    </div>
  )
}
