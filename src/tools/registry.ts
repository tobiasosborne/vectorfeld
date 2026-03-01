import type { ReactNode } from 'react'

export interface ToolEventHandlers {
  onMouseDown?: (e: MouseEvent) => void
  onMouseMove?: (e: MouseEvent) => void
  onMouseUp?: (e: MouseEvent) => void
  onClick?: (e: MouseEvent) => void
  onKeyDown?: (e: KeyboardEvent) => void
}

export interface ToolConfig {
  name: string
  icon: ReactNode
  shortcut: string
  cursor?: string  // CSS cursor value for canvas when this tool is active
  handlers: ToolEventHandlers
}

const tools = new Map<string, ToolConfig>()
let activeTool: string | null = null
let listeners: Array<() => void> = []
let keyboardCaptured = false

function notify() {
  listeners.forEach((fn) => fn())
}

export function registerTool(config: ToolConfig): void {
  tools.set(config.name, config)
}

export function setActiveTool(name: string): void {
  if (!tools.has(name)) return
  activeTool = name
  notify()
}

export function getActiveTool(): ToolConfig | null {
  if (!activeTool) return null
  return tools.get(activeTool) ?? null
}

export function getActiveToolName(): string | null {
  return activeTool
}

export function getAllTools(): ToolConfig[] {
  return Array.from(tools.values())
}

export function subscribe(fn: () => void): () => void {
  listeners.push(fn)
  return () => {
    listeners = listeners.filter((l) => l !== fn)
  }
}

export function findToolByShortcut(key: string): ToolConfig | undefined {
  return Array.from(tools.values()).find(
    (t) => t.shortcut.toLowerCase() === key.toLowerCase()
  )
}

/** When true, tool shortcuts and editor keybindings are suppressed (e.g., during text editing) */
export function setKeyboardCapture(capture: boolean): void {
  keyboardCaptured = capture
}

export function isKeyboardCaptured(): boolean {
  return keyboardCaptured
}

export function clearRegistry(): void {
  tools.clear()
  activeTool = null
  listeners = []
  keyboardCaptured = false
}
