// Milestone 01 — combo: rect + select + Frame X/Y/W/H/R
// Target: a 60×40 rect at (80,120) rotated 45° around its center.
// Sequence: draw rough rect → switch to select → click rect → type exact
// Frame values (including R=45).

export const name = '01-rotated-rect'
export const target = '01-rotated-rect.svg'
export const combo = 'rect + select + Frame X/Y/W/H/R'

export async function run(_page, h) {
  await h.clickTool('rect')
  // Rough draw anywhere — Frame input pins exact values afterward.
  await h.dragOnCanvas(200, 200, 400, 300)
  await h.clickTool('select')
  // Click the rect we just made to ensure it's selected.
  await h.clickOnCanvas(300, 250)
  await h.setFrame({ x: 80, y: 120, w: 60, h: 40, r: 45 })
  const svg = await h.captureExportSvg()
  return { svg }
}
