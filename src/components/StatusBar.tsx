export function StatusBar() {
  return (
    <div className="h-6 bg-chrome-100 border-t border-chrome-300 flex items-center px-3 gap-4">
      <span className="text-xs font-mono text-chrome-500">X: 0.0 mm</span>
      <span className="text-xs font-mono text-chrome-500">Y: 0.0 mm</span>
      <span className="text-xs font-mono text-chrome-500">100%</span>
    </div>
  )
}
