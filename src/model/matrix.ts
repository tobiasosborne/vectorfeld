/**
 * 2D affine matrix math for SVG transforms.
 * Matrix is [a, b, c, d, e, f] representing:
 *   | a c e |
 *   | b d f |
 *   | 0 0 1 |
 */

export type Matrix = [number, number, number, number, number, number]

export function identityMatrix(): Matrix {
  return [1, 0, 0, 1, 0, 0]
}

export function translateMatrix(tx: number, ty: number): Matrix {
  return [1, 0, 0, 1, tx, ty]
}

export function scaleMatrix(sx: number, sy: number): Matrix {
  return [sx, 0, 0, sy, 0, 0]
}

export function rotateMatrix(angleDeg: number, cx = 0, cy = 0): Matrix {
  const rad = (angleDeg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  if (cx === 0 && cy === 0) {
    return [cos, sin, -sin, cos, 0, 0]
  }
  // rotate(a, cx, cy) = translate(cx,cy) * rotate(a) * translate(-cx,-cy)
  return [
    cos, sin, -sin, cos,
    cx - cos * cx + sin * cy,
    cy - sin * cx - cos * cy,
  ]
}

export function skewXMatrix(angleDeg: number): Matrix {
  return [1, 0, Math.tan((angleDeg * Math.PI) / 180), 1, 0, 0]
}

export function skewYMatrix(angleDeg: number): Matrix {
  return [1, Math.tan((angleDeg * Math.PI) / 180), 0, 1, 0, 0]
}

/** Multiply two matrices: result = A * B */
export function multiplyMatrix(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ]
}

/** Apply matrix to a point */
export function applyMatrixToPoint(m: Matrix, x: number, y: number): { x: number; y: number } {
  return {
    x: m[0] * x + m[2] * y + m[4],
    y: m[1] * x + m[3] * y + m[5],
  }
}

/**
 * Decompose a 2D affine matrix into translate, rotate, scale, and skew.
 * Uses QR decomposition approach.
 */
export function decomposeMatrix(m: Matrix): {
  translateX: number
  translateY: number
  rotate: number  // degrees
  scaleX: number
  scaleY: number
  skewX: number   // degrees
} {
  const [a, b, c, d, e, f] = m
  const translateX = e
  const translateY = f

  // Compute rotation and scale via polar decomposition
  const scaleX = Math.sqrt(a * a + b * b)
  const scaleY = Math.sqrt(c * c + d * d)

  // Sign correction
  const det = a * d - b * c
  const signX = det < 0 ? -1 : 1

  const rotate = Math.atan2(b, a) * (180 / Math.PI)

  // Skew: angle between the two column vectors minus 90 degrees
  const skewX = Math.atan2(a * c + b * d, a * d - b * c) * (180 / Math.PI)

  return {
    translateX,
    translateY,
    rotate,
    scaleX: scaleX * signX,
    scaleY,
    skewX,
  }
}

/**
 * Parse skewX/skewY values from an SVG transform string.
 * Returns { skewX: number, skewY: number } in degrees.
 */
export function parseSkew(transform: string): { skewX: number; skewY: number } {
  let skewX = 0
  let skewY = 0
  const xMatch = transform.match(/skewX\(([-\d.]+)\)/)
  const yMatch = transform.match(/skewY\(([-\d.]+)\)/)
  if (xMatch) skewX = parseFloat(xMatch[1])
  if (yMatch) skewY = parseFloat(yMatch[1])
  return { skewX, skewY }
}

/**
 * Update or add skewX/skewY in an SVG transform string.
 * Preserves other transforms (translate, rotate, scale, etc.)
 */
export function setSkew(transform: string, skewX: number, skewY: number): string {
  // Remove existing skew functions
  let result = transform
    .replace(/\s*skewX\([^)]*\)/g, '')
    .replace(/\s*skewY\([^)]*\)/g, '')
    .trim()

  // Append new skew if non-zero
  if (skewX !== 0) result += ` skewX(${skewX})`
  if (skewY !== 0) result += ` skewY(${skewY})`

  return result.trim()
}

/**
 * Parse an SVG transform attribute string into a combined matrix.
 * Handles: translate, scale, rotate, skewX, skewY, matrix.
 * Multiple transforms are composed left-to-right per SVG spec.
 */
export function parseTransform(str: string): Matrix {
  let result = identityMatrix()
  // Match individual transform functions
  const re = /(translate|scale|rotate|skewX|skewY|matrix)\s*\(([^)]+)\)/g
  let match: RegExpExecArray | null
  while ((match = re.exec(str)) !== null) {
    const fn = match[1]
    const args = match[2].split(/[\s,]+/).map(Number)
    let m: Matrix
    switch (fn) {
      case 'translate':
        m = translateMatrix(args[0], args[1] ?? 0)
        break
      case 'scale':
        m = scaleMatrix(args[0], args[1] ?? args[0])
        break
      case 'rotate':
        m = rotateMatrix(args[0], args[1] ?? 0, args[2] ?? 0)
        break
      case 'skewX':
        m = skewXMatrix(args[0])
        break
      case 'skewY':
        m = skewYMatrix(args[0])
        break
      case 'matrix':
        m = [args[0], args[1], args[2], args[3], args[4], args[5]]
        break
      default:
        continue
    }
    result = multiplyMatrix(result, m)
  }
  return result
}
