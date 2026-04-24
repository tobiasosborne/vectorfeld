// Milestone 08 — combo: pen polygon + copy/paste + Object > Flip H + Frame X
// Target: left triangle at (40,100), (70,60), (80,110); mirror on right at
// (170,100), (140,60), (130,110). mm y stays ≤ 110 so the clicks land
// inside the visible canvas area (the canvas extends past the 900px viewport
// vertically; mm y > ~150 is below the StatusBar).
//
// Sequence: pen → 3 exact-mm clicks + close-click at first anchor → select
// → Ctrl+C → Ctrl+V → Object > Flip Horizontal → Frame X pins the mirror.

export const name = '08-mirrored-pair'
export const target = '08-mirrored-pair.svg'
export const combo = 'pen polygon + copy/paste + Object > Flip H + Frame X'

export async function run(page, h) {
  await h.clickTool('pen')
  await h.clickAtMm(40, 100)
  await h.clickAtMm(70, 60)
  await h.clickAtMm(80, 110)
  await h.clickAtMm(40, 100) // close
  await h.press('Escape').catch(() => {})
  await h.clickTool('select')

  await page.keyboard.press('Control+a')
  await page.waitForTimeout(50)
  await page.keyboard.press('Control+c')
  await page.waitForTimeout(50)
  await page.keyboard.press('Control+v')
  await page.waitForTimeout(100)

  await page.getByRole('button', { name: 'Object', exact: true }).click()
  await page.getByText('Flip Horizontal', { exact: true }).click()
  await page.waitForTimeout(100)

  // Pin the mirror's bbox to target position (130, 60, 40, 50). setFrame
  // on a path uses translate-style X/Y only; W/H handlers skip path, so
  // the shape stays, position is pinned.
  await h.setFrame({ x: 130, y: 60 })

  const svg = await h.captureExportSvg()
  return { svg }
}
