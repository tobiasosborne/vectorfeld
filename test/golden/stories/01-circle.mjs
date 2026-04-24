// Story 01: Draw a single circle via the Ellipse tool and export.
//
// Simplest possible flow — proves the harness round-trip end to end:
// tool pick → canvas drag → export SVG + PDF → bytes match masters.

export const name = '01-circle'

export async function run(_page, h) {
  // Ellipse isn't on the 9-slot rail; it lives in the overflow menu.
  await h.page.locator('[data-role="overflow"]').click()
  await h.page.getByText('Ellipse', { exact: true }).click()
  // Drag a circular-ish ellipse in the canvas centre area.
  await h.dragOnCanvas(400, 200, 600, 400)
  await h.clickTool('select') // deselect visual affordance for cleaner export

  const svg = await h.captureExportSvg()
  const pdf = await h.captureExportPdf()
  return { svg, pdf }
}
