// Milestone 06 — combo: ellipse + select + Frame W/H (resize via numeric)
// Target: ellipse cx=105 cy=148 rx=70 ry=35 → bbox (35,113,140,70).
// Sequence: draw small ellipse, select, setFrame to exact bbox. The test
// of scale-via-Frame-input is more honest than dragging a scale handle —
// it's what a precision user actually does.

export const name = '06-scaled-ellipse'
export const target = '06-scaled-ellipse.svg'
export const combo = 'ellipse + select + Frame W/H (scale-via-numeric)'

export async function run(page, h) {
  await page.locator('[data-role="overflow"]').click()
  await page.getByText('Ellipse', { exact: true }).click()
  await page.waitForTimeout(100)
  await h.dragOnCanvas(200, 200, 260, 260)
  await h.clickTool('select')
  await h.clickOnCanvas(230, 230)
  await h.setFrame({ x: 35, y: 113, w: 140, h: 70 })
  const svg = await h.captureExportSvg()
  return { svg }
}
