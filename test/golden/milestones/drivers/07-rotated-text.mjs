// Milestone 07 — combo: text + commit + select + Frame R=30
// Target: "HELLO" at (80,150), 16pt sans-serif, rotated 30° around (80,150).

export const name = '07-rotated-text'
export const target = '07-rotated-text.svg'
export const combo = 'text + commit + select + Frame R'

export async function run(_page, h) {
  await h.clickTool('text')
  await h.clickOnCanvas(350, 300)
  await h.typeText('HELLO')
  await h.press('Escape')
  await h.clickTool('select')
  // Text just-created should still be selected; if not, click near it.
  await h.setFrame({ x: 80, y: 150, r: 30 })
  const svg = await h.captureExportSvg()
  return { svg }
}
