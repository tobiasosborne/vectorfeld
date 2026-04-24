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

  // Select blue (middle one). After drawing green, green is selected.
  // Click on blue's visible area. Blue is at (80,125) w=50 h=50 → canvas
  // offset depends on viewport-to-mm ratio, but 1mm ≈ 3.78px so blue's
  // top-left in canvas-relative px would be roughly (80*3.78, 125*3.78)
  // offset by artboard origin. This is fragile — the milestone will likely
  // drift or fail here, which surfaces the selection-click usability gap.
  await h.clickOnCanvas(350, 400) // blue's rough center — adjust if gap surfaces

  await page.getByRole('button', { name: 'Object', exact: true }).click()
  await page.getByText(/Bring to Front/i).first().click()
  await page.waitForTimeout(100)

  const svg = await h.captureExportSvg()
  return { svg }
}
