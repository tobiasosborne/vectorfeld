interface ToolbarProps {
  onArtboardSetup?: () => void
}

export function Toolbar({ onArtboardSetup }: ToolbarProps) {
  return (
    <div className="h-10 bg-chrome-100 border-b border-chrome-300 flex items-center px-2 gap-2">
      <span className="text-xs font-medium text-chrome-600 select-none">vectorfeld</span>
      <div className="flex-1" />
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
