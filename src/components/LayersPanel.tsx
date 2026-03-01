export function LayersPanel() {
  return (
    <div className="w-48 bg-chrome-50 border-r border-chrome-300 flex flex-col">
      <div className="h-8 bg-chrome-100 border-b border-chrome-200 flex items-center px-2">
        <span className="text-xs font-medium text-chrome-600 select-none">Layers</span>
      </div>
      <div className="flex-1 overflow-y-auto" />
    </div>
  )
}
