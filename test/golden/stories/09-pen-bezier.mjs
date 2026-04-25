// Story 09: Pen tool — 4-point closed path with one smooth (handle) anchor.
//
// Validates bezier authoring end-to-end:
//   - pen-tool clicks add corner anchors,
//   - drag from an anchor seeds symmetric outgoing/incoming handles
//     (the "smooth" point),
//   - clicking the first anchor again closes the subpath.
// All coordinates are in document mm so the geometry is independent of
// canvas zoom / pixel ratio. Several deferred pen bugs (vectorfeld-t7u,
// 9hu, 87e) live in this code path; this gate locks behaviour the moment
// they're fixed.

export const name = '09-pen-bezier'

async function dragAtMm(page, from, to) {
  const screen = await page.evaluate(({ from, to }) => {
    const svg = document.querySelector('svg')
    const ctm = svg.getScreenCTM()
    if (!ctm) return null
    const a = svg.createSVGPoint(); a.x = from.x; a.y = from.y
    const b = svg.createSVGPoint(); b.x = to.x; b.y = to.y
    const sa = a.matrixTransform(ctm)
    const sb = b.matrixTransform(ctm)
    return { from: { x: sa.x, y: sa.y }, to: { x: sb.x, y: sb.y } }
  }, { from, to })
  if (!screen) throw new Error('mm→screen conversion failed')
  await page.mouse.move(screen.from.x, screen.from.y)
  await page.mouse.down()
  await page.waitForTimeout(50)
  for (let i = 1; i <= 5; i++) {
    const t = i / 5
    await page.mouse.move(
      screen.from.x + (screen.to.x - screen.from.x) * t,
      screen.from.y + (screen.to.y - screen.from.y) * t,
    )
    await page.waitForTimeout(10)
  }
  await page.mouse.up()
  await page.waitForTimeout(100)
}

export async function run(page, h) {
  await h.clickTool('pen')

  // Square-ish 4-anchor path:
  //   A1 (50, 80)  — corner
  //   A2 (110, 80) — corner
  //   A3 (110, 140) — SMOOTH (drag from anchor to seed handles)
  //   A4 (50, 140) — corner
  // Then close by clicking A1 again.
  await h.clickAtMm(50, 80)
  await h.clickAtMm(110, 80)
  await dragAtMm(page, { x: 110, y: 140 }, { x: 130, y: 150 })
  await h.clickAtMm(50, 140)
  await h.clickAtMm(50, 80) // close

  await h.clickTool('select') // exit pen, drop preview chrome

  const svg = await h.captureExportSvg()
  const pdf = await h.captureExportPdf()
  return { svg, pdf }
}
