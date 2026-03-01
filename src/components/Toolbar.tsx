import { useState, useEffect } from 'react'
import { getAllTools, getActiveToolName, setActiveTool, subscribe } from '../tools/registry'

interface ToolbarProps {
  onArtboardSetup?: () => void
  onExportSvg?: () => void
  onImportSvg?: () => void
}

export function Toolbar({ onArtboardSetup, onExportSvg, onImportSvg }: ToolbarProps) {
  const [activeToolName, setActiveToolName] = useState<string | null>(getActiveToolName())
  const tools = getAllTools()

  useEffect(() => {
    return subscribe(() => {
      setActiveToolName(getActiveToolName())
    })
  }, [])

  return (
    <div className="h-10 bg-chrome-100 border-b border-chrome-300 flex items-center px-2 gap-1">
      <span className="text-xs font-medium text-chrome-600 select-none mr-2">vectorfeld</span>
      {tools.map((tool) => (
        <button
          key={tool.name}
          onClick={() => setActiveTool(tool.name)}
          className={`w-8 h-8 flex items-center justify-center text-xs border ${
            activeToolName === tool.name
              ? 'border-accent bg-accent/10 text-accent'
              : 'border-transparent hover:bg-chrome-200 text-chrome-600'
          }`}
          title={`${tool.name} (${tool.shortcut.toUpperCase()})`}
        >
          {tool.icon}
        </button>
      ))}
      <div className="flex-1" />
      {onImportSvg && (
        <button
          onClick={onImportSvg}
          className="px-2 py-0.5 text-xs border border-chrome-300 bg-chrome-50 hover:bg-chrome-200"
          title="Import SVG"
        >
          Open
        </button>
      )}
      {onExportSvg && (
        <button
          onClick={onExportSvg}
          className="px-2 py-0.5 text-xs border border-chrome-300 bg-chrome-50 hover:bg-chrome-200"
          title="Export SVG"
        >
          Save
        </button>
      )}
      {onArtboardSetup && (
        <button
          onClick={onArtboardSetup}
          className="px-2 py-0.5 text-xs border border-chrome-300 bg-chrome-50 hover:bg-chrome-200"
          title="Document Setup"
        >
          Doc Setup
        </button>
      )}
    </div>
  )
}
