import { describe, it, expect } from 'vitest'
import { iconKeyForTool } from './iconKeyForTool'
import { ICONS } from './IconGlyph'

describe('iconKeyForTool', () => {
  const cases: Array<[string, keyof typeof ICONS]> = [
    ['select', 'select'],
    ['direct-select', 'directSelect'],
    ['rectangle', 'rect'],
    ['ellipse', 'ellipse'],
    ['line', 'line'],
    ['text', 'text'],
    ['eraser', 'erase'],
    ['pen', 'pen'],
    ['pencil', 'pencil'],
    ['eyedropper', 'eyedropper'],
    ['lasso', 'lasso'],
    ['measure', 'ruler'],
    ['free-transform', 'scale'],
  ]

  for (const [toolName, iconKey] of cases) {
    it(`maps ${toolName} → ${iconKey}`, () => {
      expect(iconKeyForTool(toolName)).toBe(iconKey)
    })
  }

  it('every mapped key resolves to an ICONS entry', () => {
    for (const [, iconKey] of cases) expect(ICONS[iconKey]).toBeDefined()
  })

  it('falls back gracefully for unknown tool names (returns tool name as-is)', () => {
    expect(iconKeyForTool('not-a-real-tool')).toBe('not-a-real-tool')
  })
})
