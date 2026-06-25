import { describe, it, expect } from 'vitest'
import { render, fireEvent, act } from '@testing-library/react'
import { LayersPanel } from './LayersPanel'
import { EditorProvider, useEditor } from '../model/EditorContext'
import { ModifyAttributeCommand } from '../model/commands'
import {
  SourcePdfStore,
  setActiveSourcePdfStore,
  getActiveSourcePdfStore,
} from '../model/sourcePdf'

type Editor = ReturnType<typeof useEditor>

// Small harness that wraps LayersPanel in EditorProvider with no SVG.
function renderInProvider() {
  return render(
    <EditorProvider>
      <LayersPanel />
    </EditorProvider>,
  )
}

// Harness that seeds a multi-layer document into the editor before LayersPanel
// renders. `onEditor` hands the test the editor so it can drive setSvg/history.
function SeededProbe({ svg, onEditor }: { svg: SVGSVGElement; onEditor?: (e: Editor) => void }) {
  const editor = useEditor()
  // setSvg is idempotent enough for a single render in a test.
  if (editor.doc?.svg !== svg) editor.setSvg(svg)
  // Hand the editor (stable identity — memoised on history) back to the test so
  // it can drive history.execute / undo directly.
  onEditor?.(editor)
  return <LayersPanel />
}

function buildSvgWithTwoLayers(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 210 297')
  // A background-PDF source layer (its name keys the store entry)…
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'g')
  bg.setAttribute('data-layer-name', 'BG-source')
  svg.appendChild(bg)
  // …plus a second layer so the delete button is enabled (length > 1).
  const fg = document.createElementNS('http://www.w3.org/2000/svg', 'g')
  fg.setAttribute('data-layer-name', 'Foreground')
  svg.appendChild(fg)
  const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'g')
  overlay.setAttribute('data-role', 'overlay')
  svg.appendChild(overlay)
  return svg
}

describe('<LayersPanel> Atrium restyle', () => {
  it('renders Layers + Pages tabs', () => {
    const { container } = renderInProvider()
    expect(container.querySelector('[data-role="layers-tab"]')).not.toBeNull()
    expect(container.querySelector('[data-role="pages-tab"]')).not.toBeNull()
  })

  it('shows the Layers tab as active (accent-tint pill)', () => {
    const { container } = renderInProvider()
    const layersTab = container.querySelector('[data-role="layers-tab"]') as HTMLElement
    const pagesTab = container.querySelector('[data-role="pages-tab"]') as HTMLElement
    expect(layersTab.style.background).toContain('panel-solid')
    expect(pagesTab.style.background).toBe('transparent')
  })

  it('renders an "+" add-layer button', () => {
    const { container } = renderInProvider()
    const btns = Array.from(container.querySelectorAll('button'))
    expect(btns.some(b => b.textContent === '+')).toBe(true)
  })
})

describe('deleteLayer tears down a background source-PDF store entry (vectorfeld-3yu.15)', () => {
  it('removes the store.backgrounds entry keyed by the deleted layer name', () => {
    setActiveSourcePdfStore(new SourcePdfStore())
    const store = getActiveSourcePdfStore()
    // Seed a background source entry keyed by the layer name we will delete.
    store.addBackground('BG-source', {
      bytes: new Uint8Array([1, 2, 3]),
      filename: 'bg.pdf',
      pageCount: 1,
    })
    expect(store.getBackground('BG-source')).not.toBeNull()

    const svg = buildSvgWithTwoLayers()
    const { container } = render(
      <EditorProvider>
        <SeededProbe svg={svg} />
      </EditorProvider>,
    )

    // The first rendered row is the BG-source layer. Click its delete button.
    const delBtns = Array.from(container.querySelectorAll('button[title="Delete layer"]'))
    expect(delBtns.length).toBeGreaterThan(0)
    fireEvent.click(delBtns[0])

    // Its retained bytes must be dropped from the store (no leak / stale routing).
    expect(getActiveSourcePdfStore().getBackground('BG-source')).toBeNull()
  })
})

describe('layer hide/lock route through command history (vectorfeld-3yu.12)', () => {
  // Render the seeded two-layer doc and hand the test the editor + container.
  function renderSeeded(svg: SVGSVGElement) {
    let editor!: Editor
    const { container } = render(
      <EditorProvider>
        <SeededProbe svg={svg} onEditor={(e) => { editor = e }} />
      </EditorProvider>,
    )
    return { editor, container }
  }

  it('(a) hide a layer → undo restores visibility', () => {
    const svg = buildSvgWithTwoLayers()
    const bg = svg.querySelector('[data-layer-name="BG-source"]') as SVGElement
    const { editor, container } = renderSeeded(svg)

    expect(bg.style.display).not.toBe('none')
    fireEvent.click(container.querySelector('button[title="Hide"]') as HTMLElement)
    expect(bg.style.display).toBe('none')

    act(() => editor.history.undo())
    expect(bg.style.display).not.toBe('none')
  })

  it('(b) lock a layer → undo removes the lock', () => {
    const svg = buildSvgWithTwoLayers()
    const bg = svg.querySelector('[data-layer-name="BG-source"]') as Element
    const { editor, container } = renderSeeded(svg)

    expect(bg.getAttribute('data-locked')).toBeNull()
    fireEvent.click(container.querySelector('button[title="Lock"]') as HTMLElement)
    expect(bg.getAttribute('data-locked')).toBe('true')

    act(() => editor.history.undo())
    // The layer had no data-locked attribute originally, so undo removes it.
    expect(bg.getAttribute('data-locked')).not.toBe('true')
  })

  it('(c) hide does NOT eat a prior committed edit — undo pops the hide, not the edit', () => {
    const svg = buildSvgWithTwoLayers()
    const bg = svg.querySelector('[data-layer-name="BG-source"]') as SVGElement
    const fg = svg.querySelector('[data-layer-name="Foreground"]') as Element
    const { editor, container } = renderSeeded(svg)

    // A real, committed edit lands on the undo stack first.
    act(() => editor.history.execute(new ModifyAttributeCommand(fg, 'data-test-edit', 'committed')))
    expect(fg.getAttribute('data-test-edit')).toBe('committed')

    // Now hide the BG layer.
    fireEvent.click(container.querySelector('button[title="Hide"]') as HTMLElement)
    expect(bg.style.display).toBe('none')

    // A single undo must reverse the HIDE and leave the prior edit untouched.
    act(() => editor.history.undo())
    expect(bg.style.display).not.toBe('none')          // hide undone
    expect(fg.getAttribute('data-test-edit')).toBe('committed') // prior edit survives
  })

  it('(d) LANDMINE: a layer with style="opacity:0.5" retains opacity after hide-then-unhide', () => {
    const svg = buildSvgWithTwoLayers()
    const bg = svg.querySelector('[data-layer-name="BG-source"]') as SVGElement
    bg.setAttribute('style', 'opacity: 0.5')
    const { container } = renderSeeded(svg)

    // Hide: display toggles on, opacity must survive.
    fireEvent.click(container.querySelector('button[title="Hide"]') as HTMLElement)
    expect(bg.style.display).toBe('none')
    expect(bg.style.opacity).toBe('0.5')

    // Unhide: display clears, opacity must STILL survive (no CSSOM clobber).
    fireEvent.click(container.querySelector('button[title="Show"]') as HTMLElement)
    expect(bg.style.display).not.toBe('none')
    expect(bg.style.opacity).toBe('0.5')
  })
})
