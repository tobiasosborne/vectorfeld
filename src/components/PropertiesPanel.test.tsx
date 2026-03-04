import { render, screen, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { PropertiesPanel } from './PropertiesPanel'

// ---- Mocks ----------------------------------------------------------------

const mockGetSelection = vi.fn<() => Element[]>(() => [])
const mockSubscribeSelection = vi.fn<(fn: () => void) => () => void>(() => () => {})
const mockRefreshOverlay = vi.fn()

vi.mock('../model/selection', () => ({
  getSelection: (...args: unknown[]) => mockGetSelection(...(args as [])),
  subscribeSelection: (...args: unknown[]) => mockSubscribeSelection(...(args as [() => void])),
  refreshOverlay: (...args: unknown[]) => mockRefreshOverlay(...(args as [])),
}))

vi.mock('../model/EditorContext', () => ({
  useEditor: vi.fn(() => ({
    history: { execute: vi.fn() },
    doc: { getDefs: () => document.createElementNS('http://www.w3.org/2000/svg', 'defs') },
  })),
}))

vi.mock('./ColorPicker', () => ({
  ColorPicker: ({ value }: { value: string }) => (
    <span data-testid="color-picker">{value}</span>
  ),
}))

vi.mock('../model/defaultStyle', () => ({
  setDefaultStyle: vi.fn(),
}))

vi.mock('../model/gradients', () => ({
  detectFillType: vi.fn(() => 'none'),
  createLinearGradient: vi.fn(),
  createRadialGradient: vi.fn(),
  parseGradientColors: vi.fn(),
  updateGradientColors: vi.fn(),
}))

vi.mock('../model/align', () => ({
  computeAlign: vi.fn(() => []),
  computeDistribute: vi.fn(() => []),
  applyDelta: vi.fn(() => []),
}))

vi.mock('../model/matrix', () => ({
  parseSkew: vi.fn(() => ({ skewX: 0, skewY: 0 })),
  setSkew: vi.fn((t: string) => t),
}))

vi.mock('../model/markers', () => ({
  MARKER_TYPES: ['none', 'triangle', 'open', 'reverse', 'circle'],
  getMarkerLabel: vi.fn((t: string) => t.charAt(0).toUpperCase() + t.slice(1)),
  getMarkerUrl: vi.fn(() => ''),
  parseMarkerType: vi.fn(() => 'none'),
  ensureMarkerDef: vi.fn(),
}))

// ---- Helpers ---------------------------------------------------------------

function makeSvgElement(tag: string, attrs: Record<string, string> = {}): Element {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag)
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, v)
  }
  return el
}

afterEach(cleanup)

beforeEach(() => {
  vi.clearAllMocks()
  mockGetSelection.mockReturnValue([])
  mockSubscribeSelection.mockImplementation(() => () => {})
})

// ---- Tests -----------------------------------------------------------------

describe('PropertiesPanel', () => {
  it('renders "No selection" when empty', () => {
    render(<PropertiesPanel />)
    expect(screen.getByText('No selection')).toBeInTheDocument()
  })

  it('renders "N objects selected" for multiple elements', () => {
    const r1 = makeSvgElement('rect')
    const r2 = makeSvgElement('rect')
    mockGetSelection.mockReturnValue([r1, r2])

    render(<PropertiesPanel />)
    expect(screen.getByText('2 objects selected')).toBeInTheDocument()
  })

  it('shows Align buttons when 2+ elements selected', () => {
    const r1 = makeSvgElement('rect')
    const r2 = makeSvgElement('rect')
    mockGetSelection.mockReturnValue([r1, r2])

    render(<PropertiesPanel />)
    expect(screen.getByText('Align')).toBeInTheDocument()
    expect(screen.getByTitle('Align Left')).toBeInTheDocument()
    expect(screen.getByTitle('Align Right')).toBeInTheDocument()
    expect(screen.getByTitle('Align Top')).toBeInTheDocument()
    expect(screen.getByTitle('Align Bottom')).toBeInTheDocument()
    expect(screen.getByTitle('Center Horizontal')).toBeInTheDocument()
    expect(screen.getByTitle('Center Vertical')).toBeInTheDocument()
  })

  it('shows Distribute buttons when 3+ elements selected', () => {
    const els = [makeSvgElement('rect'), makeSvgElement('rect'), makeSvgElement('rect')]
    mockGetSelection.mockReturnValue(els)

    render(<PropertiesPanel />)
    expect(screen.getByText('Distribute')).toBeInTheDocument()
    expect(screen.getByTitle('Distribute Horizontally')).toBeInTheDocument()
    expect(screen.getByTitle('Distribute Vertically')).toBeInTheDocument()
  })

  it('shows position inputs (X, Y) for rect element', () => {
    const rect = makeSvgElement('rect', { x: '10', y: '20', width: '100', height: '50', stroke: '#000000', 'stroke-width': '1' })
    mockGetSelection.mockReturnValue([rect])

    render(<PropertiesPanel />)
    expect(screen.getByText('Position')).toBeInTheDocument()
    expect(screen.getByText('X')).toBeInTheDocument()
    expect(screen.getByText('Y')).toBeInTheDocument()
  })

  it('shows position inputs (CX, CY) for ellipse', () => {
    const ellipse = makeSvgElement('ellipse', { cx: '50', cy: '60', rx: '30', ry: '20', stroke: '#000000', 'stroke-width': '1' })
    mockGetSelection.mockReturnValue([ellipse])

    render(<PropertiesPanel />)
    expect(screen.getByText('CX')).toBeInTheDocument()
    expect(screen.getByText('CY')).toBeInTheDocument()
  })

  it('shows size inputs (W, H) for rect', () => {
    const rect = makeSvgElement('rect', { x: '0', y: '0', width: '100', height: '50', stroke: '#000000', 'stroke-width': '1' })
    mockGetSelection.mockReturnValue([rect])

    render(<PropertiesPanel />)
    expect(screen.getByText('Size')).toBeInTheDocument()
    expect(screen.getByText('W')).toBeInTheDocument()
    expect(screen.getByText('H')).toBeInTheDocument()
  })

  it('shows Transform section with Rot input', () => {
    const rect = makeSvgElement('rect', { x: '0', y: '0', width: '100', height: '50', stroke: '#000000', 'stroke-width': '1' })
    mockGetSelection.mockReturnValue([rect])

    render(<PropertiesPanel />)
    expect(screen.getByText('Transform')).toBeInTheDocument()
    expect(screen.getByText('Rot')).toBeInTheDocument()
    expect(screen.getByText('SkX')).toBeInTheDocument()
    expect(screen.getByText('SkY')).toBeInTheDocument()
  })

  it('shows Style section with stroke color', () => {
    const rect = makeSvgElement('rect', { x: '0', y: '0', width: '100', height: '50', stroke: '#ff0000', 'stroke-width': '2' })
    mockGetSelection.mockReturnValue([rect])

    render(<PropertiesPanel />)
    expect(screen.getByText('Style')).toBeInTheDocument()
    expect(screen.getByText('Str')).toBeInTheDocument()
    expect(screen.getByText('SW')).toBeInTheDocument()
  })

  it('shows Font section for text elements', () => {
    const text = makeSvgElement('text', { x: '10', y: '20', 'font-size': '16', stroke: '#000000', 'stroke-width': '1' })
    mockGetSelection.mockReturnValue([text])

    render(<PropertiesPanel />)
    expect(screen.getByText('Font')).toBeInTheDocument()
    expect(screen.getByText('Fam')).toBeInTheDocument()
    expect(screen.getByText('Size')).toBeInTheDocument()
    expect(screen.getByText('Lsp')).toBeInTheDocument()
  })

  it('shows Markers section for line elements', () => {
    const line = makeSvgElement('line', { x1: '0', y1: '0', x2: '100', y2: '100', stroke: '#000000', 'stroke-width': '1' })
    mockGetSelection.mockReturnValue([line])

    render(<PropertiesPanel />)
    expect(screen.getByText('Markers')).toBeInTheDocument()
    expect(screen.getByText('Start')).toBeInTheDocument()
    expect(screen.getByText('End')).toBeInTheDocument()
  })

  it('shows aspect ratio lock button', () => {
    const rect = makeSvgElement('rect', { x: '0', y: '0', width: '100', height: '50', stroke: '#000000', 'stroke-width': '1' })
    mockGetSelection.mockReturnValue([rect])

    render(<PropertiesPanel />)
    expect(screen.getByTitle('Lock aspect ratio')).toBeInTheDocument()
  })
})
