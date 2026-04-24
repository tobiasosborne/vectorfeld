// Milestone 02 — combo: ellipse + select + Frame + Properties fill picker
// Target: filled green circle at cx=105, cy=148, r=30.
// Sequence: overflow → ellipse → drag → select → set Frame (which for an
// ellipse means x/y/w/h of its bbox: 75,118,60,60) → open fill picker in
// the Properties panel and pick green #2e7d32.

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
  // Fill change: the FillStrokeWidget lives on the LeftRail bottom. Open it
  // and try to pick green. This path likely has UX gaps — that's the point.
  // We do our best; if it throws the milestone is reported as `—`.
  throw new Error('fill-picker automation not yet written')
}
