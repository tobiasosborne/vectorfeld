import { describe, it, expect } from 'vitest'

/**
 * snapLineAngle is a module-level (non-exported) function in lineTool.ts.
 * We duplicate it here for direct unit testing. The implementation must stay
 * in sync with src/tools/lineTool.ts.
 */
function snapLineAngle(
  sx: number,
  sy: number,
  end: { x: number; y: number },
  shift: boolean,
): { x: number; y: number } {
  if (!shift) return end
  const dx = end.x - sx
  const dy = end.y - sy
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len < 0.001) return end
  const angle = Math.atan2(dy, dx)
  const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4)
  return { x: sx + len * Math.cos(snapped), y: sy + len * Math.sin(snapped) }
}

describe('snapLineAngle', () => {
  const SX = 100
  const SY = 100

  it('shift=false returns the original endpoint unchanged', () => {
    const end = { x: 137, y: 259 }
    const result = snapLineAngle(SX, SY, end, false)
    expect(result).toBe(end) // exact same reference
  })

  it('shift=true at 0 degrees (straight right) snaps correctly', () => {
    // End point directly to the right
    const end = { x: SX + 50, y: SY + 2 } // almost 0 degrees
    const result = snapLineAngle(SX, SY, end, true)

    // Should snap to 0 degrees: y stays at SY
    expect(result.y).toBeCloseTo(SY, 5)
    // x should be start + length along 0 degrees
    const len = Math.sqrt(50 * 50 + 2 * 2)
    expect(result.x).toBeCloseTo(SX + len, 5)
  })

  it('shift=true at 45 degrees snaps to diagonal', () => {
    // End point at roughly 45 degrees (up-right in SVG coords: +x, -y)
    // In standard math coords: atan2(-dy, dx). Here we use positive dy for downward.
    // 45 degrees in atan2 is (+x, +y) -- going right and down.
    const end = { x: SX + 48, y: SY + 52 }
    const result = snapLineAngle(SX, SY, end, true)

    // Should snap to 45 degrees (PI/4): dx == dy
    const len = Math.sqrt(48 * 48 + 52 * 52)
    const expected = {
      x: SX + len * Math.cos(Math.PI / 4),
      y: SY + len * Math.sin(Math.PI / 4),
    }
    expect(result.x).toBeCloseTo(expected.x, 5)
    expect(result.y).toBeCloseTo(expected.y, 5)
  })

  it('shift=true at 90 degrees (straight down) snaps correctly', () => {
    // End point directly below start (positive y in SVG)
    const end = { x: SX + 1, y: SY + 60 }
    const result = snapLineAngle(SX, SY, end, true)

    // Should snap to 90 degrees (PI/2): x stays at SX
    expect(result.x).toBeCloseTo(SX, 5)
    const len = Math.sqrt(1 + 60 * 60)
    expect(result.y).toBeCloseTo(SY + len, 5)
  })

  it('shift=true at -90 degrees (straight up) snaps correctly', () => {
    const end = { x: SX - 1, y: SY - 60 }
    const result = snapLineAngle(SX, SY, end, true)

    // Should snap to -90 degrees (-PI/2): x stays at SX
    expect(result.x).toBeCloseTo(SX, 5)
    const len = Math.sqrt(1 + 60 * 60)
    expect(result.y).toBeCloseTo(SY - len, 5)
  })

  it('shift=true at 180 degrees (straight left) snaps correctly', () => {
    const end = { x: SX - 70, y: SY + 2 }
    const result = snapLineAngle(SX, SY, end, true)

    // Should snap to 180 degrees (PI): y stays at SY, x goes left
    expect(result.y).toBeCloseTo(SY, 5)
    const len = Math.sqrt(70 * 70 + 2 * 2)
    expect(result.x).toBeCloseTo(SX - len, 5)
  })

  it('shift=true at arbitrary angle snaps to nearest 45 degree increment', () => {
    // End at approximately 30 degrees -- should snap to either 0 or 45.
    // atan2(17.32, 30) ~ 0.524 rad ~ 30 degrees -> nearest 45-increment is 45 (PI/4 ~ 0.785)
    // Actually nearest to 30 is 45 (distance 15) vs 0 (distance 30) => snaps to 45.
    // Wait: round(0.524 / 0.785) = round(0.667) = 1, so snapped = PI/4.
    const end = { x: SX + 30, y: SY + 17.32 }
    const result = snapLineAngle(SX, SY, end, true)

    const len = Math.sqrt(30 * 30 + 17.32 * 17.32)
    const expected = {
      x: SX + len * Math.cos(Math.PI / 4),
      y: SY + len * Math.sin(Math.PI / 4),
    }
    expect(result.x).toBeCloseTo(expected.x, 3)
    expect(result.y).toBeCloseTo(expected.y, 3)
  })

  it('shift=true at angle near 0 snaps to 0 degrees', () => {
    // End at approximately 10 degrees -- nearest 45 increment is 0.
    // atan2(8.75, 50) ~ 0.174 rad ~ 10 degrees -> round(0.174/0.785) = round(0.222) = 0
    const end = { x: SX + 50, y: SY + 8.75 }
    const result = snapLineAngle(SX, SY, end, true)

    const len = Math.sqrt(50 * 50 + 8.75 * 8.75)
    expect(result.x).toBeCloseTo(SX + len, 5) // cos(0) = 1
    expect(result.y).toBeCloseTo(SY, 5) // sin(0) = 0
  })

  it('zero-length vector (end === start) returns end unchanged', () => {
    const end = { x: SX, y: SY }
    const result = snapLineAngle(SX, SY, end, true)
    // Length < 0.001 so it returns end as-is
    expect(result).toBe(end)
  })

  it('very short vector (< 0.001) returns end unchanged', () => {
    const end = { x: SX + 0.0005, y: SY + 0.0003 }
    const result = snapLineAngle(SX, SY, end, true)
    expect(result).toBe(end) // exact same reference
  })

  it('snaps to 135 degrees (upper-left diagonal)', () => {
    // End at roughly 135 degrees
    const end = { x: SX - 40, y: SY + 42 }
    const result = snapLineAngle(SX, SY, end, true)

    const len = Math.sqrt(40 * 40 + 42 * 42)
    const snappedAngle = (3 * Math.PI) / 4 // 135 degrees
    expect(result.x).toBeCloseTo(SX + len * Math.cos(snappedAngle), 5)
    expect(result.y).toBeCloseTo(SY + len * Math.sin(snappedAngle), 5)
  })

  it('preserves distance from start to end', () => {
    const end = { x: SX + 33, y: SY + 77 }
    const result = snapLineAngle(SX, SY, end, true)

    const originalLen = Math.sqrt(33 * 33 + 77 * 77)
    const resultLen = Math.sqrt(
      (result.x - SX) ** 2 + (result.y - SY) ** 2,
    )
    expect(resultLen).toBeCloseTo(originalLen, 5)
  })
})
