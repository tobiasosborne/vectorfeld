// Story 07: Open foreground PDF, then a second PDF as background layer.
//
// The load-bearing pivot story for compositing: a typical casual-edit
// workflow stacks two PDFs (e.g. a content sheet over a branded
// template) and exports. Replaces temp/composite-via-playwright.mjs.
//
// Both fixtures live in test/dogfood/fixtures/. The expected post-import
// state is two layers, with the background appended below the
// foreground in z-order (background-layer mode adds at the bottom).

import { existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const FIXTURES = resolve(here, '..', '..', 'dogfood', 'fixtures')
const FOREGROUND = resolve(FIXTURES, 'Flyer Swift Vortragscoaching 15.04.2026 noheader.pdf')
const BACKGROUND = resolve(FIXTURES, 'Flyer Swift Vortragscoaching yellow BG bluer Border.pdf')

export const name = '07-composite'

async function importPdf(page, h, menuItem, filePath, expectedLayerCount) {
  const fcPromise = page.waitForEvent('filechooser')
  await h.openFileMenu()
  await page.getByText(menuItem, { exact: true }).click()
  const fc = await fcPromise
  await fc.setFiles(filePath)
  await page.waitForFunction(
    (expected) => {
      const layers = document.querySelectorAll('g[data-layer-name]')
      if (layers.length !== expected) return false
      return Array.from(layers).every((l) => l.children.length > 0)
    },
    expectedLayerCount,
    { timeout: 30000 },
  )
}

export async function run(page, h) {
  if (!existsSync(FOREGROUND) || !existsSync(BACKGROUND)) {
    throw new Error(`fixtures missing in ${FIXTURES}`)
  }
  await importPdf(page, h, 'Open PDF...', FOREGROUND, 1)
  await importPdf(page, h, 'Open PDF as Background Layer...', BACKGROUND, 2)
  await h.clickTool('select')

  const svg = await h.captureExportSvg()
  const pdf = await h.captureExportPdf()
  return { svg, pdf }
}
