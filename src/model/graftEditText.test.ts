/// <reference types="node" />
/**
 * Integration: an in-place text edit (EditTextCommand) on an imported run must
 * (a) re-emit in the SOURCE embedded font with naturally-shaped advances, and
 * (b) surface ONLY the edited run to the graft classifier so un-edited siblings
 * keep grafting byte-for-byte (vectorfeld-3yu.2).
 *
 * emitText shapes via fontkit and emits Identity-H glyph-ID hex (not literal
 * ASCII), so "new word present / old absent" is expressed as: the edited run's
 * content stream EQUALS authoring the new word fresh (scalar start-x ⇒ source
 * font reshapes advances) and DIFFERS from the original run's stream.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { emitText, type FontRegistry } from './graftCs'
import { loadFontkit, type FontkitFont } from './graftShape'
import { identityMatrix } from './matrix'
import { EditTextCommand } from './commands'
import { tagImportedLayer, PRIMARY_LAYER_ID } from './sourceTagging'
import { snapshotImportedElements, findModifiedSourceElements } from './sourceSnapshot'

const SVG_NS = 'http://www.w3.org/2000/svg'
const PT = 72 / 25.4
const PAGE_H = 297 * PT
const CARLITO_PATH = resolve(process.cwd(), 'src/fonts/Carlito-Regular.ttf')

let CARLITO: FontkitFont
beforeAll(() => {
  CARLITO = loadFontkit(new Uint8Array(readFileSync(CARLITO_PATH)))
})

function ctx() {
  return { matrix: identityMatrix(), pageHeightPt: PAGE_H }
}

function registry(): FontRegistry {
  return {
    resolveFontKey: () => 'F1',
    getFontkitFont: () => CARLITO,
  }
}

/** A source <text> run: single tspan with a per-char x-array (MuPDF shape). */
function makeRun(content: string, startX: number): Element {
  const text = document.createElementNS(SVG_NS, 'text')
  text.setAttribute('x', String(startX))
  text.setAttribute('y', '20')
  text.setAttribute('font-family', 'Helvetica')
  text.setAttribute('font-size', '6')
  text.setAttribute('fill', '#000000')
  const tspan = document.createElementNS(SVG_NS, 'tspan')
  // Per-char x-array sized to the original content (the shape that stacks
  // glyphs on a longer edit if NOT collapsed to a scalar start-x).
  tspan.setAttribute('x', content.split('').map((_, i) => String(startX + i * 3)).join(' '))
  tspan.textContent = content
  text.appendChild(tspan)
  return text
}

describe('graft re-emission of an edited imported text run', () => {
  it('edited run re-emits the new word in the source font; sibling stays grafted', () => {
    const layer = document.createElementNS(SVG_NS, 'g')
    layer.setAttribute('data-layer-name', 'Layer 1')
    const edited = makeRun('Coaching', 10)
    const sibling = makeRun('Vortrag', 10)
    layer.appendChild(edited)
    layer.appendChild(sibling)
    tagImportedLayer(layer, { page: 0, layerId: PRIMARY_LAYER_ID })
    snapshotImportedElements(layer)

    const outOld = emitText(edited, ctx(), registry())

    new EditTextCommand(edited, 'Training').execute()

    const outNew = emitText(edited, ctx(), registry())

    // Authoring "Training" fresh as a collapsed single-tspan run (scalar x=10).
    const fresh = document.createElementNS(SVG_NS, 'text')
    fresh.setAttribute('x', '10'); fresh.setAttribute('y', '20')
    fresh.setAttribute('font-family', 'Helvetica'); fresh.setAttribute('font-size', '6')
    fresh.setAttribute('fill', '#000000')
    const fts = document.createElementNS(SVG_NS, 'tspan')
    fts.setAttribute('x', '10'); fts.textContent = 'Training'
    fresh.appendChild(fts)
    const outFresh = emitText(fresh, ctx(), registry())

    // New word shapes naturally in the source font (== fresh authoring), and is
    // genuinely different from the original glyphs.
    expect(outNew).toBe(outFresh)
    expect(outNew).not.toBe(outOld)
    expect(outNew).not.toBe('')

    // Classification: ONLY the edited run is modified; the sibling is excluded
    // (so the real export grafts it byte-for-byte, unchanged).
    const modified = findModifiedSourceElements(layer)
    expect(modified).toEqual([edited])
    expect(modified).not.toContain(sibling)

    // The sibling's own emission is untouched by the neighbour edit.
    const siblingClone = makeRun('Vortrag', 10)
    expect(emitText(sibling, ctx(), registry())).toBe(emitText(siblingClone, ctx(), registry()))
  })
})
