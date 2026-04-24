// Milestone 04 — combo: rect ×3 + drag-select + Object > Align
// Target: three 30-wide rects of differing heights, vertically centered on
// one horizontal axis.
// Sequence: draw three rects at exact positions via Frame, then use drag
// selection to pick all three, then invoke Align Middle from the Object
// menu. Probable gap: align menu items may not exist yet.

export const name = '04-three-aligned'
export const target = '04-three-aligned.svg'
export const combo = 'rect ×3 + drag-select + Object > Align Middle'

export async function run(page, h) {
  // Draw three rects at mixed Y, unique heights
  async function drawAt(x, y, w, hh) {
    await h.clickTool('rect')
    await h.dragOnCanvas(300 + x * 0.5, 300 + y * 0.5, 400, 400)
    await h.clickTool('select')
    // Click approximately where we last drew — more reliable: Ctrl+A after each
    // draw is messy; instead hit Enter on Frame inputs in place.
    // The just-drawn rect is auto-selected by rectTool, so Frame is live.
    await h.setFrame({ x, y, w, h: hh })
  }
  await drawAt(30, 100, 30, 40)
  await drawAt(90, 150, 30, 20)
  await drawAt(150, 120, 30, 30)

  // Select all three with Ctrl+A
  await page.keyboard.press('Control+A')
  await page.waitForTimeout(50)

  // Invoke Object > Align Middle (vertical) — label will surface the gap
  await page.getByRole('button', { name: 'Object', exact: true }).click()
  // Try a reasonable label. If it doesn't exist, Playwright throws → `—`.
  await page.getByText(/Align.*(Middle|Vertical Center|Center.*Vert)/i).first().click()
  await page.waitForTimeout(200)

  const svg = await h.captureExportSvg()
  return { svg }
}
