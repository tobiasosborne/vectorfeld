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

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" data-testid="artboard-dialog">
      <div className="bg-white border border-chrome-300 p-4 w-72 shadow-lg">
        <h3 className="text-sm font-medium mb-3 text-chrome-800">Document Setup</h3>

        <div className="flex gap-2 mb-3 flex-wrap">
          {PRESETS.map((p) => (
            <button
              key={p.name}
              onClick={() => handlePreset(p)}
              className="px-2 py-0.5 text-xs border border-chrome-300 bg-chrome-50 hover:bg-chrome-200"
            >
              {p.name}
            </button>
          ))}
        </div>

        <div className="flex gap-2 items-end mb-3">
          <label className="flex-1">
            <span className="text-xs text-chrome-500 block mb-0.5">Width (mm)</span>
            <input
              type="number"
              value={width}
              onChange={(e) => setWidth(e.target.value)}
              className="w-full border border-chrome-300 px-1.5 py-0.5 text-sm font-mono"
              min="1"
              step="0.1"
              data-testid="artboard-width"
            />
          </label>
          <button
            onClick={handleSwapOrientation}
            className="px-2 py-0.5 text-xs border border-chrome-300 bg-chrome-50 hover:bg-chrome-200 mb-0.5"
            title="Swap orientation"
          >
            ↔
          </button>
          <label className="flex-1">
            <span className="text-xs text-chrome-500 block mb-0.5">Height (mm)</span>
            <input
              type="number"
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              className="w-full border border-chrome-300 px-1.5 py-0.5 text-sm font-mono"
              min="1"
              step="0.1"
              data-testid="artboard-height"
            />
          </label>
        </div>

        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1 text-xs border border-chrome-300 bg-chrome-50 hover:bg-chrome-200"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            className="px-3 py-1 text-xs bg-accent text-white hover:bg-accent-light"
            data-testid="artboard-apply"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  )
}

export { PRESETS }
