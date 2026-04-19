import { describe, it, expect, beforeEach } from 'vitest'
import { exportSvgString, parseSvgString, sanitizeSvgTree } from './fileio'
import { createDocumentModel, resetIdCounter, generateId, syncIdCounter } from './document'
import type { DocumentModel } from './document'

function makeSvg(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 210 297')
  const layer = document.createElementNS('http://www.w3.org/2000/svg', 'g')
  layer.setAttribute('data-layer-name', 'Layer 1')
  svg.appendChild(layer)
  document.body.appendChild(svg)
  return svg
}

describe('exportSvgString', () => {
  let doc: DocumentModel

  beforeEach(() => {
    document.body.innerHTML = ''
    resetIdCounter()
    const svg = makeSvg()
    doc = createDocumentModel(svg)
  })

  it('includes XML declaration', () => {
    const result = exportSvgString(doc)
    expect(result).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>/)
  })

  it('includes xmlns attribute', () => {
    const result = exportSvgString(doc)
    expect(result).toContain('xmlns="http://www.w3.org/2000/svg"')
  })

  it('strips data-role="overlay" elements', () => {
    const layer = doc.getActiveLayer()!
    const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    overlay.setAttribute('data-role', 'overlay')
    overlay.setAttribute('id', 'test-overlay')
    doc.svg.appendChild(overlay)
    // Also add a real element to make sure it stays
    doc.addElement(layer, 'rect', { width: '50', height: '30' })

    const result = exportSvgString(doc)
    expect(result).not.toContain('test-overlay')
    expect(result).toContain('<rect')
  })

  it('strips data-role="preview" elements', () => {
    const preview = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    preview.setAttribute('data-role', 'preview')
    preview.setAttribute('id', 'test-preview')
    doc.svg.appendChild(preview)

    const result = exportSvgString(doc)
    expect(result).not.toContain('test-preview')
  })

  it('strips grid-overlay, guides-overlay, and wireframe elements', () => {
    for (const role of ['grid-overlay', 'guides-overlay', 'user-guides-overlay', 'wireframe']) {
      const el = document.createElementNS('http://www.w3.org/2000/svg', 'g')
      el.setAttribute('data-role', role)
      el.setAttribute('id', `test-${role}`)
      doc.svg.appendChild(el)
    }

    const result = exportSvgString(doc)
    expect(result).not.toContain('test-grid-overlay')
    expect(result).not.toContain('test-guides-overlay')
    expect(result).not.toContain('test-user-guides-overlay')
    expect(result).not.toContain('test-wireframe')
  })

  it('preserves document content (layers and elements)', () => {
    const layer = doc.getActiveLayer()!
    doc.addElement(layer, 'rect', { width: '100', height: '50', fill: 'red' })
    doc.addElement(layer, 'circle', { cx: '50', cy: '50', r: '25' })

    const result = exportSvgString(doc)
    expect(result).toContain('<rect')
    expect(result).toContain('width="100"')
    expect(result).toContain('<circle')
    expect(result).toContain('r="25"')
    expect(result).toContain('data-layer-name="Layer 1"')
  })
})

describe('parseSvgString', () => {
  it('extracts viewBox', () => {
    const svgStr = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200"><rect width="10" height="10"/></svg>'
    const parsed = parseSvgString(svgStr)
    expect(parsed.viewBox).toBe('0 0 300 200')
  })

  it('returns null viewBox when absent', () => {
    const svgStr = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>'
    const parsed = parseSvgString(svgStr)
    expect(parsed.viewBox).toBeNull()
  })

  it('extracts defs children', () => {
    const svgStr = `<svg xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="grad1"><stop offset="0%" stop-color="red"/></linearGradient>
        <clipPath id="clip1"><rect width="10" height="10"/></clipPath>
      </defs>
      <rect width="10" height="10"/>
    </svg>`
    const parsed = parseSvgString(svgStr)
    expect(parsed.defs).toHaveLength(2)
    expect(parsed.defs[0].getAttribute('id')).toBe('grad1')
    expect(parsed.defs[1].getAttribute('id')).toBe('clip1')
  })

  it('creates layers from groups with data-layer-name', () => {
    const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 210 297">
      <g data-layer-name="Background">
        <rect id="vf-1" width="100" height="100" fill="blue"/>
      </g>
      <g data-layer-name="Foreground">
        <circle id="vf-2" cx="50" cy="50" r="25"/>
      </g>
    </svg>`
    const parsed = parseSvgString(svgStr)
    expect(parsed.layers).toHaveLength(2)
    expect(parsed.layers[0].getAttribute('data-layer-name')).toBe('Background')
    expect(parsed.layers[1].getAttribute('data-layer-name')).toBe('Foreground')
    // First layer should contain the rect
    expect(parsed.layers[0].querySelector('rect')).not.toBeNull()
    // Second layer should contain the circle
    expect(parsed.layers[1].querySelector('circle')).not.toBeNull()
  })

  it('wraps flat elements in a synthetic "Layer 1" when no layers exist', () => {
    const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 210 297">
      <rect width="50" height="30"/>
      <ellipse cx="100" cy="100" rx="20" ry="10"/>
    </svg>`
    const parsed = parseSvgString(svgStr)
    expect(parsed.layers).toHaveLength(1)
    expect(parsed.layers[0].getAttribute('data-layer-name')).toBe('Layer 1')
    // Should contain both elements
    expect(parsed.layers[0].querySelector('rect')).not.toBeNull()
    expect(parsed.layers[0].querySelector('ellipse')).not.toBeNull()
  })

  it('preserves <image> elements in flat mode (SVG round-trip of imported PDF)', () => {
    const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 210 297">
      <image x="10" y="10" width="50" height="50" xlink:href="data:image/png;base64,iVBORw0KGgo="/>
      <text x="10" y="80">caption</text>
    </svg>`
    const parsed = parseSvgString(svgStr)
    const layer = parsed.layers[0]
    expect(layer.querySelector('image')).not.toBeNull()
    expect(layer.querySelector('image')?.getAttribute('xlink:href')).toContain('data:image/png;base64')
    expect(layer.querySelector('text')).not.toBeNull()
  })

  it('ignores non-drawing elements (e.g. title, desc) in flat mode', () => {
    const svgStr = `<svg xmlns="http://www.w3.org/2000/svg">
      <title>My Drawing</title>
      <desc>A description</desc>
      <rect width="10" height="10"/>
    </svg>`
    const parsed = parseSvgString(svgStr)
    const layer = parsed.layers[0]
    // title and desc should not be imported
    expect(layer.querySelector('title')).toBeNull()
    expect(layer.querySelector('desc')).toBeNull()
    // rect should be imported
    expect(layer.querySelector('rect')).not.toBeNull()
  })
})

describe('syncIdCounter', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    resetIdCounter()
  })

  it('advances ID counter past imported vf-N IDs', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    rect.setAttribute('id', 'vf-42')
    svg.appendChild(rect)

    syncIdCounter(svg)
    // Next generated ID should be vf-43
    const nextId = generateId()
    expect(nextId).toBe('vf-43')
  })
})

describe('round-trip export/import', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    resetIdCounter()
  })

  it('preserves elements through export then parse', () => {
    const svg = makeSvg()
    const doc = createDocumentModel(svg)
    const layer = doc.getActiveLayer()!
    doc.addElement(layer, 'rect', { width: '100', height: '50', fill: '#ff0000' })
    doc.addElement(layer, 'circle', { cx: '80', cy: '80', r: '30', stroke: '#000000' })

    // Export to string
    const exported = exportSvgString(doc)

    // Parse it back (skip the XML declaration for DOMParser)
    const svgContent = exported.replace(/^<\?xml[^?]*\?>\s*/, '')
    const parsed = parseSvgString(svgContent)

    // Should have the same viewBox
    expect(parsed.viewBox).toBe('0 0 210 297')

    // Should have a layer with the elements
    expect(parsed.layers).toHaveLength(1)
    expect(parsed.layers[0].getAttribute('data-layer-name')).toBe('Layer 1')
    expect(parsed.layers[0].querySelector('rect')).not.toBeNull()
    expect(parsed.layers[0].querySelector('circle')).not.toBeNull()

    // Verify attribute preservation
    const rect = parsed.layers[0].querySelector('rect')!
    expect(rect.getAttribute('width')).toBe('100')
    expect(rect.getAttribute('fill')).toBe('#ff0000')
  })
})

describe('sanitizeSvgTree', () => {
  function parse(xml: string): Element {
    const doc = new DOMParser().parseFromString(xml, 'image/svg+xml')
    return doc.documentElement
  }

  it('removes <script> elements', () => {
    const root = parse(`<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect/></svg>`)
    sanitizeSvgTree(root)
    expect(root.querySelector('script')).toBeNull()
    expect(root.querySelector('rect')).not.toBeNull()
  })

  it('removes nested <script> inside <g>', () => {
    const root = parse(`<svg xmlns="http://www.w3.org/2000/svg"><g><script>bad()</script><rect/></g></svg>`)
    sanitizeSvgTree(root)
    expect(root.querySelector('script')).toBeNull()
    expect(root.querySelector('g rect')).not.toBeNull()
  })

  it('removes <foreignObject>', () => {
    const root = parse(`<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><body xmlns="http://www.w3.org/1999/xhtml">nope</body></foreignObject><rect/></svg>`)
    sanitizeSvgTree(root)
    expect(root.querySelector('foreignObject')).toBeNull()
    expect(root.querySelector('rect')).not.toBeNull()
  })

  it('strips on* event handler attributes', () => {
    const root = parse(`<svg xmlns="http://www.w3.org/2000/svg"><rect onclick="x=1" onmouseover="y=2" fill="red"/></svg>`)
    sanitizeSvgTree(root)
    const rect = root.querySelector('rect')!
    expect(rect.getAttribute('onclick')).toBeNull()
    expect(rect.getAttribute('onmouseover')).toBeNull()
    expect(rect.getAttribute('fill')).toBe('red')
  })

  it('strips javascript: hrefs on <a>', () => {
    const root = parse(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><a href="javascript:alert(1)"><rect/></a></svg>`)
    sanitizeSvgTree(root)
    const a = root.querySelector('a')!
    expect(a.getAttribute('href')).toBeNull()
  })

  it('strips javascript: xlink:href', () => {
    const root = parse(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><use xlink:href="javascript:evil()"/></svg>`)
    sanitizeSvgTree(root)
    const use = root.querySelector('use')!
    expect(use.getAttribute('xlink:href')).toBeNull()
  })

  it('preserves safe href to an SVG element id', () => {
    const root = parse(`<svg xmlns="http://www.w3.org/2000/svg"><use href="#my-gradient"/></svg>`)
    sanitizeSvgTree(root)
    const use = root.querySelector('use')!
    expect(use.getAttribute('href')).toBe('#my-gradient')
  })

  it('preserves data:image base64 hrefs', () => {
    const root = parse(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><image xlink:href="data:image/png;base64,iVBORw0K"/></svg>`)
    sanitizeSvgTree(root)
    const img = root.querySelector('image')!
    expect(img.getAttribute('xlink:href')).toContain('data:image/png;base64')
  })

  it('strips data:text/html hrefs', () => {
    const root = parse(`<svg xmlns="http://www.w3.org/2000/svg"><use href="data:text/html,&lt;script&gt;alert(1)&lt;/script&gt;"/></svg>`)
    sanitizeSvgTree(root)
    const use = root.querySelector('use')!
    expect(use.getAttribute('href')).toBeNull()
  })

  it('handles uppercase event handler variants (ONCLICK, OnClick)', () => {
    const root = parse(`<svg xmlns="http://www.w3.org/2000/svg"><rect ONCLICK="x" OnMouseOver="y" fill="red"/></svg>`)
    sanitizeSvgTree(root)
    const rect = root.querySelector('rect')!
    expect(rect.getAttributeNames().filter((n) => n.toLowerCase().startsWith('on'))).toHaveLength(0)
    expect(rect.getAttribute('fill')).toBe('red')
  })

  it('parseSvgString applies sanitization before import', () => {
    const parsed = parseSvgString(`<svg xmlns="http://www.w3.org/2000/svg"><rect onclick="bad()"/><script>x</script></svg>`)
    const layer = parsed.layers[0]
    expect(layer.querySelector('script')).toBeNull()
    const rect = layer.querySelector('rect')
    expect(rect?.getAttribute('onclick')).toBeNull()
  })
})
