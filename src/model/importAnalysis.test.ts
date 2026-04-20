import { describe, it, expect } from 'vitest'
import { analyzeImportedSvg } from './importAnalysis'

function svgFrom(inner: string): Element {
  const doc = new DOMParser().parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg">${inner}</svg>`,
    'image/svg+xml'
  )
  return doc.documentElement
}

describe('analyzeImportedSvg', () => {
  it('reports 0 text chars + 0 paths for an empty SVG', () => {
    const r = analyzeImportedSvg(svgFrom(''))
    expect(r.textChars).toBe(0)
    expect(r.pathCount).toBe(0)
    expect(r.mostlyOutlined).toBe(false)
  })

  it('counts characters across all <text> elements', () => {
    const r = analyzeImportedSvg(svgFrom(`
      <text>hello</text>
      <text>world</text>
    `))
    expect(r.textChars).toBe(10)
  })

  it('strips surrounding whitespace before counting text chars', () => {
    const r = analyzeImportedSvg(svgFrom(`<text>  hi  </text>`))
    expect(r.textChars).toBe(2)
  })

  it('counts <path> elements anywhere in the tree', () => {
    const r = analyzeImportedSvg(svgFrom(`
      <path d="M0 0 L10 10"/>
      <g><path d="M0 0"/><g><path d="M0 0"/></g></g>
    `))
    expect(r.pathCount).toBe(3)
  })

  it('counts <text> elements nested inside groups', () => {
    const r = analyzeImportedSvg(svgFrom(`
      <g><text>a</text><g><text>bc</text></g></g>
    `))
    expect(r.textChars).toBe(3)
  })

  it('flags as mostly-outlined when many paths but little text (yellow-BG profile)', () => {
    const paths = Array.from({ length: 225 }, () => '<path d="M0 0"/>').join('')
    const text = '<text>swift LinguistiK</text>'
    const r = analyzeImportedSvg(svgFrom(paths + text))
    expect(r.pathCount).toBe(225)
    expect(r.textChars).toBe(16) // "swift LinguistiK" — close to MuPDF's 15-char real-world reading
    expect(r.mostlyOutlined).toBe(true)
  })

  it('does NOT flag as mostly-outlined for a text-heavy PDF (noheader profile)', () => {
    const paths = Array.from({ length: 119 }, () => '<path d="M0 0"/>').join('')
    // Build ~890 chars of text content across many <text> nodes.
    const text = Array.from({ length: 31 }, (_, i) => `<text>${'x'.repeat(28)} ${i}</text>`).join('')
    const r = analyzeImportedSvg(svgFrom(paths + text))
    expect(r.pathCount).toBe(119)
    expect(r.textChars).toBeGreaterThan(800)
    expect(r.mostlyOutlined).toBe(false)
  })

  it('does NOT flag as mostly-outlined when path count is low (small clean SVG)', () => {
    const r = analyzeImportedSvg(svgFrom(`
      <path d="M0 0"/><path d="M0 0"/><path d="M0 0"/>
    `))
    // 3 paths total — below the noise threshold even with zero text.
    expect(r.mostlyOutlined).toBe(false)
  })

  it('flags pure line-drawing PDFs (no text, many paths) as mostly-outlined', () => {
    // Acceptable false positive: pure line drawings have no editable text by
    // definition, so the warning is still semantically right ("can't edit text").
    const paths = Array.from({ length: 80 }, () => '<path d="M0 0"/>').join('')
    const r = analyzeImportedSvg(svgFrom(paths))
    expect(r.mostlyOutlined).toBe(true)
  })
})
