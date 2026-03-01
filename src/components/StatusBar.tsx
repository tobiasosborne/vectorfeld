interface StatusBarProps {
  cursorX?: number
  cursorY?: number
  zoomPercent?: number
}

export function StatusBar({ cursorX = 0, cursorY = 0, zoomPercent = 100 }: StatusBarProps) {
  return (
    <div className="h-6 bg-chrome-100 border-t border-chrome-300 flex items-center px-3 gap-4">
      <span className="text-xs font-mono text-chrome-500">X: {cursorX.toFixed(1)} mm</span>
      <span className="text-xs font-mono text-chrome-500">Y: {cursorY.toFixed(1)} mm</span>
      <span className="text-xs font-mono text-chrome-500">{zoomPercent.toFixed(0)}%</span>
    </div>
  )
}
