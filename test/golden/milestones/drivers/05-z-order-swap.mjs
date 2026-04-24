// Milestone 05 — combo: rect ×3 overlapping + select middle + Arrange
// Target DOM order: red, green, blue (blue on top visually).
// To exercise Arrange, we DRAW in order [red, blue, green] (so green is
// topmost naturally), then select BLUE (the middle one now) and Bring to
// Front. End DOM order: red, green, blue. Matches target.

export const name = '05-z-order-swap'
export const target = '05-z-order-swap.svg'
export const combo = 'rect ×3 + select middle + Object > Bring to Front'

export async function run(page, h) {
  async function drawRectFill(x, y, w, hh, _fill) {
    // Draw any rect, then position via Frame. Fill via Properties is a
    // known gap (see milestone 02); leaving default fill will drift but
    // the z-order logic itself is what's being tested here — the scoreboard
    // will flag "drift" (vs "gap") correctly.
    await h.clickTool('rect')
    await h.dragOnCanvas(300, 300, 400, 380)
    await h.clickTool('select')
    await h.setFrame({ x, y, w, h: hh })
  }
  // Order: red, blue, green (blue ends up middle)
  await drawRectFill(60, 110, 50, 50, 'red')
  await drawRectFill(80, 125, 50, 50, 'blue')
  await drawRectFill(100, 140, 50, 50, 'green')

  // Select blue (the middle DOM child of the layer). Use an evaluate to
  // dispatch a mousedown/mouseup at blue's on-screen center — canvas-to-mm
  // px ratio depends on zoom and viewport, so asking the DOM for its
  // actual bounding box is more robust than pixel math.
  const blueCenter = await page.evaluate(() => {
    const layerChildren = Array.from(document.querySelectorAll('g[data-layer-name] > rect'))
    const blue = layerChildren[1] // middle rect in insertion order
    if (!blue) return null
    const b = blue.getBoundingClientRect()
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 }
  })
  if (!blueCenter) throw new Error('blue rect not found')
  // Clear current selection, then click blue.
  await h.clickOnCanvas(5, 5)
  await page.waitForTimeout(50)
  await page.mouse.move(blueCenter.x, blueCenter.y)
  await page.mouse.down()
  await page.waitForTimeout(30)
  await page.mouse.up()
  await page.waitForTimeout(100)

  await page.getByRole('button', { name: 'Object', exact: true }).click()
  await page.getByText(/Bring to Front/i).first().click()
  await page.waitForTimeout(100)

  const svg = await h.captureExportSvg()
  return { svg }
}
