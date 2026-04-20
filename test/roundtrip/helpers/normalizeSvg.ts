/**
 * Normalize an SVG string for semantic equality testing.
 *
 * Two SVGs that render identically may still differ byte-wise because of:
 *   - Auto-generated ids (vf-1, vf-2, …) that vary per import
 *   - Floating-point coordinate noise (3.14159 vs 3.14)
 *   - Attribute insertion order (browsers/parsers don't preserve it consistently)
 *   - Title/desc/metadata wrappers that some emitters add
 *
 * normalizeSvg produces a canonical text form so two SVGs can be compared with
 * a string equality / file snapshot. Used as the high-signal layer of the PDF
 * round-trip test harness (see test/roundtrip/).
 *
 * Operations applied:
 *   1. Strip id="…" attributes (they vary per import)
 *   2. Strip <title>, <desc>, <metadata> elements (cosmetic noise)
 *   3. Round all numeric tokens to 2dp — applies to attribute values AND to
 *      the number tokens inside path d / transform / tspan x-list etc.
 *   4. Sort each element's attributes alphabetically
 *
 * The function is idempotent: normalizeSvg(normalizeSvg(x)) === normalizeSvg(x).
 */

const DECIMAL_RE = /-?\d+\.\d+(?:[eE][-+]?\d+)?/g

function roundTo2(s: string): string {
  return s.replace(DECIMAL_RE, (m) => {
    const n = parseFloat(m)
    if (!Number.isFinite(n)) return m
    // toFixed(2) then strip trailing zeros / pointless dot: 3.140 -> "3.14", 50.00 -> "50"
    const fixed = n.toFixed(2)
    return fixed.replace(/\.?0+$/, '') || '0'
  })
}

const STRIP_TAGS = new Set(['title', 'desc', 'metadata'])

function walkAndStrip(el: Element): void {
  // Strip attributes we don't want, round values, then sort what's left.
  const survivors: Array<[string, string]> = []
  for (const attr of Array.from(el.attributes)) {
    if (attr.name === 'id') continue
    // xmlns / xmlns:* are re-emitted from the element's namespaceURI by
    // XMLSerializer; carrying them as plain attributes too produces a
    // "duplicate attribute" parser error on the next round-trip.
    if (attr.name === 'xmlns' || attr.name.startsWith('xmlns:')) continue
    survivors.push([attr.name, roundTo2(attr.value)])
  }
  // Remove all then re-add in sorted order so XMLSerializer emits canonically.
  for (const a of Array.from(el.attributes)) el.removeAttribute(a.name)
  survivors.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  for (const [name, value] of survivors) el.setAttribute(name, value)

  // Recurse, removing strip-tagged children.
  for (const child of Array.from(el.children)) {
    if (STRIP_TAGS.has(child.tagName.toLowerCase())) {
      child.remove()
      continue
    }
    walkAndStrip(child)
  }
}

export function normalizeSvg(svgString: string): string {
  const parser = new DOMParser()
  const doc = parser.parseFromString(svgString, 'image/svg+xml')
  walkAndStrip(doc.documentElement)
  return new XMLSerializer().serializeToString(doc.documentElement)
}
