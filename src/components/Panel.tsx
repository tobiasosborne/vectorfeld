import type { CSSProperties, ReactNode } from 'react'

interface PanelProps {
  children?: ReactNode
  className?: string
  style?: CSSProperties
  'data-testid'?: string
}

const panelTreatment: CSSProperties = {
  background: 'var(--color-panel)',
  backdropFilter: 'var(--blur-panel)',
  WebkitBackdropFilter: 'var(--blur-panel)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-panel)',
  boxShadow: 'var(--shadow-panel)',
}

export function Panel({ children, className, style, 'data-testid': testid }: PanelProps) {
  return (
    <div
      data-role="panel"
      data-testid={testid}
      className={className}
      style={{ ...panelTreatment, ...style }}
    >
      {children}
    </div>
  )
}
