import { openApp, shot, dumpLog } from '../_driver.mjs'

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

// Dump the layer's child elements with tag + bbox + key geometry attrs + selection state.
async function snap() {
  return await page.evaluate(() => {
    const layer = document.querySelector('g[data-layer-name]')
    if (!layer) return { kids: [], selBoxes: 0, inspector: '' }
    const kids = Array.from(layer.children).map((el, i) => {
      let bb = null
      try { const b = el.getBBox(); bb = { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) } } catch {}
      const attrs = {}
      for (const a of ['x', 'y', 'width', 'height', 'transform', 'fill', 'd', 'cx', 'cy']) {
        if (el.hasAttribute(a)) attrs[a] = el.getAttribute(a)
      }
      return { i, tag: el.tagName, id: el.getAttribute('id'), bb, attrs, childCount: el.children.length }
    })
    const insp = document.querySelector('[data-testid="inspector"]')
    return {
      kids,
      selBoxes: document.querySelectorAll('[data-role="selection-box"]').length,
      inspector: insp ? insp.innerText.replace(/\s+/g, ' ').slice(0, 200) : '',
    }
  })
}

function fmt(s) {
  return s.kids.map(k => `[${k.i}]${k.tag}#${k.id||'?'} bb=${k.bb?`${k.bb.x},${k.bb.y} ${k.bb.w}x${k.bb.h}`:'?'} fill=${k.attrs.fill||''} tr=${k.attrs.transform||''} kids=${k.childCount}`).join('\n    ')
}

async function openObjectMenu() {
  await page.getByRole('button', { name: 'Object', exact: true }).click()
  await page.waitForTimeout(120)
}
async function clickMenuItem(name) {
  // Menu items render label + optional shortcut in one button, so match by visible label span text.
  await page.locator('button', { has: page.locator(`span`, { hasText: new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }) }).last().click()
  await page.waitForTimeout(150)
}
async function objectAction(name) {
  await openObjectMenu()
  await clickMenuItem(name)
}

// Select element(s) by index in the layer via programmatic selection helper if exposed,
// else click on canvas. We click on canvas to be realistic. Provide canvas-rel center.
async function clickAt(cx, cy, opts = {}) {
  await page.mouse.click(box.x + cx, box.y + cy, opts)
  await page.waitForTimeout(80)
}

console.log('=== SETUP: create 3 rects at different positions/sizes ===')
await tool('r'); await drag(100, 100, 180, 160)   // rect A small top-left
await tool('r'); await drag(300, 200, 420, 320)   // rect B big middle
await tool('r'); await drag(520, 130, 580, 230)   // rect C tall right
await tool('v')
await shot(page, 'exp-align-zorder-01-three-rects')
let s = await snap()
console.log('AFTER CREATE:\n    ' + fmt(s))

// Helper: select all three via Ctrl+A
async function selectAll() { await tool('v'); await page.keyboard.press('Control+a'); await page.waitForTimeout(120) }

// ---- ALIGN TESTS ----
const alignTests = [
  ['Align Left', 'left'],
  ['Align Right', 'right'],
  ['Align Center Horizontal', 'center-h'],
  ['Align Top', 'top'],
  ['Align Bottom', 'bottom'],
  ['Align Middle', 'center-v'],
]

for (const [label, op] of alignTests) {
  // reset by undo-ing previous align if any, but simplest: re-run from current. We snapshot before/after.
  await selectAll()
  const before = await snap()
  await objectAction(label)
  const after = await snap()
  await shot(page, `exp-align-zorder-align-${op}`)
  // compute expected reference
  const bbs = after.kids.filter(k => k.bb).map(k => k.bb)
  const beforeBbs = before.kids.filter(k => k.bb).map(k => k.bb)
  let report = ''
  if (op === 'left') { const xs = bbs.map(b => b.x); report = `lefts=${xs.join(',')} (should be equal)` }
  if (op === 'right') { const xs = bbs.map(b => b.x + b.w); report = `rights=${xs.join(',')} (should be equal)` }
  if (op === 'center-h') { const xs = bbs.map(b => b.x + b.w/2); report = `centersX=${xs.map(x=>Math.round(x)).join(',')} (should be equal)` }
  if (op === 'top') { const ys = bbs.map(b => b.y); report = `tops=${ys.join(',')} (should be equal)` }
  if (op === 'bottom') { const ys = bbs.map(b => b.y + b.h); report = `bottoms=${ys.join(',')} (should be equal)` }
  if (op === 'center-v') { const ys = bbs.map(b => b.y + b.h/2); report = `centersY=${ys.map(y=>Math.round(y)).join(',')} (should be equal)` }
  console.log(`ALIGN ${op}: ${report}`)
  // undo to restore baseline-ish for next op (only undo the align)
  await page.keyboard.press('Control+z'); await page.waitForTimeout(120)
}

// ---- DISTRIBUTE TESTS ----
console.log('=== DISTRIBUTE: looking for menu items ===')
const objMenuItems = await page.evaluate(async () => {
  return null
})
// Open menu and list all items text
await openObjectMenu()
const menuTexts = await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll('button'))
  return btns.map(b => b.textContent.trim()).filter(t => /distribute/i.test(t))
})
console.log('DISTRIBUTE menu items found:', JSON.stringify(menuTexts))
await page.keyboard.press('Escape')

// ---- Z-ORDER TESTS ----
console.log('=== Z-ORDER on single selection ===')
await selectAll()
// deselect all, select just rect C (rightmost) by clicking it
await clickAt(550, 180)  // click inside rect C
let zs = await snap()
console.log('Z single-sel inspector:', zs.inspector, 'selBoxes:', zs.selBoxes)
const orderBefore = (await snap()).kids.map(k => k.id).join(',')
console.log('DOM order before z-ops:', orderBefore)

// Bring to Front
await objectAction('Bring to Front')
let oa = (await snap()).kids.map(k => k.id).join(',')
console.log('After Bring to Front:', oa)
await shot(page, 'exp-align-zorder-z-front')

// Send to Back
await clickAt(550, 180)
await objectAction('Send to Back')
let ob = (await snap()).kids.map(k => k.id).join(',')
console.log('After Send to Back:', ob)
await shot(page, 'exp-align-zorder-z-back')

// Bring Forward (one step)
await clickAt(550, 180)
await objectAction('Bring Forward')
let of_ = (await snap()).kids.map(k => k.id).join(',')
console.log('After Bring Forward:', of_)

// Z-ORDER on MULTI selection (suspected no-op since sel.length !== 1)
console.log('=== Z-ORDER on MULTI selection (expect no-op per source) ===')
await selectAll()
const multiBefore = (await snap()).kids.map(k => k.id).join(',')
await objectAction('Bring to Front')
const multiAfter = (await snap()).kids.map(k => k.id).join(',')
console.log('Multi Bring to Front before:', multiBefore)
console.log('Multi Bring to Front after :', multiAfter)
console.log('Multi z-order changed?', multiBefore !== multiAfter)

// Z-order keyboard shortcuts
console.log('=== Z-ORDER keyboard shortcuts ===')
await clickAt(550, 180)
const kbBefore = (await snap()).kids.map(k => k.id).join(',')
await page.keyboard.press('Control+BracketLeft')  // send backward
await page.waitForTimeout(120)
const kbAfter = (await snap()).kids.map(k => k.id).join(',')
console.log('Ctrl+[ before:', kbBefore, 'after:', kbAfter, 'changed?', kbBefore !== kbAfter)

// ---- GROUP / NEST / UNGROUP ----
console.log('=== GROUP / NEST / UNGROUP ===')
await selectAll()
let gb = await snap()
console.log('Before group: layerKids ids =', gb.kids.map(k=>k.id).join(','))
await objectAction('Group')
let gA = await snap()
console.log('After group: layerKids =', gA.kids.length, 'ids=', gA.kids.map(k=>`${k.tag}#${k.id}(kids=${k.childCount})`).join(','))
await shot(page, 'exp-align-zorder-grouped')

// Now create another rect, select group + new rect, group again (nest)
await tool('r'); await drag(200, 400, 280, 460)
await tool('v')
await page.keyboard.press('Control+a')
await page.waitForTimeout(120)
let nb = await snap()
console.log('Before nest: layerKids =', nb.kids.map(k=>`${k.tag}#${k.id}(kids=${k.childCount})`).join(','))
await objectAction('Group')
let nA = await snap()
console.log('After nest: layerKids =', nA.kids.length, 'ids=', nA.kids.map(k=>`${k.tag}#${k.id}(kids=${k.childCount})`).join(','))
// inspect nesting depth
const nestDepth = await page.evaluate(() => {
  const layer = document.querySelector('g[data-layer-name]')
  function depth(el) {
    let d = 0, cur = el
    while (cur && cur.tagName === 'g') { d++; cur = cur.querySelector('g') }
    return d
  }
  const groups = Array.from(layer.children).filter(c => c.tagName === 'g')
  return groups.map(g => ({ id: g.getAttribute('id'), innerGroups: g.querySelectorAll('g').length, directKids: g.children.length }))
})
console.log('Nest structure:', JSON.stringify(nestDepth))
await shot(page, 'exp-align-zorder-nested')

// Ungroup the outer group -> should yield inner group + rect back at layer level
await tool('v')
// select the outer group by clicking on it
await clickAt(240, 430)
let ub = await snap()
console.log('Ungroup target inspector:', ub.inspector, 'selBoxes:', ub.selBoxes)
await objectAction('Ungroup')
let uA = await snap()
console.log('After ungroup: layerKids =', uA.kids.length, 'ids=', uA.kids.map(k=>`${k.tag}#${k.id}(kids=${k.childCount})`).join(','))
await shot(page, 'exp-align-zorder-ungrouped')

// ---- GROUP TRANSFORM PRESERVATION ----
// Group two rects, apply a transform to the group (via rotation field if reachable, else set attr), ungroup, check children moved.
console.log('=== GROUP TRANSFORM PRESERVATION ===')
await page.evaluate(() => {
  // reset doc: remove all and add 2 fresh rects
  const layer = document.querySelector('g[data-layer-name]')
  if (!layer) return
})
// Use existing elements. Select all, group, then programmatically add transform to the group, then ungroup via menu.
await tool('v'); await page.keyboard.press('Control+a'); await page.waitForTimeout(100)
await objectAction('Group')
const grpId = await page.evaluate(() => {
  const layer = document.querySelector('g[data-layer-name]')
  const g = Array.from(layer.children).find(c => c.tagName === 'g' && !c.hasAttribute('data-layer-name'))
  return g ? g.getAttribute('id') : null
})
console.log('Group for transform test:', grpId)
// Record child absolute bbox before applying transform + ungroup
const beforeT = await page.evaluate((gid) => {
  const g = document.getElementById(gid)
  if (!g) return null
  // apply translate transform to group
  g.setAttribute('transform', 'translate(150,150)')
  // measure each child's absolute (post-transform) bbox via getBoundingClientRect
  return Array.from(g.children).map(c => {
    const r = c.getBoundingClientRect()
    return { id: c.getAttribute('id'), tag: c.tagName, screenX: Math.round(r.x), screenY: Math.round(r.y) }
  })
}, grpId)
await page.waitForTimeout(120)
await shot(page, 'exp-align-zorder-grp-transformed')
console.log('Children screen pos WITH group transform:', JSON.stringify(beforeT))
// Now ungroup via menu (group should be selected? select it)
await clickAt(0,0) // deselect
await page.evaluate((gid) => {
  // re-select group programmatically by clicking is hard after transform; use selection helper if any
}, grpId)
// click on a child location after transform - the group moved by +150,+150 in svg units (scaled by zoom)
// Instead select the group by clicking where it now is. Just click center of canvas where shapes likely are.
await clickAt(400, 350)
let preU = await snap()
console.log('Pre-ungroup-transform selBoxes:', preU.selBoxes, 'inspector:', preU.inspector)
await objectAction('Ungroup')
const afterT = await page.evaluate(() => {
  const layer = document.querySelector('g[data-layer-name]')
  return Array.from(layer.children).filter(c => c.tagName !== 'g' || !c.hasAttribute('data-layer-name')).map(c => {
    const r = c.getBoundingClientRect()
    return { id: c.getAttribute('id'), tag: c.tagName, screenX: Math.round(r.x), screenY: Math.round(r.y), transform: c.getAttribute('transform') || '' }
  })
})
console.log('Children screen pos AFTER ungroup (transform should be preserved):', JSON.stringify(afterT))
await shot(page, 'exp-align-zorder-grp-ungrouped-transform')
// compare: did children jump back by ~150,150?
if (beforeT) {
  for (const c of afterT) {
    const b = beforeT.find(x => x.id === c.id)
    if (b) {
      const dx = c.screenX - b.screenX, dy = c.screenY - b.screenY
      console.log(`  child ${c.id}: screen drift dx=${dx} dy=${dy} (should be ~0 if transform preserved) transform='${c.transform}'`)
    }
  }
}

dumpLog(log)
await browser.close()
console.log('EXP-ALIGN-ZORDER DONE')
