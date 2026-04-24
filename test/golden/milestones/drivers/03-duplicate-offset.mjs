// Milestone 03 — combo: rect + select + Ctrl+C/V + Frame X offset
// Target: two 40×30 rects at (40,120) and (90,120).
// Sequence: draw rect, set exact Frame, select-and-copy-paste, move pasted
// copy to its target X. Exercises clipboard round-trip.

export const name = '03-duplicate-offset'
export const target = '03-duplicate-offset.svg'
export const combo = 'rect + select + copy/paste + Frame X'

export async function run(page, h) {
  await h.clickTool('rect')
  await h.dragOnCanvas(200, 200, 300, 260)
  await h.clickTool('select')
  await h.clickOnCanvas(250, 230)
  await h.setFrame({ x: 40, y: 120, w: 40, h: 30 })
  // Copy + paste — pasteClipboard normally offsets by a small amount.
  await page.keyboard.press('Control+C')
  await page.waitForTimeout(50)
  await page.keyboard.press('Control+V')
  await page.waitForTimeout(100)
  // Pasted copy should now be selected; set its X to 90.
  await h.setFrame({ x: 90, y: 120 })
  const svg = await h.captureExportSvg()
  return { svg }
}
