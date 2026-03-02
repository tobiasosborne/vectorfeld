/**
 * Area text — word wrapping for text inside a bounding rectangle.
 * Creates multiple <tspan> elements with manual line breaks.
 */

/**
 * Wrap text into lines that fit within a given width.
 * Uses approximate character width based on font size.
 */
export function wrapText(text: string, widthMm: number, fontSizePx: number): string[] {
  if (!text || widthMm <= 0 || fontSizePx <= 0) return []

  // Approximate characters per line: width / (fontSize * avgCharWidth)
  // Average char width ~= 0.6 * fontSize for most fonts
  const avgCharWidth = fontSizePx * 0.6
  const charsPerLine = Math.max(1, Math.floor(widthMm / avgCharWidth))

  const words = text.split(/\s+/)
  const lines: string[] = []
  let currentLine = ''

  for (const word of words) {
    if (currentLine.length === 0) {
      currentLine = word
    } else if (currentLine.length + 1 + word.length <= charsPerLine) {
      currentLine += ' ' + word
    } else {
      lines.push(currentLine)
      currentLine = word
    }
  }
  if (currentLine.length > 0) {
    lines.push(currentLine)
  }
  return lines
}

/**
 * Build SVG attributes for an area text element.
 * Returns the outer text attributes and an array of tspan content.
 */
export function buildAreaTextAttrs(
  x: number, y: number, _width: number, _height: number,
  lines: string[], fontSizePx: number, fontFamily: string
): {
  textAttrs: Record<string, string>
  tspans: Array<{ attrs: Record<string, string>; text: string }>
} {
  const lineHeight = fontSizePx * 1.2

  return {
    textAttrs: {
      x: String(x),
      y: String(y + fontSizePx), // baseline offset
      'font-family': fontFamily,
      'font-size': String(fontSizePx),
    },
    tspans: lines.map((line, i) => ({
      attrs: {
        x: String(x),
        dy: i === 0 ? '0' : String(lineHeight),
      },
      text: line,
    })),
  }
}
