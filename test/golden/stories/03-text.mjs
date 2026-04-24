// Story 03: Place text via the Text tool.
//
// Proves text-tool flow: click-to-place, type, commit via Escape.
// Font-metrics and glyph positioning feed into the PDF export, so this
// is the first story where font embedding matters.

export const name = '03-text'

export async function run(_page, h) {
  await h.clickTool('text')
  await h.clickOnCanvas(350, 300)
  await h.typeText('hello world')
  // Commit the text by pressing Escape (text tool exits edit mode on Esc)
  await h.press('Escape')
  await h.clickTool('select')

  const svg = await h.captureExportSvg()
  const pdf = await h.captureExportPdf()
  return { svg, pdf }
}
