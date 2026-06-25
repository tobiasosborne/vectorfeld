import { describe, it, expect } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { LayersPanel } from './LayersPanel'
import { EditorProvider, useEditor } from '../model/EditorContext'
import {
  SourcePdfStore,
  setActiveSourcePdfStore,
  getActiveSourcePdfStore,
} from '../model/sourcePdf'

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
function SeededProbe({ svg }: { svg: SVGSVGElement }) {
  const editor = useEditor()
  // setSvg is idempotent enough for a single render in a test.
  if (editor.doc?.svg !== svg) editor.setSvg(svg)
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
