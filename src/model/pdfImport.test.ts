import { describe, it, expect } from 'vitest'
import { postProcessPdfSvg } from './pdfImport'

describe('postProcessPdfSvg', () => {
  it('converts viewBox from points to millimeters', () => {
    const svg = '<svg viewBox="0 0 612 792"><rect/></svg>'
    const result = postProcessPdfSvg(svg)
    // 612pt = 215.9mm (US Letter width), 792pt = 279.4mm
    expect(result).toContain('viewBox="0.00 0.00 215.90 279.40"')
  })

  it('strips metadata elements', () => {
    const svg = '<svg viewBox="0 0 100 100"><title>Test</title><desc>Desc</desc><metadata>Meta</metadata><rect/></svg>'
    const result = postProcessPdfSvg(svg)
    expect(result).not.toContain('<title')
    expect(result).not.toContain('<desc')
    expect(result).not.toContain('<metadata')
    expect(result).toContain('<rect/>')
  })

  it('preserves <text> elements (text=text mode)', () => {
    const svg = '<svg viewBox="0 0 100 100"><text font-family="LMRoman10" font-size="12"><tspan x="10" y="20">hello</tspan></text></svg>'
    const result = postProcessPdfSvg(svg)
    expect(result).toContain('<text')
    expect(result).toContain('font-family="LMRoman10"')
    expect(result).toContain('hello')
  })

  it('preserves path elements and structure', () => {
    const svg = '<svg viewBox="0 0 595 842"><g><path d="M10 20 L30 40"/><rect x="5" y="5" width="10" height="10"/></g></svg>'
    const result = postProcessPdfSvg(svg)
    expect(result).toContain('d="M10 20 L30 40"')
    expect(result).toContain('<rect')
    expect(result).toContain('<g>')
  })

  it('handles SVG without viewBox gracefully', () => {
    const svg = '<svg><rect/></svg>'
    const result = postProcessPdfSvg(svg)
    expect(result).toContain('<rect/>')
  })
})
