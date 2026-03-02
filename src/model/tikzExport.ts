/**
 * TikZ export — converts SVG document elements to TikZ drawing commands.
 * Y-axis is inverted: TikZ y increases upward, SVG y increases downward.
 */

/** Convert hex color to TikZ-compatible color definition */
export function hexToTikzColor(hex: string): string {
  if (!hex || hex === 'none') return ''
  const h = hex.replace('#', '')
  if (h.length !== 6 && h.length !== 3) return hex
  const full = h.length === 3
    ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
    : h
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  return `{rgb,255:red,${r};green,${g};blue,${b}}`
}

/** Build TikZ draw/fill options string from element attributes */
function tikzOptions(el: Element): string {
  const parts: string[] = []
  const stroke = el.getAttribute('stroke')
  const fill = el.getAttribute('fill')
  const sw = el.getAttribute('stroke-width')

  if (fill && fill !== 'none') {
    const color = hexToTikzColor(fill)
    parts.push(color ? `fill=${color}` : 'fill')
  }
  if (stroke && stroke !== 'none') {
    const color = hexToTikzColor(stroke)
    if (color) parts.push(`draw=${color}`)
    else parts.push('draw')
  }
  if (sw) {
    const width = parseFloat(sw)
    if (width > 0) parts.push(`line width=${width}mm`)
  }

  const dasharray = el.getAttribute('stroke-dasharray')
  if (dasharray && dasharray !== 'none') {
    parts.push('dashed')
  }

  return parts.length > 0 ? `[${parts.join(', ')}]` : ''
}

/** Convert a single SVG element to TikZ command(s) */
export function elementToTikz(el: Element, maxY: number): string {
  const tag = el.tagName
  const opts = tikzOptions(el)
  const y = (v: number) => (maxY - v).toFixed(2)

  if (tag === 'rect') {
    const x1 = parseFloat(el.getAttribute('x') || '0')
    const y1 = parseFloat(el.getAttribute('y') || '0')
    const w = parseFloat(el.getAttribute('width') || '0')
    const h = parseFloat(el.getAttribute('height') || '0')
    return `\\draw${opts} (${x1.toFixed(2)}mm, ${y(y1 + h)}mm) rectangle (${(x1 + w).toFixed(2)}mm, ${y(y1)}mm);`
  }

  if (tag === 'ellipse') {
    const cx = parseFloat(el.getAttribute('cx') || '0')
    const cy = parseFloat(el.getAttribute('cy') || '0')
    const rx = parseFloat(el.getAttribute('rx') || '0')
    const ry = parseFloat(el.getAttribute('ry') || '0')
    return `\\draw${opts} (${cx.toFixed(2)}mm, ${y(cy)}mm) ellipse (${rx.toFixed(2)}mm and ${ry.toFixed(2)}mm);`
  }

  if (tag === 'circle') {
    const cx = parseFloat(el.getAttribute('cx') || '0')
    const cy = parseFloat(el.getAttribute('cy') || '0')
    const r = parseFloat(el.getAttribute('r') || '0')
    return `\\draw${opts} (${cx.toFixed(2)}mm, ${y(cy)}mm) circle (${r.toFixed(2)}mm);`
  }

  if (tag === 'line') {
    const x1 = parseFloat(el.getAttribute('x1') || '0')
    const y1 = parseFloat(el.getAttribute('y1') || '0')
    const x2 = parseFloat(el.getAttribute('x2') || '0')
    const y2 = parseFloat(el.getAttribute('y2') || '0')
    return `\\draw${opts} (${x1.toFixed(2)}mm, ${y(y1)}mm) -- (${x2.toFixed(2)}mm, ${y(y2)}mm);`
  }

  if (tag === 'text') {
    const x = parseFloat(el.getAttribute('x') || '0')
    const ty = parseFloat(el.getAttribute('y') || '0')
    const content = el.textContent || ''
    return `\\node${opts ? opts.replace(']', ', anchor=base west]') : '[anchor=base west]'} at (${x.toFixed(2)}mm, ${y(ty)}mm) {${escapeLatex(content)}};`
  }

  if (tag === 'path') {
    return pathToTikz(el, opts, maxY)
  }

  if (tag === 'g' && !el.hasAttribute('data-layer-name')) {
    // Group: recurse into children
    const lines: string[] = []
    for (const child of el.children) {
      const line = elementToTikz(child, maxY)
      if (line) lines.push(line)
    }
    return lines.join('\n')
  }

  return '' // unknown element
}

/** Convert SVG path to TikZ drawing commands */
function pathToTikz(el: Element, opts: string, maxY: number): string {
  const d = el.getAttribute('d')
  if (!d) return ''
  const y = (v: number) => (maxY - v).toFixed(2)

  // Simple tokenized conversion
  const tokens = d.replace(/([MLCZmlcz])/g, '\n$1').split('\n').filter(Boolean)
  const parts: string[] = []
  let curX = 0, curY = 0

  for (const token of tokens) {
    const cmd = token[0]
    const nums = token.slice(1).trim().split(/[\s,]+/).map(Number)

    if (cmd === 'M') {
      curX = nums[0]; curY = nums[1]
      parts.push(`(${curX.toFixed(2)}mm, ${y(curY)}mm)`)
    } else if (cmd === 'L') {
      curX = nums[0]; curY = nums[1]
      parts.push(`-- (${curX.toFixed(2)}mm, ${y(curY)}mm)`)
    } else if (cmd === 'C') {
      const [x1, y1, x2, y2, x, yv] = nums
      parts.push(`.. controls (${x1.toFixed(2)}mm, ${y(y1)}mm) and (${x2.toFixed(2)}mm, ${y(y2)}mm) .. (${x.toFixed(2)}mm, ${y(yv)}mm)`)
      curX = x; curY = yv
    } else if (cmd === 'Z' || cmd === 'z') {
      parts.push('-- cycle')
    }
  }

  if (parts.length === 0) return ''
  return `\\draw${opts} ${parts.join(' ')};`
}

/** Escape special LaTeX characters in text */
function escapeLatex(text: string): string {
  return text
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/[&%$#_{}~^]/g, (ch) => `\\${ch}`)
}

/**
 * Convert the entire SVG document to a TikZ picture.
 * Returns a complete \begin{tikzpicture}...\end{tikzpicture} block.
 */
export function svgToTikz(svg: SVGSVGElement): string {
  const vb = svg.viewBox.baseVal
  const maxY = vb.height || 297

  const lines: string[] = []
  lines.push('\\begin{tikzpicture}[x=1mm, y=1mm]')

  const layers = svg.querySelectorAll('g[data-layer-name]')
  for (const layer of layers) {
    if ((layer as SVGElement).style.display === 'none') continue
    lines.push(`  % Layer: ${layer.getAttribute('data-layer-name')}`)
    for (const child of layer.children) {
      const line = elementToTikz(child, maxY)
      if (line) {
        for (const l of line.split('\n')) {
          lines.push(`  ${l}`)
        }
      }
    }
  }

  lines.push('\\end{tikzpicture}')
  return lines.join('\n')
}
