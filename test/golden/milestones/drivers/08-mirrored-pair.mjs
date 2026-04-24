// Milestone 08 — combo: polygon (via pen tool) + copy + flip + move
// Target: triangle on left, horizontal-mirror on right.
// Sequence: pen → 3 clicks + close → select → Ctrl+C / Ctrl+V → Object >
// Flip Horizontal → setFrame to place copy on right side.
// Very likely gap: pen-tool closed-shape UX + Flip Horizontal menu item.

export const name = '08-mirrored-pair'
export const target = '08-mirrored-pair.svg'
export const combo = 'pen polygon + copy/paste + Object > Flip H + Frame X'

export async function run(page, h) {
  await h.clickTool('pen')
  // Three clicks form the triangle corners; close by clicking the first.
  await h.clickOnCanvas(150, 300)
  await h.clickOnCanvas(250, 200)
  await h.clickOnCanvas(280, 330)
  await h.clickOnCanvas(150, 300) // close
  await h.press('Escape')
  await h.clickTool('select')
  await h.clickOnCanvas(200, 280)
  await page.keyboard.press('Control+C')
  await page.waitForTimeout(50)
  await page.keyboard.press('Control+V')
  await page.waitForTimeout(100)

  await page.getByRole('button', { name: 'Object', exact: true }).click()
  await page.getByText(/Flip Horizontal/i).first().click()
  await page.waitForTimeout(100)

  const svg = await h.captureExportSvg()
  return { svg }
}
