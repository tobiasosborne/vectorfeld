// Story 08: Three shapes, drag-select all, Ctrl+C / Ctrl+V, nudge.
//
// Validates the four interlocking commands at the heart of basic editing:
//   - drag-select picks every shape under the rubber band,
//   - clipboard copy snapshots the selected nodes,
//   - paste lands a translated copy AND keeps it selected,
//   - arrow-key nudge applies a 1mm translate to that selection.
// Bug history: this story would have caught vectorfeld-cj3 (focus
// trap on Frame inputs swallowing Ctrl+C) by failing before the helper
// blur landed.

export const name = '08-select-copy-paste-nudge'

async function pickEllipse(h) {
  await h.page.locator('[data-role="overflow"]').click()
  await h.page.getByText('Ellipse', { exact: true }).click()
  await h.page.waitForTimeout(100)
}

export async function run(_page, h) {
  // Lay down three shapes in a horizontal strip.
  await h.clickTool('rect')
  await h.dragOnCanvas(220, 200, 320, 320)

  await pickEllipse(h)
  await h.dragOnCanvas(360, 220, 460, 320)

  await h.clickTool('rect')
  await h.dragOnCanvas(500, 220, 600, 320)

  // Drag-select rubber band across all three.
  await h.clickTool('select')
  await h.dragOnCanvas(180, 160, 640, 360)

  // Paste duplicates the selection with a default offset, then nudge
  // the new copy down. The nudge step is deliberately small (3 × 1mm)
  // so the cumulative translate doesn't push the copy off-canvas.
  await h.press('Control+c')
  await h.press('Control+v')
  await h.press('ArrowDown')
  await h.press('ArrowDown')
  await h.press('ArrowDown')

  const svg = await h.captureExportSvg()
  const pdf = await h.captureExportPdf()
  return { svg, pdf }
}
