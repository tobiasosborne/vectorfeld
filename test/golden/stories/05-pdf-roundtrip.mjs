// Story 05: Import a real PDF, don't edit, export SVG + PDF.
//
// The load-bearing proof for the pivot: opening a PDF and saving again
// must produce a stable output. The source PDF is the noheader flyer in
// test/dogfood/fixtures/; treat it as immutable input.
//
// This is the story that has historically exposed the worst bugs
// (transform-on-leaf, tspan positioning, path double-Y-flip). A green
// golden here gates the entire round-trip promise.

import { existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const FIXTURE = resolve(here, '..', '..', 'dogfood', 'fixtures', 'Flyer Swift Vortragscoaching 15.04.2026 noheader.pdf')

export const name = '05-pdf-roundtrip'

export async function run(page, h) {
  if (!existsSync(FIXTURE)) {
    throw new Error(`fixture missing: ${FIXTURE}`)
  }
  // File > Open PDF
  const fcPromise = page.waitForEvent('filechooser')
  await h.openFileMenu()
  await page.getByText('Open PDF...', { exact: true }).click()
  const fc = await fcPromise
  await fc.setFiles(FIXTURE)
  // Wait for the imported layer to populate
  await page.waitForFunction(
    () => {
      const layers = document.querySelectorAll('g[data-layer-name]')
      return layers.length >= 1 && (layers[0]?.children.length || 0) > 20
    },
    { timeout: 30000 },
  )
  await h.clickTool('select')

  const svg = await h.captureExportSvg()
  const pdf = await h.captureExportPdf()
  return { svg, pdf }
}
