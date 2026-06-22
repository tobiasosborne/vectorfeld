import { openApp, shot, dumpLog } from '../_driver.mjs'

const { browser, page, log } = await openApp()

async function canvasOrigin() {
  const bb = await page.locator('[data-role="canvas-root"]').boundingBox()
  return bb
}

// Helper: click+drag at canvas-relative coords to pull a bezier handle
async function penClickDrag(bb, x, y, dx, dy, mods = []) {
  await page.mouse.move(bb.x + x, bb.y + y)
  await page.mouse.down()
  await page.mouse.move(bb.x + x + dx, bb.y + y + dy, { steps: 8 })
  await page.mouse.up()
}

async function dragWithMods(bb, x, y, dx, dy, mods = []) {
  await page.mouse.move(bb.x + x, bb.y + y)
  await page.mouse.down()
  for (const m of mods) await page.keyboard.down(m)
  await page.mouse.move(bb.x + x + dx, bb.y + y + dy, { steps: 8 })
  await page.mouse.up()
  for (const m of mods) await page.keyboard.up(m)
}

function getPaths() {
  return page.evaluate(() => {
    const paths = [...document.querySelectorAll('g[data-layer-name] path, g[data-layer-id] path')]
      .filter(p => p.getAttribute('data-role') !== 'preview')
    return paths.map(p => p.getAttribute('d'))
  })
}

// ---- Step 1: select pen tool ----
await page.keyboard.press('p')
const bb = await canvasOrigin()
console.log('canvas bb', JSON.stringify(bb))
await shot(page, 'exp-pen-bezier-01-pen-active')

// ---- Step 2: draw an S-curve. Three anchors, each with handle drag ----
// Anchor A: click at (300,300), drag handle right-down to pull a curve
await penClickDrag(bb, 300, 300, 60, -40)
await shot(page, 'exp-pen-bezier-02-anchor1-handle')

// Anchor B (middle): click at (450,350), drag handle to create S inflection
await penClickDrag(bb, 450, 350, 60, 40)
await shot(page, 'exp-pen-bezier-03-anchor2-handle')

// Anchor C: click at (600,300), drag opposite direction (S-curve)
await penClickDrag(bb, 600, 300, 60, -40)
await shot(page, 'exp-pen-bezier-04-anchor3-handle')

// Preview path d at this point
const previewD = await page.evaluate(() =>
  document.querySelector('path[data-role="preview"]')?.getAttribute('d'))
console.log('PREVIEW D (S-curve attempt):', previewD)

// ---- Step 3: try ALT-drag for asymmetric handle on a 4th anchor ----
await dragWithMods(bb, 700, 350, 50, 50, ['Alt'])
await shot(page, 'exp-pen-bezier-05-altdrag-anchor')
const previewD2 = await page.evaluate(() =>
  document.querySelector('path[data-role="preview"]')?.getAttribute('d'))
console.log('PREVIEW D after alt-drag:', previewD2)

// ---- Step 4: finish path with Enter ----
await page.keyboard.press('Enter')
await shot(page, 'exp-pen-bezier-06-finished-open')
let paths = await getPaths()
console.log('PATHS after open finish:', JSON.stringify(paths))

// ---- Step 5: draw a CLOSED path ----
await page.keyboard.press('p')
await penClickDrag(bb, 300, 550, 40, -30)   // A
await penClickDrag(bb, 450, 600, 40, 30)    // B
await penClickDrag(bb, 600, 550, 40, -30)   // C
// close: click back near first anchor
await page.mouse.move(bb.x + 300, bb.y + 550)
await page.mouse.down(); await page.mouse.up()
await shot(page, 'exp-pen-bezier-07-closed-path')
paths = await getPaths()
console.log('PATHS after closed attempt:', JSON.stringify(paths))

// ---- Step 6: Direct select — move a node & a handle ----
await page.keyboard.press('a')
// click on the first finished path to show anchors
const firstPathBox = await page.evaluate(() => {
  const p = [...document.querySelectorAll('g[data-layer-name] path, g[data-layer-id] path')]
    .filter(x => x.getAttribute('data-role') !== 'preview')[0]
  if (!p) return null
  const b = p.getBoundingClientRect()
  return { x: b.x, y: b.y, w: b.width, h: b.height }
})
console.log('first path bbox', JSON.stringify(firstPathBox))
// click on the path stroke to select it (click at a point on the curve)
await page.mouse.click(bb.x + 450, bb.y + 350)
await shot(page, 'exp-pen-bezier-08-ds-selected')
let dsState = await page.evaluate(() => ({
  anchors: document.querySelectorAll('[data-role="direct-select-anchor"]').length,
  handles: document.querySelectorAll('[data-role="direct-select-handle"]').length,
}))
console.log('DS state after path click:', JSON.stringify(dsState))

// click an anchor to reveal its handles
const anchorPos = await page.evaluate(() => {
  const a = document.querySelector('[data-role="direct-select-anchor"]')
  if (!a) return null
  const b = a.getBoundingClientRect()
  return { x: b.x + b.width/2, y: b.y + b.height/2 }
})
console.log('first anchor pos', JSON.stringify(anchorPos))
if (anchorPos) {
  await page.mouse.click(anchorPos.x, anchorPos.y)
  await shot(page, 'exp-pen-bezier-09-anchor-selected')
}
dsState = await page.evaluate(() => ({
  anchors: document.querySelectorAll('[data-role="direct-select-anchor"]').length,
  handles: document.querySelectorAll('[data-role="direct-select-handle"]').length,
}))
console.log('DS state after anchor click:', JSON.stringify(dsState))

// Drag a control handle to make it asymmetric
const handlePos = await page.evaluate(() => {
  const h = document.querySelector('[data-role="direct-select-handle"]')
  if (!h) return null
  const b = h.getBoundingClientRect()
  return { x: b.x + b.width/2, y: b.y + b.height/2 }
})
console.log('handle pos', JSON.stringify(handlePos))
if (handlePos) {
  await page.mouse.move(handlePos.x, handlePos.y)
  await page.mouse.down()
  await page.mouse.move(handlePos.x + 60, handlePos.y - 40, { steps: 8 })
  await page.mouse.up()
  await shot(page, 'exp-pen-bezier-10-handle-dragged')
}
paths = await getPaths()
console.log('PATHS after handle drag:', JSON.stringify(paths))

// ---- Step 7: Export SVG to inspect d-string for C/S commands ----
const dlPromise = page.waitForEvent('download').catch(() => null)
await page.getByRole('button', { name: 'File', exact: true }).click()
await page.getByText('Export SVG', { exact: true }).click()
const dl = await dlPromise
if (dl) {
  const out = '/tmp/exp-pen-bezier-export.svg'
  await dl.saveAs(out)
  const fs = await import('node:fs')
  const svg = fs.readFileSync(out, 'utf8')
  const dMatches = [...svg.matchAll(/d="([^"]*)"/g)].map(m => m[1])
  console.log('EXPORTED SVG path d-strings:')
  dMatches.forEach((d, i) => console.log(`  [${i}] ${d}`))
  console.log('Has S/s smooth command anywhere?', /[Ss]\s*[-\d]/.test(svg))
} else {
  console.log('No download captured for Export SVG')
}

dumpLog(log)
await browser.close()
