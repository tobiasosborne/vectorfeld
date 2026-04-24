// Story 02: Rectangle drawn via rail, no extra styling changes.
//
// Proves that tool-strip → canvas drag → default style produces a stable
// shape. Extra Properties-panel interaction is deferred to a later story
// because the picker is colour-pickered via complex popover UI and we
// want story 02 as a minimal second data point.

export const name = '02-rect'

export async function run(_page, h) {
  await h.clickTool('rect')
  await h.dragOnCanvas(300, 150, 700, 450)
  await h.clickTool('select')

  const svg = await h.captureExportSvg()
  const pdf = await h.captureExportPdf()
  return { svg, pdf }
}
