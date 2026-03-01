import { describe, it, expect, beforeEach } from 'vitest'
import {
  registerTool,
  setActiveTool,
  getActiveTool,
  getActiveToolName,
  getAllTools,
  findToolByShortcut,
  clearRegistry,
  subscribe,
} from './registry'
import type { ToolConfig } from './registry'

function makeTool(name: string, shortcut: string): ToolConfig {
  return { name, shortcut, icon: null, handlers: {} }
}

describe('Tool Registry', () => {
  beforeEach(() => {
    clearRegistry()
  })

  it('registers a tool', () => {
    registerTool(makeTool('select', 'v'))
    expect(getAllTools()).toHaveLength(1)
    expect(getAllTools()[0].name).toBe('select')
  })

  it('sets and gets active tool', () => {
    registerTool(makeTool('select', 'v'))
    registerTool(makeTool('line', 'l'))
    setActiveTool('line')
    expect(getActiveToolName()).toBe('line')
    expect(getActiveTool()?.name).toBe('line')
  })

  it('ignores setActiveTool for unregistered tool', () => {
    registerTool(makeTool('select', 'v'))
    setActiveTool('select')
    setActiveTool('nonexistent')
    expect(getActiveToolName()).toBe('select')
  })

  it('returns null when no tool is active', () => {
    expect(getActiveTool()).toBeNull()
    expect(getActiveToolName()).toBeNull()
  })

  it('finds tool by keyboard shortcut', () => {
    registerTool(makeTool('select', 'v'))
    registerTool(makeTool('line', 'l'))
    expect(findToolByShortcut('l')?.name).toBe('line')
    expect(findToolByShortcut('V')?.name).toBe('select')
    expect(findToolByShortcut('z')).toBeUndefined()
  })

  it('notifies subscribers on tool change', () => {
    registerTool(makeTool('select', 'v'))
    registerTool(makeTool('line', 'l'))
    let count = 0
    subscribe(() => count++)
    setActiveTool('select')
    setActiveTool('line')
    expect(count).toBe(2)
  })

  it('unsubscribes correctly', () => {
    registerTool(makeTool('select', 'v'))
    let count = 0
    const unsub = subscribe(() => count++)
    setActiveTool('select')
    expect(count).toBe(1)
    unsub()
    setActiveTool('select')
    expect(count).toBe(1)
  })
})
