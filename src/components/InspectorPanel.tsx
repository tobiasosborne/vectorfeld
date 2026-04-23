import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { getSelection, subscribeSelection } from '../model/selection'
import { ControlBar } from './ControlBar'
import { PropertiesPanel } from './PropertiesPanel'
import { LayersPanel } from './LayersPanel'

type InspectorTab = 'properties' | 'layers'

function SelectionHeader() {
  const [sel, setSel] = useState<Element[]>([])
  useEffect(() => {
    const update = () => setSel(getSelection())
    update()
    return subscribeSelection(update)
  }, [])

  const count = sel.length
  const kind =
    count === 0 ? '' :
    count === 1 ? (sel[0].tagName.toLowerCase()) :
    `Mixed · ${count}`
  const label =
    count === 0 ? 'No selection' :
    count === 1 ? `${kind} · 1 selected` :
    `${count} selected`
  const bodyName =
    count === 1 ? (sel[0].textContent?.trim().slice(0, 60) || sel[0].getAttribute('id') || kind) :
    count === 0 ? '—' :
    `${count} items`

  return (
    <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--color-border)' }}>
      <div
        style={{
          fontSize: 10,
          letterSpacing: 0.14,
          textTransform: 'uppercase',
          color: 'var(--color-faint)',
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text)' }}>{bodyName}</div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border)' }}>
      <div
        style={{
          fontSize: 10,
          letterSpacing: 0.14,
          textTransform: 'uppercase',
          color: 'var(--color-faint)',
          marginBottom: 10,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  )
}

const tabBtnStyle = (active: boolean): CSSProperties => ({
  padding: '4px 10px',
  borderRadius: 999,
  border: 0,
  fontSize: 11.5,
  background: active ? 'var(--color-panel-solid)' : 'transparent',
  boxShadow: active ? '0 0 0 1px var(--color-border)' : 'none',
  color: active ? 'var(--color-text)' : 'var(--color-muted)',
  fontWeight: active ? 500 : 400,
  cursor: 'default',
})

export function InspectorPanel() {
  const [bottomTab, setBottomTab] = useState<InspectorTab>('layers')

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        fontSize: 12,
        overflow: 'hidden',
      }}
    >
      <SelectionHeader />

      {/* Scrolling property region (Frame + per-element styling) */}
      <div style={{ overflow: 'auto', flex: 1, minHeight: 0 }}>
        <Section title="Frame">
          <ControlBar />
        </Section>
        <Section title="Style">
          <PropertiesPanel embedded />
        </Section>
      </div>

      {/* Bottom: Layers / Pages merged tab strip */}
      <div
        style={{
          borderTop: '1px solid var(--color-border-strong)',
          background: 'rgba(255,253,249,0.5)',
          height: '42%',
          minHeight: 260,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ padding: '10px 12px 6px', display: 'flex', gap: 2, alignItems: 'center' }}>
          <button
            data-role="inspector-layers-tab"
            style={tabBtnStyle(bottomTab === 'layers')}
            onClick={() => setBottomTab('layers')}
          >
            Layers
          </button>
          <button
            data-role="inspector-properties-tab"
            style={tabBtnStyle(bottomTab === 'properties')}
            onClick={() => setBottomTab('properties')}
          >
            Pages
          </button>
        </div>
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {bottomTab === 'layers' && <LayersPanel embedded />}
          {bottomTab === 'properties' && (
            <div style={{ padding: 16, color: 'var(--color-faint)', fontSize: 12 }}>
              Multi-page support lands with vectorfeld-4w7.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
