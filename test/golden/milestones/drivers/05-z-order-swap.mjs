// Milestone 05 — combo: rect ×3 overlapping + select middle + Arrange
// Target DOM order: red, green, blue (blue on top visually).
// To exercise Arrange, we DRAW in order [red, blue, green] (so green is
// topmost naturally), then select BLUE (the middle one now) and Bring to
// Front. End DOM order: red, green, blue. Matches target.

export const name = '05-z-order-swap'
export const target = '05-z-order-swap.svg'
export const combo = 'rect ×3 + select middle + Object > Bring to Front'

export async function run(page, h) {
  async function drawRectFill(x, y, w, hh, fill) {
    await h.clickTool('rect')
    await h.dragOnCanvas(300, 300, 400, 380)
    await h.clickTool('select')
    await h.setFrame({ x, y, w, h: hh })
    await h.setFill(fill)
  }
  // Order: red, blue, green (blue ends up middle). Target fills are
  // #c62828 (red), #1565c0 (blue), #2e7d32 (green) — see fixture.
  await drawRectFill(60, 110, 50, 50, '#c62828')
  await drawRectFill(80, 125, 50, 50, '#1565c0')
  await drawRectFill(100, 140, 50, 50, '#2e7d32')

  // Select blue (the middle DOM child of the layer). Click at a point that
  // is inside blue ONLY — red/green don't cover the bottom-left corner of
  // blue, so an offset within blue's box avoids the overlap ambiguity.
  // (20%, 90%) of blue's on-screen bbox → inside blue, outside the two others.
  // Pick a point that's inside blue but outside red and green. Blue is
  // at mm (80, 125) to (130, 175); red at (60, 110)-(110, 160) (above blue);
  // green at (100, 140)-(150, 190) (right of blue). A point at mm (90, 170)
  // → blue only. Express as offset within blue's bounding rect: x=20%, y=90%.
  // BUT blue extends past the 900px-high viewport, so the 90% y is off-canvas.
  // Use y=30% (mm ~140) paired with x=10% (mm ~85) — left edge of blue,
  // upper middle — above green (which starts at x=100) and below red's
  // bottom of 160 not quite but blue is still topmost there since hitTest
  // walks top-to-bottom in DOM order: green, blue, red. x=85 misses green.
  // Red covers (60, 110)-(110, 160) so (85, 140) is ALSO in red — but blue
  // is on top of red in DOM order so hitTest returns blue.
  const bluePoint = await page.evaluate(() => {
    const layerChildren = Array.from(document.querySelectorAll('g[data-layer-name] > rect'))
    const blue = layerChildren[1]
    if (!blue) return null
    const b = blue.getBoundingClientRect()
    return { x: b.left + b.width * 0.1, y: b.top + b.height * 0.3 }
  })
  if (!bluePoint) throw new Error('blue rect not found')
  await page.mouse.click(bluePoint.x, bluePoint.y)
  await page.waitForTimeout(100)

  await page.getByRole('button', { name: 'Object', exact: true }).click()
  await page.getByText(/Bring to Front/i).first().click()
  await page.waitForTimeout(100)

  const svg = await h.captureExportSvg()
  return { svg }
}
