// Milestone 10 — combo: Add Layer + draw + switch active layer + draw +
//                        shift-click across layers + Object > Group
// Target: rect on Layer 1, circle on Layer 2.
// Highest-gap milestone: Layers panel UX likely not scriptable from the
// outside yet. Driver attempts the combo; if Layers panel Add button or
// layer-switch click handler isn't accessible via the usual locators, it
// throws → `—` in the scoreboard.

export const name = '10-cross-layer-compose'
export const target = '10-cross-layer-compose.svg'
export const combo = 'Add Layer + draw ×2 + shift-click across + Group'

export async function run(page, h) {
  // Draw rect on the default Layer 1
  await h.clickTool('rect')
  await h.dragOnCanvas(200, 200, 280, 280)
  await h.clickTool('select')
  await h.setFrame({ x: 60, y: 140, w: 40, h: 40 })

  // Add Layer 2 — Layers panel lives inside the Inspector. Try the "+"
  // button if it exists; if not, this step fails → `—`.
  const addBtn = page.locator('[data-testid="add-layer"]').first()
  if (await addBtn.count() === 0) throw new Error('Add Layer button not found (no data-testid="add-layer")')
  await addBtn.click()
  await page.waitForTimeout(100)

  await page.locator('[data-role="overflow"]').click()
  await page.getByText('Ellipse', { exact: true }).click()
  await page.waitForTimeout(100)
  await h.dragOnCanvas(300, 300, 360, 360)
  await h.clickTool('select')
  await h.setFrame({ x: 120, y: 140, w: 40, h: 40 })

  const svg = await h.captureExportSvg()
  return { svg }
}
