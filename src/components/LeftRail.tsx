import { useState, useEffect } from 'react'
import { getActiveToolName, setActiveTool, subscribe } from '../tools/registry'
import { IconGlyph, IconLabels, type IconName } from './IconGlyph'
import { FillStrokeWidget } from './FillStrokeWidget'

// The 9-slot rail from design/unpacked/design_handoff_vectorfeld/atrium.jsx.
// Brush + Knife are design keys with no backing tool yet — they render
// disabled with a "Coming soon" tooltip (per the redesign-atrium decision
// to keep the design's icon pairing intact even before the tools exist).
interface RailSlot {
  key: IconName
  shortcut: string
  toolName?: string   // undefined => disabled stub
  comingSoon?: boolean
}

const RAIL: RailSlot[] = [
  { key: 'select',       shortcut: 'V', toolName: 'select' },
  { key: 'directSelect', shortcut: 'A', toolName: 'direct-select' },
  { key: 'pen',          shortcut: 'P', toolName: 'pen' },
  { key: 'brush',        shortcut: 'B', comingSoon: true },
  { key: 'text',         shortcut: 'T', toolName: 'text' },
  { key: 'rect',         shortcut: 'R', toolName: 'rectangle' },
  { key: 'knife',        shortcut: 'K', comingSoon: true },
  { key: 'eyedropper',   shortcut: 'I', toolName: 'eyedropper' },
  { key: 'erase',        shortcut: 'E', toolName: 'eraser' },
]

// Tools reachable via keyboard but not on the rail — surface them through
// the overflow menu so they're still discoverable.
const OVERFLOW_TOOLS: Array<[IconName, string, string]> = [
  ['pencil', 'N', 'pencil'],
  ['ellipse', 'E', 'ellipse'],
  ['line', 'L', 'line'],
  ['ruler', 'M', 'measure'],
  ['lasso', 'J', 'lasso'],
  ['scale', 'Q', 'free-transform'],
]

export function LeftRail() {
  const [activeName, setActiveName] = useState<string | null>(getActiveToolName())
  const [overflowOpen, setOverflowOpen] = useState(false)

  useEffect(() => {
    // Sync once after mount in case setActiveTool fired before we subscribed
    // (Canvas mount effect runs before LeftRail's during initial render).
    setActiveName(getActiveToolName())
    return subscribe(() => setActiveName(getActiveToolName()))
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minHeight: 0 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {RAIL.map(slot => {
          const isActive = slot.toolName != null && activeName === slot.toolName
          const disabled = slot.comingSoon === true
          return (
            <button
              key={slot.key}
              data-tool-slot={slot.key}
              data-active={isActive ? 'true' : 'false'}
              disabled={disabled}
              onClick={() => {
                if (disabled || !slot.toolName) return
                setActiveTool(slot.toolName)
              }}
              title={
                disabled
                  ? `${IconLabels[slot.key]} — coming soon`
                  : `${IconLabels[slot.key]} (${slot.shortcut})`
              }
              style={{
                width: 46,
                height: 42,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 1,
                borderRadius: 10,
                border: 0,
                padding: 0,
                background: isActive ? 'var(--color-accent-tint)' : 'transparent',
                color: isActive ? 'var(--color-accent-text)' : 'var(--color-muted)',
                opacity: disabled ? 0.35 : 1,
                cursor: disabled ? 'not-allowed' : 'default',
              }}
            >
              <IconGlyph name={slot.key} size={20} />
              <span style={{ fontSize: 9, letterSpacing: 0.08, opacity: 0.8 }}>{slot.shortcut}</span>
            </button>
          )
        })}
      </div>

      <div style={{ height: 1, background: 'var(--color-border)', margin: '4px 6px' }} />

      <div style={{ position: 'relative' }}>
        <button
          data-role="overflow"
          onClick={() => setOverflowOpen(v => !v)}
          title="More tools"
          style={{
            width: 46,
            height: 38,
            borderRadius: 10,
            background: 'transparent',
            color: 'var(--color-faint)',
            border: 0,
            fontSize: 16,
            cursor: 'default',
          }}
        >
          ⋯
        </button>
        {overflowOpen && (
          <div
            data-role="overflow-menu"
            style={{
              position: 'absolute',
              left: 54,
              top: 0,
              background: 'var(--color-panel)',
              backdropFilter: 'var(--blur-panel)',
              WebkitBackdropFilter: 'var(--blur-panel)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-panel)',
              boxShadow: 'var(--shadow-panel)',
              padding: 6,
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              minWidth: 180,
              zIndex: 10,
            }}
          >
            {OVERFLOW_TOOLS.map(([iconKey, shortcut, toolName]) => (
              <button
                key={toolName}
                onClick={() => { setActiveTool(toolName); setOverflowOpen(false) }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '6px 10px',
                  border: 0,
                  background: 'transparent',
                  color: 'var(--color-text)',
                  borderRadius: 8,
                  fontSize: 12,
                  cursor: 'default',
                  textAlign: 'left',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-accent-tint)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <IconGlyph name={iconKey} size={16} />
                <span style={{ flex: 1 }}>{IconLabels[iconKey]}</span>
                <span style={{ fontSize: 10, color: 'var(--color-faint)', letterSpacing: 0.08 }}>{shortcut}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={{ flex: 1 }} />
      <FillStrokeWidget />
    </div>
  )
}
