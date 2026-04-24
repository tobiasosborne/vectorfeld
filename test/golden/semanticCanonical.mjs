// Semantic SVG canonicalization — for the milestone suite.
//
// The gate suite (canonicalize.mjs) compares app output to itself, so byte
// equality after stripping IDs / rounding coords / sorting attrs is enough.
//
// Milestones compare app output to EXTERNAL target SVGs that were authored
// with different idioms than the app emits. Two visually-identical SVGs can
// differ in serialization — `<rect>` vs `<path d>`, `rgb(255,0,0)` vs `red`
// vs `#ff0000`, `transform="translate(10,20) rotate(30)"` vs `matrix(...)`.
//
// semanticCanonical applies pre-passes that equate these forms, then runs
// the same normalization as canonicalize.mjs.
//
// Pre-passes:
//   1. Shape → path  (rect/circle/ellipse/line/polyline/polygon → <path d>)
//   2. Color names + rgb() → #rrggbb lowercase hex
//   3. Strip app-only chrome (artboard-group, layer-name wrappers) so a
//      hand-authored target SVG without those doesn't need to include them
//
// Not implemented (yet): transform flattening to matrix(). Deferred until
// a milestone actually fails on it.

import { JSDOM } from '/home/tobias/Projects/vectorfeld/node_modules/jsdom/lib/api.js'
import { canonicalizeSvg } from './canonicalize.mjs'

const SVG_NS = 'http://www.w3.org/2000/svg'

// ---- 1. Shape to path ----

function rectToPathD(x, y, w, h, rx = 0, ry = 0) {
  rx = Math.min(rx, w / 2)
  ry = Math.min(ry || rx, h / 2)
  if (!rx && !ry) {
    return `M${x},${y} L${x + w},${y} L${x + w},${y + h} L${x},${y + h} Z`
  }
  return [
    `M${x + rx},${y}`,
    `L${x + w - rx},${y}`,
    `A${rx},${ry} 0 0 1 ${x + w},${y + ry}`,
    `L${x + w},${y + h - ry}`,
    `A${rx},${ry} 0 0 1 ${x + w - rx},${y + h}`,
    `L${x + rx},${y + h}`,
    `A${rx},${ry} 0 0 1 ${x},${y + h - ry}`,
    `L${x},${y + ry}`,
    `A${rx},${ry} 0 0 1 ${x + rx},${y}`,
    'Z',
  ].join(' ')
}

function circleToPathD(cx, cy, r) {
  return `M${cx - r},${cy} A${r},${r} 0 0 1 ${cx + r},${cy} A${r},${r} 0 0 1 ${cx - r},${cy} Z`
}

function ellipseToPathD(cx, cy, rx, ry) {
  return `M${cx - rx},${cy} A${rx},${ry} 0 0 1 ${cx + rx},${cy} A${rx},${ry} 0 0 1 ${cx - rx},${cy} Z`
}

function lineToPathD(x1, y1, x2, y2) {
  return `M${x1},${y1} L${x2},${y2}`
}

function pointsToPathD(points, close) {
  const pts = points.trim().split(/[\s,]+/).map(Number)
  if (pts.length < 4) return ''
  const parts = [`M${pts[0]},${pts[1]}`]
  for (let i = 2; i < pts.length; i += 2) parts.push(`L${pts[i]},${pts[i + 1]}`)
  if (close) parts.push('Z')
  return parts.join(' ')
}

function num(el, name, dflt = 0) {
  const v = el.getAttribute(name)
  if (v == null || v === '') return dflt
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : dflt
}

function shapeToPath(el) {
  const tag = el.tagName.toLowerCase()
  let d = null
  switch (tag) {
    case 'rect': {
      d = rectToPathD(num(el, 'x'), num(el, 'y'), num(el, 'width'), num(el, 'height'), num(el, 'rx'), num(el, 'ry'))
      break
    }
    case 'circle': {
      d = circleToPathD(num(el, 'cx'), num(el, 'cy'), num(el, 'r'))
      break
    }
    case 'ellipse': {
      d = ellipseToPathD(num(el, 'cx'), num(el, 'cy'), num(el, 'rx'), num(el, 'ry'))
      break
    }
    case 'line': {
      d = lineToPathD(num(el, 'x1'), num(el, 'y1'), num(el, 'x2'), num(el, 'y2'))
      break
    }
    case 'polyline':
    case 'polygon': {
      d = pointsToPathD(el.getAttribute('points') || '', tag === 'polygon')
      break
    }
    default:
      return
  }
  const doc = el.ownerDocument
  const path = doc.createElementNS(SVG_NS, 'path')
  // Copy over presentation/transform/style attributes, skipping shape-specific geometry.
  const GEOM_ATTRS = new Set([
    'x', 'y', 'width', 'height', 'rx', 'ry',
    'cx', 'cy', 'r',
    'x1', 'y1', 'x2', 'y2',
    'points',
  ])
  for (const attr of Array.from(el.attributes)) {
    if (GEOM_ATTRS.has(attr.name)) continue
    path.setAttribute(attr.name, attr.value)
  }
  path.setAttribute('d', d)
  el.replaceWith(path)
}

function shapesToPath(root) {
  // Collect first — replaceWith mutates the tree.
  const shapes = Array.from(root.querySelectorAll('rect, circle, ellipse, line, polyline, polygon'))
  for (const s of shapes) shapeToPath(s)
}

// ---- 2. Color normalization ----

const NAMED_COLORS = {
  'black': '#000000', 'white': '#ffffff',
  'red': '#ff0000', 'green': '#008000', 'blue': '#0000ff',
  'yellow': '#ffff00', 'cyan': '#00ffff', 'magenta': '#ff00ff',
  'gray': '#808080', 'grey': '#808080',
  'orange': '#ffa500', 'purple': '#800080',
  'none': 'none', 'transparent': 'transparent', 'currentcolor': 'currentcolor',
}

function normalizeColorValue(v) {
  if (!v) return v
  const s = String(v).trim().toLowerCase()
  if (NAMED_COLORS[s] !== undefined) return NAMED_COLORS[s]
  // #abc → #aabbcc
  const m3 = s.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/)
  if (m3) return `#${m3[1]}${m3[1]}${m3[2]}${m3[2]}${m3[3]}${m3[3]}`
  // #rrggbb already — force lowercase
  const m6 = s.match(/^#([0-9a-f]{6})$/)
  if (m6) return `#${m6[1]}`
  // rgb(r,g,b) / rgb(r g b)
  const rgbM = s.match(/^rgb\s*\(\s*(\d+)\s*[,\s]\s*(\d+)\s*[,\s]\s*(\d+)\s*\)$/)
  if (rgbM) {
    const h = (n) => Math.max(0, Math.min(255, parseInt(n, 10))).toString(16).padStart(2, '0')
    return `#${h(rgbM[1])}${h(rgbM[2])}${h(rgbM[3])}`
  }
  return v // url(#…), unrecognized — leave as-is
}

const COLOR_ATTRS = ['fill', 'stroke', 'stop-color', 'flood-color', 'lighting-color']

function normalizeColors(root) {
  const walker = root.ownerDocument.createTreeWalker(root, 1 /* SHOW_ELEMENT */)
  let n = walker.currentNode
  while (n) {
    const el = /** @type {Element} */ (n)
    for (const attr of COLOR_ATTRS) {
      if (el.hasAttribute(attr)) el.setAttribute(attr, normalizeColorValue(el.getAttribute(attr)))
    }
    // Also peek into style="fill: red; stroke: #abc"
    const style = el.getAttribute('style')
    if (style) {
      const normalized = style.replace(
        /(fill|stroke|stop-color|flood-color|lighting-color)\s*:\s*([^;]+)/gi,
        (_, prop, val) => `${prop.toLowerCase()}: ${normalizeColorValue(val.trim())}`,
      )
      el.setAttribute('style', normalized)
    }
    n = walker.nextNode()
  }
}

// ---- 3. Strip app-only chrome ----
//
// The app wraps user content in artboard + layer groups with data-* attrs
// that are app-internal. Hand-authored fixtures don't have these. To let
// milestones compare like with like, we unwrap: any <g data-role="artboard-group">
// is removed (children promoted), any <rect data-role="artboard"> is removed
// entirely (it's the white background), any <g data-layer-name=…> is
// unwrapped preserving children.

function stripAppChrome(root) {
  // Remove artboard rects and their wrapping group
  for (const rect of Array.from(root.querySelectorAll('[data-role="artboard"]'))) {
    rect.remove()
  }
  for (const g of Array.from(root.querySelectorAll('g[data-role="artboard-group"]'))) {
    // Promote remaining children into g's parent (usually empty now, but be safe)
    const parent = g.parentNode
    while (g.firstChild) parent.insertBefore(g.firstChild, g)
    g.remove()
  }
  // Unwrap named layer groups — keep children
  for (const g of Array.from(root.querySelectorAll('g[data-layer-name]'))) {
    const parent = g.parentNode
    while (g.firstChild) parent.insertBefore(g.firstChild, g)
    g.remove()
  }
  // Strip <defs> if it's empty (app emits empty defs)
  for (const defs of Array.from(root.querySelectorAll('defs'))) {
    if (defs.children.length === 0) defs.remove()
  }
  // Strip SVG-root presentation attrs — width/height/style are rendering
  // hints for the canvas surface (the app sets 100% + display:block), not
  // authoring data. Normalize viewBox away too; milestone fixtures are
  // about element-level coord correctness, not viewport setup (which the
  // gate suite already covers).
  if (root.tagName === 'svg' || root.localName === 'svg') {
    for (const attr of ['width', 'height', 'style', 'viewBox']) {
      root.removeAttribute(attr)
    }
    // Also remove data-* attrs added to root (e.g., data-artboard-id)
    for (const a of Array.from(root.attributes)) {
      if (a.name.startsWith('data-')) root.removeAttribute(a.name)
    }
  }
}

// ---- entry point ----

export function semanticCanonicalSvg(svgString) {
  const dom = new JSDOM(svgString, { contentType: 'image/svg+xml' })
  const root = dom.window.document.documentElement
  stripAppChrome(root)
  shapesToPath(root)
  normalizeColors(root)
  // Re-serialize and run the basic canonical pass (id strip, 2dp round,
  // attr sort). canonicalizeSvg handles xmlns/xlink properly.
  const intermediate = dom.window.document.documentElement.outerHTML
  return canonicalizeSvg(intermediate)
}
