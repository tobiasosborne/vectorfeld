/**
 * Compound path operations — combine/split multiple subpaths in a single path element.
 */

/**
 * Combine multiple path d strings into a single compound path d string.
 * Each input d string becomes a subpath (starting with M) in the result.
 */
export function makeCompoundD(dStrings: string[]): string {
  return dStrings.map((d) => d.trim()).filter(Boolean).join(' ')
}

/**
 * Split a compound path d string into individual subpath d strings.
 * Splits at each M command (the start of a new subpath).
 * Returns an array of d strings, each starting with M.
 */
export function releaseCompoundD(d: string): string[] {
  const trimmed = d.trim()
  if (!trimmed) return []

  // Split at M commands while keeping the M
  const parts: string[] = []
  let current = ''

  // Tokenize: split on M/m boundaries
  const normalized = trimmed.replace(/([Mm])/g, '\x00$1')
  const segments = normalized.split('\x00').filter(Boolean)

  for (const seg of segments) {
    const s = seg.trim()
    if (!s) continue

    if (s[0] === 'M' || s[0] === 'm') {
      if (current) {
        parts.push(current.trim())
      }
      current = s
    } else {
      // Continuation of current subpath
      current += ' ' + s
    }
  }

  if (current) {
    parts.push(current.trim())
  }

  return parts
}
