import { openApp, dumpLog } from '../_driver.mjs'
const { browser, page, log } = await openApp()

const info = await page.evaluate(() => {
  const out = []
  document.querySelectorAll('canvas').forEach(c => {
    const r = c.getBoundingClientRect()
    const cs = getComputedStyle(c)
    out.push({
      cls: c.getAttribute('class'),
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      pointerEvents: cs.pointerEvents, position: cs.position, zIndex: cs.zIndex,
      parent: c.parentElement?.getAttribute('data-testid') || c.parentElement?.className,
    })
  })
  // also locate the svg
  const svg = document.querySelector('[data-testid="canvas-container"] svg') || document.querySelector('svg')
  const sr = svg?.getBoundingClientRect()
  const cont = document.querySelector('[data-testid="canvas-container"]')
  const cr = cont?.getBoundingClientRect()
  return { canvases: out, svg: sr ? { x: Math.round(sr.x), y: Math.round(sr.y), w: Math.round(sr.width), h: Math.round(sr.height) } : null, container: cr ? { x: Math.round(cr.x), y: Math.round(cr.y), w: Math.round(cr.width), h: Math.round(cr.height) } : null }
})
console.log(JSON.stringify(info, null, 2))

// What does canvas-root resolve to?
const rootInfo = await page.evaluate(() => {
  const el = document.querySelector('[data-role="canvas-root"]')
  if (!el) return 'no canvas-root'
  const r = el.getBoundingClientRect()
  return { tag: el.tagName, cls: el.getAttribute('class'), rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }, parent: el.parentElement?.tagName }
})
console.log('canvas-root:', JSON.stringify(rootInfo))

dumpLog(log)
await browser.close()
