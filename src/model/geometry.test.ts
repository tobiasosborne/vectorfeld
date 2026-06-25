import { describe, it, expect, beforeEach } from 'vitest'
import { hitTestElement, hitTestAll } from './geometry'
import { tagImportedLayer } from './sourceTagging'

/**
 * Hit-test descent into PDF run-wrappers (vectorfeld-3yu.3).
 *
 * MuPDF emits one `<g>` per text run wrapping a single `<text>`;
 * `flattenAndScalePdfLayer` promotes those wrappers to direct layer children.
 * Before the fix, every click resolved to the wrapping `<g>`, so the
 * tag-based Font block in the Properties panel was unreachable for imported
 * text. The hit-test must now descend a structural run-wrapper to its inner
 * leaf, while leaving a user's semantic Group (no source-tagged descendants)
 * selectable as a unit.
 */

const DIRECT_SELECT_TAGS = new Set(['path', 'rect', 'ellipse', 'circle', 'line'])

// screenToDoc with this CTM: doc.x = screenX * (210/800), doc.y = screenY * (297/600)
const SCALE_X = 210 / 800
const SCALE_Y = 297 / 600

function makeSvg(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 210 297')
  Object.defineProperty(svg, 'clientWidth', { value: 800, writable: true })
  Object.defineProperty(svg, 'clientHeight', { value: 600, writable: true })
  svg.getScreenCTM = () =>
    ({
      a: 1 / SCALE_X, b: 0, c: 0, d: 1 / SCALE_Y, e: 0, f: 0,
      inverse() {
        return { a: SCALE_X, b: 0, c: 0, d: SCALE_Y, e: 0, f: 0 }
      },
    }) as unknown as DOMMatrix
  svg.createSVGPoint = () =>
    ({
      x: 0, y: 0,
      matrixTransform(this: { x: number; y: number }, m: DOMMatrix) {
        return {
          x: this.x * (m as unknown as { a: number }).a,
          y: this.y * (m as unknown as { d: number }).d,
        }
      },
    }) as unknown as SVGPoint
  document.body.appendChild(svg)
  return svg
}

/** Map a doc-space point to the screen coords the hit-test expects. */
function screenFor(docX: number, docY: number): { sx: number; sy: number } {
  return { sx: docX / SCALE_X, sy: docY / SCALE_Y }
}

function addLayer(svg: SVGSVGElement): Element {
  const layer = document.createElementNS('http://www.w3.org/2000/svg', 'g')
  layer.setAttribute('data-layer-name', 'Layer 1')
  svg.appendChild(layer)
  return layer
}

function el(tag: string, attrs: Record<string, string> = {}, bbox?: { x: number; y: number; width: number; height: number }): Element {
  const e = document.createElementNS('http://www.w3.org/2000/svg', tag)
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v)
  if (bbox) (e as unknown as { getBBox: () => unknown }).getBBox = () => ({ ...bbox })
  return e
}

describe('hit-test descent into PDF run-wrappers (vectorfeld-3yu.3)', () => {
  let svg: SVGSVGElement
  let layer: Element

  beforeEach(() => {
    document.body.innerHTML = ''
    svg = makeSvg()
    layer = addLayer(svg)
  })

  /**
   * Build the real-world fixture:
   *   g[data-layer-name]
   *     └ g  (NOT source-tagged, transform=scale(0.35))   ← run-wrapper
   *         └ text (source-tagged, transform=matrix(1,0,0,1,0,100))
   *
   * The wrapper and leaf carry DIFFERENT non-identity transforms, so the
   * composition (scale ∘ y-translate) is actually exercised.
   *
   * Inner text local bbox {0,0,50,10}; its own transform shifts it to local
   * {0,100,50,10}; the wrapper's scale(0.35) maps that to doc {0,35,17.5,3.5}.
   * We mock the wrapper getBBox to the wrapper-local union {0,100,50,10}, which
   * `transformedAABB(_, scale(0.35))` collapses to the same doc AABB.
   */
  function buildRunWrapperFixture() {
    const wrapper = el('g', { transform: 'scale(0.35)' }, { x: 0, y: 100, width: 50, height: 10 })
    const text = el('text', { transform: 'matrix(1,0,0,1,0,100)', x: '0', y: '0', 'font-size': '12' }, { x: 0, y: 0, width: 50, height: 10 })
    text.textContent = 'Hello'
    wrapper.appendChild(text)
    layer.appendChild(wrapper)
    // Source-tag via the REAL helper: stamps data-src-* on the leaf, never the <g>.
    tagImportedLayer(layer, { page: 0, layerId: '__primary__' })
    return { wrapper, text }
  }

  it('hitTestElement returns the inner <text>, not the wrapping <g>', () => {
    const { text } = buildRunWrapperFixture()
    const { sx, sy } = screenFor(8, 36.5) // inside doc AABB {0,35,17.5,3.5}
    const hit = hitTestElement(svg, sx, sy)
    expect(hit).not.toBeNull()
    expect(hit!.tagName).toBe('text')
    expect(hit).toBe(text)
  })

  it('hitTestAll surfaces the inner <text> leaf, not the wrapper', () => {
    const { text } = buildRunWrapperFixture()
    const { sx, sy } = screenFor(8, 36.5)
    const hits = hitTestAll(svg, sx, sy)
    expect(hits).toContain(text)
    expect(hits.some(h => h.tagName === 'g')).toBe(false)
  })

  it('the source-tagging helper tags the leaf but NOT the wrapper <g> (no new attribute)', () => {
    const { wrapper, text } = buildRunWrapperFixture()
    expect(text.hasAttribute('data-src-page')).toBe(true)
    expect(wrapper.hasAttribute('data-src-page')).toBe(false)
  })

  it('a plain user <g> (no source-tagged descendant) selects as a unit', () => {
    // Semantic group from GroupCommand: bare <g> wrapping a rect, nothing tagged.
    const group = el('g', { transform: 'scale(0.35)' }, { x: 0, y: 100, width: 50, height: 10 })
    const rect = el('rect', { x: '0', y: '100', width: '50', height: '10' }, { x: 0, y: 100, width: 50, height: 10 })
    group.appendChild(rect)
    layer.appendChild(group)

    const { sx, sy } = screenFor(8, 36.5)
    const hit = hitTestElement(svg, sx, sy)
    expect(hit).toBe(group)
    expect(hit!.tagName).toBe('g')
  })

  it('respects tagFilter: DIRECT_SELECT_TAGS does NOT surface the run-wrapper text', () => {
    buildRunWrapperFixture()
    const { sx, sy } = screenFor(8, 36.5)
    // direct-select excludes g/text — the resolved <text> leaf must be filtered out.
    const hit = hitTestElement(svg, sx, sy, { tagFilter: DIRECT_SELECT_TAGS })
    expect(hit).toBeNull()
  })

  it('descends a path inside a run-wrapper when it passes the tagFilter', () => {
    // A run-wrapper around a source-tagged <path>: direct-select should reach it.
    const wrapper = el('g', { transform: 'scale(0.35)' }, { x: 0, y: 100, width: 50, height: 10 })
    const path = el('path', { d: 'M0 100 L50 110', transform: 'matrix(1,0,0,1,0,100)' }, { x: 0, y: 0, width: 50, height: 10 })
    wrapper.appendChild(path)
    layer.appendChild(wrapper)
    tagImportedLayer(layer, { page: 0, layerId: '__primary__' })

    const { sx, sy } = screenFor(8, 36.5)
    const hit = hitTestElement(svg, sx, sy, { tagFilter: DIRECT_SELECT_TAGS })
    expect(hit).toBe(path)
    expect(hit!.tagName).toBe('path')
  })

  it('recurses through nested wrappers (clip-group > g > text)', () => {
    // Outer wrapper carries the scale; an intermediate (untagged, identity) g;
    // then the source-tagged text with the y-translate.
    const outer = el('g', { transform: 'scale(0.35)' }, { x: 0, y: 100, width: 50, height: 10 })
    const mid = el('g', {}, { x: 0, y: 100, width: 50, height: 10 })
    const text = el('text', { transform: 'matrix(1,0,0,1,0,100)', x: '0', y: '0' }, { x: 0, y: 0, width: 50, height: 10 })
    text.textContent = 'Nested'
    mid.appendChild(text)
    outer.appendChild(mid)
    layer.appendChild(outer)
    tagImportedLayer(layer, { page: 0, layerId: '__primary__' })

    const { sx, sy } = screenFor(8, 36.5)
    const hit = hitTestElement(svg, sx, sy)
    expect(hit).toBe(text)
    expect(hit!.tagName).toBe('text')
  })

  it('returns null when the click misses the run AABB entirely', () => {
    buildRunWrapperFixture()
    const { sx, sy } = screenFor(150, 250) // far outside doc {0,35,17.5,3.5}
    expect(hitTestElement(svg, sx, sy)).toBeNull()
  })
})
