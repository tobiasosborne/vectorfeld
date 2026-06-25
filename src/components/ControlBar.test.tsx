import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ControlBar } from './ControlBar'
import { CommandHistory, ModifyAttributeCommand } from '../model/commands'

// ---- Mocks ----------------------------------------------------------------
//
// We mock the SELECTION module (so we can hand ControlBar a fixed selection
// without a real overlay/document) but use the REAL CommandHistory +
// ModifyAttributeCommand. Executing a command through the real history both
// mutates the DOM (setAttribute) AND fires the history listeners — exactly
// reproducing a nudge / inspector edit, which change geometry WITHOUT changing
// the selection. This is the scenario where the Frame readout went stale
// (vectorfeld-3yu.17).

const mockGetSelection = vi.fn<() => Element[]>(() => [])
const mockSubscribeSelection = vi.fn<(fn: () => void) => () => void>(() => () => {})
const mockRefreshOverlay = vi.fn()

vi.mock('../model/selection', () => ({
  getSelection: (...args: unknown[]) => mockGetSelection(...(args as [])),
  subscribeSelection: (...args: unknown[]) => mockSubscribeSelection(...(args as [() => void])),
  refreshOverlay: (...args: unknown[]) => mockRefreshOverlay(...(args as [])),
}))

// `editorValue` is a STABLE object reference across renders so ControlBar's
// `useEffect(..., [history])` does not re-subscribe every render. We swap the
// `.history` field to a fresh CommandHistory per test in beforeEach.
const hoisted = vi.hoisted(() => ({
  editorValue: { history: null as unknown, doc: null },
}))

vi.mock('../model/EditorContext', () => ({
  useEditor: () => hoisted.editorValue,
}))

// ---- Helpers ---------------------------------------------------------------

function makeSvgElement(tag: string, attrs: Record<string, string> = {}): Element {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag)
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
  return el
}

let history: CommandHistory

afterEach(cleanup)

beforeEach(() => {
  vi.clearAllMocks()
  mockGetSelection.mockReturnValue([])
  mockSubscribeSelection.mockImplementation(() => () => {})
  history = new CommandHistory()
  hoisted.editorValue.history = history
})

// ---- Tests -----------------------------------------------------------------

describe('ControlBar', () => {
  it('renders the X/Y/W/H/R Frame readout from element attributes (jsdom-safe)', () => {
    // rect geometry is read directly from attributes — no getBBox (which jsdom
    // stubs to 0). So these assertions are deterministic in jsdom.
    const rect = makeSvgElement('rect', { x: '10', y: '20', width: '100', height: '50' })
    mockGetSelection.mockReturnValue([rect])

    render(<ControlBar />)

    expect((screen.getByTestId('frame-x') as HTMLInputElement).value).toBe('10.00')
    expect((screen.getByTestId('frame-y') as HTMLInputElement).value).toBe('20.00')
    expect((screen.getByTestId('frame-w') as HTMLInputElement).value).toBe('100.00')
    expect((screen.getByTestId('frame-h') as HTMLInputElement).value).toBe('50.00')
  })

  it('refreshes the Frame readout after an out-of-band geometry edit WITHOUT a selection event (vectorfeld-3yu.17)', () => {
    const rect = makeSvgElement('rect', { x: '10', y: '20', width: '100', height: '50' })
    mockGetSelection.mockReturnValue([rect])

    render(<ControlBar />)
    expect((screen.getByTestId('frame-x') as HTMLInputElement).value).toBe('10.00')
    expect((screen.getByTestId('frame-w') as HTMLInputElement).value).toBe('100.00')

    // The selection callback is NEVER invoked here. We mutate geometry via the
    // real history (like a nudge / inspector edit), which only fires the HISTORY
    // listener. Before the fix, ControlBar ignored history and stayed STALE.
    const selectionCalls = mockSubscribeSelection.mock.calls.length
    act(() => {
      history.execute(new ModifyAttributeCommand(rect, 'x', '55'))
      history.execute(new ModifyAttributeCommand(rect, 'width', '200'))
    })
    // No new selection subscription / no selection notification occurred.
    expect(mockSubscribeSelection.mock.calls.length).toBe(selectionCalls)

    expect((screen.getByTestId('frame-x') as HTMLInputElement).value).toBe('55.00')
    expect((screen.getByTestId('frame-w') as HTMLInputElement).value).toBe('200.00')
  })

  it('refreshes the rotation (R) readout after an out-of-band transform edit', () => {
    const rect = makeSvgElement('rect', { x: '0', y: '0', width: '100', height: '50' })
    mockGetSelection.mockReturnValue([rect])

    render(<ControlBar />)
    expect((screen.getByTestId('frame-r') as HTMLInputElement).value).toBe('0.00')

    act(() => {
      history.execute(new ModifyAttributeCommand(rect, 'transform', 'rotate(30, 50, 25)'))
    })
    expect((screen.getByTestId('frame-r') as HTMLInputElement).value).toBe('30.00')
  })

  it('reflects undo of a geometry edit (readout returns to the pre-edit value)', () => {
    const rect = makeSvgElement('rect', { x: '10', y: '20', width: '100', height: '50' })
    mockGetSelection.mockReturnValue([rect])

    render(<ControlBar />)
    act(() => history.execute(new ModifyAttributeCommand(rect, 'x', '99')))
    expect((screen.getByTestId('frame-x') as HTMLInputElement).value).toBe('99.00')

    act(() => history.undo())
    expect((screen.getByTestId('frame-x') as HTMLInputElement).value).toBe('10.00')
  })

  it('does NOT clobber a focused field mid-edit when a history mutation fires', () => {
    const rect = makeSvgElement('rect', { x: '10', y: '20', width: '100', height: '50' })
    mockGetSelection.mockReturnValue([rect])

    render(<ControlBar />)
    const wInput = screen.getByTestId('frame-w') as HTMLInputElement

    // User focuses W and types a new in-progress value (not yet committed).
    fireEvent.focus(wInput)
    fireEvent.change(wInput, { target: { value: '77' } })
    expect(wInput.value).toBe('77')

    // A history mutation lands underneath — even one that changes the SAME
    // attribute this field is bound to. The focused field must keep the user's
    // in-progress text, not snap to the external value.
    act(() => {
      history.execute(new ModifyAttributeCommand(rect, 'width', '200'))
    })
    expect((screen.getByTestId('frame-w') as HTMLInputElement).value).toBe('77')

    // An unfocused sibling field still tracks the live geometry.
    fireEvent.blur(wInput)
    act(() => {
      history.execute(new ModifyAttributeCommand(rect, 'x', '12'))
    })
    expect((screen.getByTestId('frame-x') as HTMLInputElement).value).toBe('12.00')
  })
})
