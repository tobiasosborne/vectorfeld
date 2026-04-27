/// <reference types="node" />
/**
 * Tests for registerCidFont — the Type-0 / CID-keyed font registration
 * primitive used by the shaped-TJ text emission path.
 *
 * Acceptance from vectorfeld-7t7: register Carlito via registerCidFont,
 * save+reopen, verify the page's /Resources/Font/<key> resolves to a
 * Type-0 dict (Subtype = 'Type0').
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  openSourcePdfDoc,
  closeSourcePdfDoc,
  createEmptyPdfDoc,
  graftSourcePageInto,
  registerCidFont,
} from './graftMupdf'
import { exportSvgStringToPdfBytes } from './fileio'

const SHAPES_ONLY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 30">
  <g data-layer-name="Layer 1">
    <rect x="5" y="5" width="10" height="10" fill="#ff0000" />
  </g>
</svg>`

const CARLITO_PATH = resolve(process.cwd(), 'src/fonts/Carlito-Regular.ttf')

describe('registerCidFont', () => {
  let shapesBytes: Uint8Array
  let carlito: Uint8Array

  beforeAll(async () => {
    shapesBytes = await exportSvgStringToPdfBytes(SHAPES_ONLY_SVG)
    carlito = new Uint8Array(readFileSync(CARLITO_PATH))
  })

  it('registers a Type-0 font ref under the requested key in page Resources', async () => {
    const out = await createEmptyPdfDoc()
    const src = await openSourcePdfDoc(shapesBytes)
    graftSourcePageInto(out, src, 0)
    closeSourcePdfDoc(src)

    const { ref, fontkitFont } = await registerCidFont(out, 0, 'VfCidCarlito', carlito)
    expect(ref.isIndirect()).toBe(true)
    expect(fontkitFont.unitsPerEm).toBeGreaterThan(0)

    // Pre-save: the dict should already report Type0.
    const fontObj = ref.resolve()
    expect(fontObj.isDictionary()).toBe(true)
    const subtype = fontObj.get('Subtype')
    expect(subtype.isName()).toBe(true)
    expect(subtype.asName()).toBe('Type0')

    closeSourcePdfDoc(out)
  })

  it('survives save/reload — Type-0 wrapper + Identity-H + DescendantFonts intact', async () => {
    const out = await createEmptyPdfDoc()
    const src = await openSourcePdfDoc(shapesBytes)
    graftSourcePageInto(out, src, 0)
    closeSourcePdfDoc(src)

    await registerCidFont(out, 0, 'VfCidCarlito', carlito)
    const saved = out.saveToBuffer('compress=no').asUint8Array()
    closeSourcePdfDoc(out)

    const reloaded = await openSourcePdfDoc(saved)
    const fontsDict = reloaded.findPage(0).get('Resources').resolve().get('Font')
    expect(fontsDict.isDictionary()).toBe(true)

    const fontRef = fontsDict.get('VfCidCarlito')
    expect(fontRef.isIndirect()).toBe(true)
    const fontObj = fontRef.resolve()

    const subtype = fontObj.get('Subtype')
    const encoding = fontObj.get('Encoding')
    const descendants = fontObj.get('DescendantFonts')
    const toUnicode = fontObj.get('ToUnicode')

    expect(subtype.isName() && subtype.asName()).toBe('Type0')
    expect(encoding.isName() && encoding.asName()).toBe('Identity-H')
    expect(descendants.isArray()).toBe(true)
    expect(descendants.length).toBe(1)
    // /ToUnicode auto-attached by mupdf — verified in spike-05-verdict.md.
    expect(toUnicode.isNull()).toBe(false)

    const cidFont = descendants.get(0).resolve()
    expect(cidFont.get('Subtype').asName()).toBe('CIDFontType2')

    closeSourcePdfDoc(reloaded)
  })

  it('coexists with simple-font registrations on the same page (different keys)', async () => {
    const out = await createEmptyPdfDoc()
    const src = await openSourcePdfDoc(shapesBytes)
    graftSourcePageInto(out, src, 0)
    closeSourcePdfDoc(src)

    const { registerOverlayFont } = await import('./graftMupdf')
    await registerOverlayFont(out, 0, 'VfSimple', carlito)
    await registerCidFont(out, 0, 'VfCid', carlito)

    const fontsDict = out.findPage(0).get('Resources').resolve().get('Font')
    expect(fontsDict.get('VfSimple').isIndirect()).toBe(true)
    expect(fontsDict.get('VfCid').isIndirect()).toBe(true)
    // Different subtypes — proves both paths work side by side.
    expect(fontsDict.get('VfSimple').resolve().get('Subtype').asName()).not.toBe('Type0')
    expect(fontsDict.get('VfCid').resolve().get('Subtype').asName()).toBe('Type0')

    closeSourcePdfDoc(out)
  })
})
