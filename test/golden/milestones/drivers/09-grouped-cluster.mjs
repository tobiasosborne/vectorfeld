// Milestone 09 — combo: shape ×3 + Ctrl+A + Object > Group + drag
// Target: rect + circle + rect inside a <g transform="translate(50 40)">.
// Sequence: draw three shapes in relative positions (relative to origin),
// Ctrl+A, Object > Group, then drag the group. Surfaces whether Group
// emits a wrapping <g transform=...> or flattens into children.

export const name = '09-grouped-cluster'
export const target = '09-grouped-cluster.svg'
export const combo = 'shape ×3 + Ctrl+A + Object > Group + drag'

export async function run(page, h) {
  // Draw first rect at (0,0) w=30 h=30 — using Frame for precision
  await h.clickTool('rect')
  await h.dragOnCanvas(200, 200, 260, 260)
  await h.clickTool('select')
  await h.setFrame({ x: 0, y: 0, w: 30, h: 30 })
  // Circle at (50,15) r=15 → bbox (35,0,30,30)
  await page.locator('[data-role="overflow"]').click()
  await page.getByText('Ellipse', { exact: true }).click()
  await page.waitForTimeout(100)
  await h.dragOnCanvas(300, 200, 360, 260)
  await h.clickTool('select')
  await h.clickOnCanvas(330, 230)
  await h.setFrame({ x: 35, y: 0, w: 30, h: 30 })
  // Second rect at (80,0) w=30 h=30
  await h.clickTool('rect')
  await h.dragOnCanvas(400, 200, 460, 260)
  await h.clickTool('select')
  await h.setFrame({ x: 80, y: 0, w: 30, h: 30 })

  await page.keyboard.press('Control+A')
  await page.waitForTimeout(50)
  // Group via Ctrl+G — no menu item exists (gap filed as vectorfeld-gna).
  await page.keyboard.press('Control+g')
  await page.waitForTimeout(100)

  // Move the group 50 right, 40 down via setFrame (translate 50,40)
  await h.setFrame({ x: 50, y: 40 })
  const svg = await h.captureExportSvg()
  return { svg }
}
