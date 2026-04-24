// Milestone 02 — combo: ellipse + select + Frame + Properties fill picker
// Target: green #2e7d32 circle at cx=105, cy=148, r=30 (bbox 75,118,60,60).
// Sequence: overflow → ellipse → drag → select → Frame to exact bbox →
// open Properties panel fill picker → type hex → commit.

export const name = '02-filled-circle'
export const target = '02-filled-circle.svg'
export const combo = 'ellipse + select + Frame + Properties fill'

export async function run(page, h) {
  await page.locator('[data-role="overflow"]').click()
  await page.getByText('Ellipse', { exact: true }).click()
  await page.waitForTimeout(100)
  await h.dragOnCanvas(200, 200, 300, 300)
  await h.clickTool('select')
  await h.clickOnCanvas(250, 250)
  await h.setFrame({ x: 75, y: 118, w: 60, h: 60 })
  await h.setFill('#2e7d32')
  const svg = await h.captureExportSvg()
  return { svg }
}
