import { useState, useEffect } from 'react'
import { getAllTools, getActiveToolName, setActiveTool, subscribe } from '../tools/registry'
import { TOOL_ICONS } from './icons'
import { FillStrokeWidget } from './FillStrokeWidget'

const HIDDEN_TOOLS = new Set(['eyedropper'])

export function ToolStrip() {
  const [activeToolName, setActiveToolName] = useState<string | null>(getActiveToolName())
  const tools = getAllTools()

  useEffect(() => {
    return subscribe(() => {
      setActiveToolName(getActiveToolName())
    })
  }, [])

  return (
    <div className="w-10 bg-chrome-100 border-r border-chrome-300 flex flex-col items-center py-1 gap-0.5">
      {tools.filter(t => !HIDDEN_TOOLS.has(t.name)).map((tool) => (
        <button
          key={tool.name}
          onClick={() => setActiveTool(tool.name)}
          className={`w-8 h-8 flex items-center justify-center text-xs rounded ${
            activeToolName === tool.name
              ? 'bg-accent/15 text-accent border border-accent/30'
              : 'hover:bg-chrome-200 text-chrome-600 border border-transparent'
          }`}
          title={`${tool.name} (${tool.shortcut.toUpperCase()})`}
        >
          {TOOL_ICONS[tool.name] || tool.icon}
        </button>
      ))}
      <div className="mt-auto pb-1">
        <FillStrokeWidget />
      </div>
    </div>
  )
}
