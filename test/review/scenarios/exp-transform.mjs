import { openApp, shot, dumpLog } from '../_driver.mjs'
import { writeFileSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(here, '..', 'shots')

const { browser, page, log } = await openApp()
const box = await page.locator('[data-role="canvas-root"]').boundingBox()

async function tool(letter) { await page.keyboard.press(letter); await page.waitForTimeout(100) }
async function drag(x1, y1, x2, y2, opts = {}) {
  await page.mouse.move(box.x + x1, box.y + y1)
  await page.mouse.down()
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(box.x + x1 + (x2 - x1) * i / 6, box.y + y1 + (y2 - y1) * i / 6)
    await page.waitForTimeout(12)
  }
  if (opts.shift) await page.keyboard.down('Shift')
  await page.mouse.up()
  if (opts.shift) await page.keyboard.up('Shift')
  await page.waitForTimeout(120)
}
async function click(x, y, opts = {}) {
  if (opts.shift) await page.keyboard.down('Shift')
  await page.mouse.click(box.x + x, box.y + y)
  if (opts.shift) await page.keyboard.up('Shift')
  await page.waitForTimeout(120)
}

// Dump the geometry of all real shapes (skip overlay/guide elements)
async function dumpShapes() {
  return await page.evaluate(() => {
    const layer = document.querySelector('g[data-layer-name]')
    if (!layer) return { err: 'no layer' }
    const out = []
    for (const el of layer.querySelectorAll('rect,ellipse,circle,line,path,text,g,polygon')) {
      const a = {}
      for (const n of ['x','y','width','height','cx','cy','rx','ry','r','transform','d','font-size','x1','y1','x2','y2']) {
        const v = el.getAttribute(n); if (v != null) a[n] = v
      }
      let bbox = null
      try { const b = el.getBBox(); bbox = { x: +b.x.toFixed(2), y: +b.y.toFixed(2), w: +b.width.toFixed(2), h: +b.height.toFixed(2) } } catch {}
      out.push({ tag: el.tagName, attrs: a, bbox })
    }
    return { kids: layer.children.length, shapes: out }
  })
}
async function state() {
  return await page.evaluate(() => ({
    selBoxes: document.querySelectorAll('[data-role="selection-box"]').length,
    scaleHandles: document.querySelectorAll('[data-role="scale-handle"]').length,
    rotHandles: document.querySelectorAll('[data-role="rotation-handle"]').length,
    inspector: (document.querySelector('[data-testid="inspector"]')?.innerText || '').slice(0, 200),
  }))
}

// Read/set inspector numeric inputs by their label text
async function setInspectorField(label, value) {
  return await page.evaluate(({ label, value }) => {
    const insp = document.querySelector('[data-testid="inspector"]')
    if (!insp) return 'no inspector'
    // PropertyInput renders label + input; find label text then sibling input
    const labels = Array.from(insp.querySelectorAll('label, span, div'))
    for (const lab of labels) {
      if (lab.textContent?.trim() === label) {
        // find nearest input within the same row
        let row = lab.parentElement
        for (let i = 0; i < 3 && row; i++) {
          const inp = row.querySelector('input')
          if (inp) {
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
            setter.call(inp, String(value))
            inp.dispatchEvent(new Event('input', { bubbles: true }))
            inp.dispatchEvent(new Event('change', { bubbles: true }))
            inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
            return 'set ' + label + '=' + value
          }
          row = row.parentElement
        }
      }
    }
    return 'label not found: ' + label
  }, { label, value })
}

async function listInspectorFields() {
  return await page.evaluate(() => {
    const insp = document.querySelector('[data-testid="inspector"]')
    if (!insp) return []
    const out = []
    insp.querySelectorAll('input').forEach(inp => {
      // label: look for a preceding text node sibling
      let lbl = ''
      let p = inp.parentElement
      for (let i = 0; i < 3 && p; i++) {
        const t = Array.from(p.childNodes).find(n => n.nodeType === 3 && n.textContent.trim())
        if (t) { lbl = t.textContent.trim(); break }
        // or a label/span child
        const s = p.querySelector('label, span')
        if (s && s.textContent.trim()) { lbl = s.textContent.trim(); break }
        p = p.parentElement
      }
      out.push({ label: lbl, value: inp.value })
    })
    return out
  })
}

const results = {}

// ============ SETUP: draw a rect ============
await tool('r')
await drag(200, 200, 360, 320)
await tool('v')
await click(280, 260)
results.afterDraw = { ...(await state()), shapes: (await dumpShapes()).shapes }
await shot(page, 'exp-transform-01-rect-selected')
console.log('01 selected:', JSON.stringify(await state()))
console.log('01 inspector fields:', JSON.stringify(await listInspectorFields()))

// ============ TEST A: single-shape corner scale ============
// scale handle at SE corner. selection-box drawn around shape; find handle DOM positions
const handlePositions = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('[data-role="scale-handle"]')).map(h => {
    const r = h.getBoundingClientRect()
    return { pos: h.getAttribute('data-handle-pos'), cx: r.x + r.width/2, cy: r.y + r.height/2 }
  })
})
console.log('A handles:', JSON.stringify(handlePositions))
const se = handlePositions.find(h => h.pos === 'se')
const before = (await dumpShapes()).shapes.find(s => s.tag === 'rect')
if (se) {
  await page.mouse.move(se.cx, se.cy)
  await page.mouse.down()
  await page.mouse.move(se.cx + 80, se.cy + 60, { steps: 6 })
  await page.mouse.move(se.cx + 80, se.cy + 60)
  await page.mouse.up()
  await page.waitForTimeout(150)
}
const afterScale = (await dumpShapes()).shapes.find(s => s.tag === 'rect')
results.scaleSingle = { before, afterScale }
await shot(page, 'exp-transform-02-scaled-se')
console.log('A before:', JSON.stringify(before?.attrs), '\nA after:', JSON.stringify(afterScale?.attrs))

// ============ TEST B: rotate via numeric R field ============
await click(300, 280) // reselect (shape moved/grew)
const fieldsB = await listInspectorFields()
console.log('B inspector fields:', JSON.stringify(fieldsB))
// Find a transform/rotation field. PropertiesPanel: R input only for rounded rect 'r' attr.
// Rotation is likely a transform field. Try common labels.
for (const lbl of ['Rotation', 'Rotate', 'Angle', 'R', '∠', 'Rot']) {
  const r = await setInspectorField(lbl, 30)
  console.log('B try set', lbl, '->', r)
  if (!r.startsWith('label not')) break
}
await page.waitForTimeout(150)
const afterRotNum = (await dumpShapes()).shapes.find(s => s.tag === 'rect')
results.rotateNumeric = afterRotNum
await shot(page, 'exp-transform-03-rotated-numeric')
console.log('B after numeric rotate:', JSON.stringify(afterRotNum?.attrs), '\n bbox:', JSON.stringify(afterRotNum?.bbox))

// ============ TEST C: rotate via free-transform tool (Q) on canvas ============
await tool('v'); await click(300, 280)
await tool('q')  // free transform
await page.waitForTimeout(150)
await shot(page, 'exp-transform-04-freetransform-active')
console.log('C state w/ Q:', JSON.stringify(await state()))

// ============ TEST D: rotated-then-scaled correctness ============
// Reset: delete all, draw fresh rect, rotate it 30deg via select-tool rotation handle, then scale.
await tool('v')
await page.keyboard.press('Control+a')
await page.keyboard.press('Delete')
await page.waitForTimeout(150)
await tool('r')
await drag(250, 250, 400, 340)
await tool('v')
await click(325, 295)
await page.waitForTimeout(100)
// rotate via rotation handle on canvas
const rh = await page.evaluate(() => {
  const h = document.querySelector('[data-role="rotation-handle"]')
  if (!h) return null
  const r = h.getBoundingClientRect()
  return { cx: r.x + r.width/2, cy: r.y + r.height/2 }
})
console.log('D rotation handle:', JSON.stringify(rh))
const center = (await dumpShapes()).shapes.find(s => s.tag === 'rect')
if (rh) {
  // rotate ~40 deg by dragging the handle around the center
  const cx = box.x + 325, cy = box.y + 295
  await page.mouse.move(rh.cx, rh.cy)
  await page.mouse.down()
  // move to a point rotated ~40deg from top
  const ang = (-90 + 40) * Math.PI / 180
  const radius = Math.hypot(rh.cx - cx, rh.cy - cy)
  await page.mouse.move(cx + radius * Math.cos(ang), cy + radius * Math.sin(ang), { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(150)
}
const afterCanvasRot = (await dumpShapes()).shapes.find(s => s.tag === 'rect')
results.rotateCanvas = { hadHandle: !!rh, before: center, after: afterCanvasRot }
await shot(page, 'exp-transform-05-rotated-canvas')
console.log('D after canvas rotate:', JSON.stringify(afterCanvasRot?.attrs))

// Now scale the rotated rect via SE handle and capture bbox before/after
await click(325, 295)
const rotHandles = await page.evaluate(() => Array.from(document.querySelectorAll('[data-role="scale-handle"]')).map(h => {
  const r = h.getBoundingClientRect(); return { pos: h.getAttribute('data-handle-pos'), cx: r.x+r.width/2, cy: r.y+r.height/2 }
}))
const se2 = rotHandles.find(h => h.pos === 'se')
const beforeScaleRot = (await dumpShapes()).shapes.find(s => s.tag === 'rect')
if (se2) {
  await page.mouse.move(se2.cx, se2.cy)
  await page.mouse.down()
  await page.mouse.move(se2.cx + 70, se2.cy + 50, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(150)
}
const afterScaleRot = (await dumpShapes()).shapes.find(s => s.tag === 'rect')
results.scaleRotated = { beforeScaleRot, afterScaleRot }
await shot(page, 'exp-transform-06-rotated-then-scaled')
console.log('D scale-rotated before:', JSON.stringify(beforeScaleRot?.attrs))
console.log('D scale-rotated after :', JSON.stringify(afterScaleRot?.attrs))

// ============ TEST E: multi-select scale + move ============
await tool('v')
await page.keyboard.press('Control+a'); await page.keyboard.press('Delete')
await page.waitForTimeout(120)
await tool('r'); await drag(150, 150, 230, 230)
await tool('r'); await drag(320, 150, 400, 230)
await tool('r'); await drag(150, 320, 230, 400)
await tool('v')
await click(190, 190)
await click(360, 190, { shift: true })
await click(190, 360, { shift: true })
await page.waitForTimeout(120)
const multiSel = await state()
console.log('E multi-select:', JSON.stringify(multiSel))
const multiBefore = (await dumpShapes()).shapes.filter(s => s.tag === 'rect')
await shot(page, 'exp-transform-07-multi-selected')
// scale group via SE handle
const mHandles = await page.evaluate(() => Array.from(document.querySelectorAll('[data-role="scale-handle"]')).map(h => {
  const r = h.getBoundingClientRect(); return { pos: h.getAttribute('data-handle-pos'), cx: r.x+r.width/2, cy: r.y+r.height/2 }
}))
const mse = mHandles.find(h => h.pos === 'se')
if (mse) {
  await page.mouse.move(mse.cx, mse.cy)
  await page.mouse.down()
  await page.mouse.move(mse.cx + 90, mse.cy + 90, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(150)
}
const multiAfter = (await dumpShapes()).shapes.filter(s => s.tag === 'rect')
results.multiScale = { selCount: multiSel.selBoxes, before: multiBefore.map(s=>s.bbox), after: multiAfter.map(s=>s.bbox) }
await shot(page, 'exp-transform-08-multi-scaled')
console.log('E multi before bboxes:', JSON.stringify(multiBefore.map(s=>s.bbox)))
console.log('E multi after  bboxes:', JSON.stringify(multiAfter.map(s=>s.bbox)))

// ============ TEST F: skew via SkX / SkY inspector ============
await tool('v')
await page.keyboard.press('Control+a'); await page.keyboard.press('Delete')
await page.waitForTimeout(120)
await tool('r'); await drag(250, 220, 400, 330)
await tool('v'); await click(325, 275)
await page.waitForTimeout(120)
const beforeSkew = (await dumpShapes()).shapes.find(s => s.tag === 'rect')
const skxRes = await setInspectorField('SkX', 25)
console.log('F set SkX:', skxRes)
await page.waitForTimeout(150)
const afterSkewX = (await dumpShapes()).shapes.find(s => s.tag === 'rect')
await shot(page, 'exp-transform-09-skewX')
const skyRes = await setInspectorField('SkY', 15)
console.log('F set SkY:', skyRes)
await page.waitForTimeout(150)
const afterSkewY = (await dumpShapes()).shapes.find(s => s.tag === 'rect')
results.skew = { before: beforeSkew?.attrs, afterX: afterSkewX?.attrs, afterY: afterSkewY?.attrs }
await shot(page, 'exp-transform-10-skewXY')
console.log('F skew before:', JSON.stringify(beforeSkew?.attrs))
console.log('F skew afterX:', JSON.stringify(afterSkewX?.attrs))
console.log('F skew afterY:', JSON.stringify(afterSkewY?.attrs))

console.log('\n===== RESULTS DUMP =====')
console.log(JSON.stringify(results, null, 2))

dumpLog(log)
await browser.close()
console.log('EXP-TRANSFORM DONE')
