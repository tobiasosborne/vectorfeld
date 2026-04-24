// Story 04: Three shapes drawn sequentially (rect, ellipse, rect).
//
// Proves multi-element state — each add emits a command, z-order stays
// insertion-order, and the serialized document captures all three in the
// correct stacking order.

export const name = '04-three-shapes'

async function pickEllipse(h) {
  await h.page.locator('[data-role="overflow"]').click()
  await h.page.getByText('Ellipse', { exact: true }).click()
  // Overflow menu closes on pick; give React a tick
  await h.page.waitForTimeout(100)
}

export async function run(_page, h) {
  await h.clickTool('rect')
  await h.dragOnCanvas(200, 150, 340, 260)

  await pickEllipse(h)
  await h.dragOnCanvas(400, 200, 560, 360)

  await h.clickTool('rect')
  await h.dragOnCanvas(620, 280, 780, 420)

  await h.clickTool('select')

  const svg = await h.captureExportSvg()
  const pdf = await h.captureExportPdf()
  return { svg, pdf }
}
