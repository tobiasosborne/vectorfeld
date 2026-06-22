import { openApp, shot, dumpLog, FIXTURES } from '../_driver.mjs'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(here, '..', 'out')
import { mkdirSync } from 'node:fs'
mkdirSync(OUT, { recursive: true })

const { browser, page, log } = await openApp()
const box = await page.locator('[data-role="canvas-root"]').boundingBox()

async function tool(letter) { await page.keyboard.press(letter); await page.waitForTimeout(80) }
async function drag(x1, y1, x2, y2) {
  await page.mouse.move(box.x + x1, box.y + y1)
  await page.mouse.down()
  for (let i = 1; i <= 5; i++) {
    await page.mouse.move(box.x + x1 + (x2 - x1) * i / 5, box.y + y1 + (y2 - y1) * i / 5)
    await page.waitForTimeout(10)
  }
  await page.mouse.up()
  await page.waitForTimeout(80)
}

// Full DOM snapshot of the live SVG: viewBox, artboard rects, layer kids.
async function snapDoc() {
  return await page.evaluate(() => {
    const svg = document.querySelector('[data-role="canvas-root"] svg') || document.querySelector('svg')
    const vb = svg ? svg.getAttribute('viewBox') : null
    const artboards = Array.from(document.querySelectorAll('[data-role="artboard"]')).map(r => ({
      id: r.getAttribute('data-artboard-id'),
      x: r.getAttribute('x'), y: r.getAttribute('y'),
      w: r.getAttribute('width'), h: r.getAttribute('height'),
    }))
    const layer = document.querySelector('g[data-layer-name]')
    const kids = layer ? Array.from(layer.children).map((el, i) => {
      const attrs = {}
      for (const a of ['x','y','width','height','cx','cy','rx','ry','transform','fill','stroke','d','points','href','font-size','font-family']) {
        if (el.hasAttribute(a)) attrs[a] = el.getAttribute(a)
      }
      let txt = el.tagName === 'text' ? el.textContent : undefined
      return { i, tag: el.tagName, id: el.getAttribute('id'), attrs, kids: el.children.length, txt }
    }) : []
    const insp = document.querySelector('[data-testid="inspector"]')
    return {
      viewBox: vb,
      artboards,
      layerCount: document.querySelectorAll('g[data-layer-name]').length,
      kids,
      selBoxes: document.querySelectorAll('[data-role="selection-box"]').length,
      inspector: insp ? insp.innerText.replace(/\s+/g,' ').slice(0,160) : '',
    }
  })
}
function fmt(s) {
  return `vb=[${s.viewBox}] artboards=${JSON.stringify(s.artboards)} layers=${s.layerCount} kids=${s.kids.length}\n` +
    s.kids.map(k => `    [${k.i}]${k.tag}#${k.id||'?'} ${JSON.stringify(k.attrs)}${k.txt!==undefined?` txt="${k.txt}"`:''} subkids=${k.kids}`).join('\n')
}

async function fileMenuItem(name) {
  await page.getByRole('button', { name: 'File', exact: true }).click()
  await page.waitForTimeout(150)
  await page.locator('button', { has: page.locator('span', { hasText: new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')) }) }).last().click()
  await page.waitForTimeout(200)
}

console.log('=== STEP 1: Draw mixed content (rect, ellipse via?, text, pen path) ===')
await tool('r'); await drag(120, 120, 260, 220)         // rect
await tool('v')
// give rect a distinctive fill via inspector if possible later; first add text
await tool('t')
await page.mouse.click(box.x + 150, box.y + 320)
await page.waitForTimeout(150)
await page.keyboard.type('RoundTrip!')
await page.waitForTimeout(150)
await tool('v')
// pen path
await tool('p')
await page.mouse.click(box.x + 350, box.y + 150)
await page.mouse.click(box.x + 450, box.y + 250)
await page.mouse.click(box.x + 400, box.y + 350)
await page.keyboard.press('Enter')
await page.waitForTimeout(120)
await tool('v')
await page.mouse.click(box.x + 10, box.y + 10) // deselect
await page.waitForTimeout(100)

const s1 = await snapDoc()
console.log('AFTER DRAW:\n' + fmt(s1))
await shot(page, 'exp-save-open-01-drawn')

console.log('\n=== STEP 2: Export SVG and capture the bytes ===')
let svgBytes = null
{
  const dl = page.waitForEvent('download')
  await fileMenuItem('Export SVG')
  const d = await dl
  const p = resolve(OUT, 'exp-save-open-export.svg')
  await d.saveAs(p)
  svgBytes = readFileSync(p, 'utf8')
  console.log('SVG exported, length=', svgBytes.length)
  console.log('SVG head:', svgBytes.slice(0, 400).replace(/\n/g,' '))
}

// Analyze exported SVG content programmatically (node-side, no browser).
function countTags(svg, tag) { return (svg.match(new RegExp('<' + tag + '[\\s>]', 'g')) || []).length }
console.log('Exported tags: rect=', countTags(svgBytes,'rect'),
  'text=', countTags(svgBytes,'text'), 'path=', countTags(svgBytes,'path'),
  'g=', countTags(svgBytes,'g'), 'ellipse=', countTags(svgBytes,'ellipse'))
const idsInExport = [...svgBytes.matchAll(/id="([^"]+)"/g)].map(m=>m[1])
console.log('IDs in export:', JSON.stringify(idsInExport))
const hasArtboardRole = /data-role="artboard"/.test(svgBytes)
const hasOverlay = /data-role="(overlay|grid-overlay|guides-overlay|user-guides-overlay)"/.test(svgBytes)
console.log('Export contains artboard role?', hasArtboardRole, ' overlay leaked?', hasOverlay)

console.log('\n=== STEP 3: Open the exported SVG back (round-trip) ===')
{
  const fc = page.waitForEvent('filechooser')
  await fileMenuItem('Open SVG')
  const c = await fc
  await c.setFiles(resolve(OUT, 'exp-save-open-export.svg'))
  await page.waitForTimeout(600)
}
const s3 = await snapDoc()
console.log('AFTER RE-IMPORT:\n' + fmt(s3))
await shot(page, 'exp-save-open-02-reimported')

// Compare round-trip fidelity
console.log('\n--- ROUND-TRIP DIFF ---')
console.log('viewBox before:', s1.viewBox, ' after:', s3.viewBox, ' same?', s1.viewBox === s3.viewBox)
console.log('kids count before:', s1.kids.length, ' after:', s3.kids.length)
const idsBefore = s1.kids.map(k=>k.id).join(',')
const idsAfter = s3.kids.map(k=>k.id).join(',')
console.log('ids before:', idsBefore)
console.log('ids after :', idsAfter)
console.log('ids stable?', idsBefore === idsAfter)
// per-kind compare
for (let i=0;i<Math.max(s1.kids.length,s3.kids.length);i++){
  const a=s1.kids[i], b=s3.kids[i]
  if(!a||!b){console.log(`  kid[${i}] MISMATCH presence a=${!!a} b=${!!b}`);continue}
  const aa=JSON.stringify(a.attrs), bb=JSON.stringify(b.attrs)
  console.log(`  kid[${i}] ${a.tag}->${b.tag} attrsEqual=${aa===bb} txtEqual=${a.txt===b.txt}`)
  if(aa!==bb){console.log(`     A=${aa}\n     B=${bb}`)}
}

console.log('\n=== STEP 4: Export PNG and inspect ===')
{
  const dl = page.waitForEvent('download', { timeout: 8000 }).catch(()=>null)
  await fileMenuItem('Export PNG')
  const d = await dl
  if (d) {
    const p = resolve(OUT, 'exp-save-open-export.png')
    await d.saveAs(p)
    const st = readFileSync(p)
    console.log('PNG exported bytes=', st.length)
    // copy into shots dir so we can Read it as an image
    writeFileSync(resolve(here,'..','shots','exp-save-open-03-png.png'), st)
  } else {
    console.log('!!! PNG export produced NO download within 8s')
  }
}

console.log('\n=== STEP 5: Document Setup — change page size ===')
const before5 = await snapDoc()
console.log('BEFORE artboard change: viewBox=', before5.viewBox, 'artboards=', JSON.stringify(before5.artboards), 'kids=', before5.kids.length)
await fileMenuItem('Document Setup')
await page.waitForTimeout(200)
const dialogVisible = await page.locator('[data-testid="artboard-dialog"]').isVisible().catch(()=>false)
console.log('Artboard dialog visible?', dialogVisible)
await shot(page, 'exp-save-open-04-artboard-dialog')
if (dialogVisible) {
  // pick A3 preset then apply
  await page.getByRole('button', { name: 'A3', exact: true }).click()
  await page.waitForTimeout(120)
  const wVal = await page.locator('[data-testid="artboard-width"]').inputValue()
  const hVal = await page.locator('[data-testid="artboard-height"]').inputValue()
  console.log('Dialog after A3 preset: width=', wVal, 'height=', hVal)
  await page.locator('[data-testid="artboard-apply"]').click()
  await page.waitForTimeout(400)
}
const after5 = await snapDoc()
console.log('AFTER artboard change: viewBox=', after5.viewBox, 'artboards=', JSON.stringify(after5.artboards), 'kids=', after5.kids.length)
await shot(page, 'exp-save-open-05-after-resize')
console.log('viewBox changed?', before5.viewBox !== after5.viewBox)
console.log('artboard rect changed?', JSON.stringify(before5.artboards) !== JSON.stringify(after5.artboards))
console.log('content preserved (kid count)?', before5.kids.length === after5.kids.length)

// Read ruler text to see if it updated
const rulerInfo = await page.evaluate(() => {
  const h = document.querySelector('[data-role="page-nav"]') // fallback
  const texts = Array.from(document.querySelectorAll('svg text')).map(t=>t.textContent).filter(Boolean)
  return { svgTextSample: texts.slice(0,20) }
})
console.log('ruler/text sample:', JSON.stringify(rulerInfo.svgTextSample))

console.log('\n=== STEP 6: Export SVG AFTER resize, check viewBox matches new size ===')
{
  const dl = page.waitForEvent('download')
  await fileMenuItem('Export SVG')
  const d = await dl
  const p = resolve(OUT, 'exp-save-open-after-resize.svg')
  await d.saveAs(p)
  const svg2 = readFileSync(p, 'utf8')
  const vbMatch = svg2.match(/viewBox="([^"]+)"/)
  const abMatch = svg2.match(/data-role="artboard"[^>]*width="([^"]+)"[^>]*height="([^"]+)"/)
  console.log('Post-resize export viewBox:', vbMatch ? vbMatch[1] : 'NONE')
  console.log('Post-resize export artboard rect w/h:', abMatch ? `${abMatch[1]}x${abMatch[2]}` : 'NONE')
}

dumpLog(log)
await browser.close()
console.log('EXP-SAVE-OPEN DONE')
