// Translates a registered tool name (from src/tools/registry.ts) into a
// key in the Atrium ICONS dictionary. The design's icon roster uses
// slightly different keys than the tool registry — this is the adaptor.
//
// Unknown names pass through unchanged so IconGlyph can fail-soft.
const TOOL_TO_ICON: Record<string, string> = {
  'select': 'select',
  'direct-select': 'directSelect',
  'rectangle': 'rect',
  'ellipse': 'ellipse',
  'line': 'line',
  'text': 'text',
  'eraser': 'erase',
  'pen': 'pen',
  'pencil': 'pencil',
  'eyedropper': 'eyedropper',
  'lasso': 'lasso',
  // measure tool shows a distance overlay in mm — ruler is the closest glyph
  'measure': 'ruler',
  // free-transform covers scale+rotate+skew — canonical glyph is `scale`
  'free-transform': 'scale',
}

export function iconKeyForTool(toolName: string): string {
  return TOOL_TO_ICON[toolName] ?? toolName
}
