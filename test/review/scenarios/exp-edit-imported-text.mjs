// vectorfeld-3yu.2 — headed acceptance for IN-PLACE editing of IMPORTED PDF
// text. Imports the REAL flyer (doubly-transformed text: run-wrapper scale ∘
// MuPDF y-flip matrix), double-clicks a real on-screen run, retypes a word via
// the native <textarea> overlay, commits, and asserts the canvas <text>
// content changed and a selection box still tracks it.
//
// Run:  (dev server on :5173)  xvfb-run -a node test/review/scenarios/exp-edit-imported-text.mjs
import { openApp, shot, dumpLog, FIXTURES } from '../_driver.mjs'
import { resolve } from 'node:path'

const FG = resolve(FIXTURES, 'Flyer Swift Vortragscoaching 15.04.2026 noheader.pdf')
const NEW_WORD = 'Klarheit'

const { browser, page, log } = await openApp()

let failures = 0
function check(name, cond, extra = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${name}${extra ? ' :: ' + extra : ''}`)
  if (!cond) failures++
}

async function openPdf(menuItem, file) {
  const fc = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'File', exact: true }).click()
  await page.getByRole('button', { name: menuItem, exact: true }).last().click()
  const chooser = await fc
  await chooser.setFiles(file)
  await page.waitForFunction(() => {
    const ls = document.querySelectorAll('g[data-layer-name]')
    return ls.length >= 1 && Array.from(ls).some((l) => l.children.length > 0)
  }, { timeout: 40000 }).catch(() => {})
  await page.waitForTimeout(1000)
}

await openPdf('Open PDF...', FG)
await shot(page, 'exp-edit-imported-text-00-imported')

// Pick the widest fully-on-screen source text run (easiest, doubly-transformed
// hit target). Keep a live handle — the run is mutated IN PLACE, so identity
// survives the edit and we can re-read its content afterwards.
const targetHandle = await page.evaluateHandle(() => {
  const vw = window.innerWidth, vh = window.innerHeight
  const texts = Array.from(document.querySelectorAll('g[data-layer-name] text'))
  const onscreen = texts
    .map((t) => ({ t, r: t.getBoundingClientRect() }))
    .filter(({ t, r }) => (t.textContent || '').trim().length >= 3
      && r.width > 8 && r.height > 6
      && r.left >= 0 && r.top >= 0 && r.right <= vw && r.bottom <= vh)
  onscreen.sort((a, b) => b.r.width - a.r.width)
  return onscreen.length ? onscreen[0].t : null
})

const meta = await targetHandle.evaluate((el) => {
  if (!el) return null
  const r = el.getBoundingClientRect()
  return {
    text: el.textContent || '',
    cx: r.x + r.width / 2, cy: r.y + r.height / 2, w: r.width, h: r.height,
    ownTransform: el.getAttribute('transform'),
    parentTransform: el.parentElement?.getAttribute('transform'),
    isFromSource: el.hasAttribute('data-src-page'),
  }
})
if (!meta) { console.log('NO ON-SCREEN TEXT'); dumpLog(log); await browser.close(); process.exit(1) }
console.log('TARGET:', JSON.stringify(meta))
check('target run is source-imported', meta.isFromSource === true)
check('target run is transformed (wrapper and/or inner matrix)',
  !!(meta.ownTransform || meta.parentTransform), `own=${meta.ownTransform} parent=${meta.parentTransform}`)

// === double-click → enter in-place edit ===
await page.keyboard.press('v'); await page.waitForTimeout(120)
await page.mouse.dblclick(meta.cx, meta.cy)
await page.waitForTimeout(350)
await shot(page, 'exp-edit-imported-text-01-editing')

const editState = await page.evaluate(() => {
  const ta = document.querySelector('textarea[data-role="text-edit-overlay"]')
  const r = ta ? ta.getBoundingClientRect() : null
  return {
    hasTextarea: !!ta,
    focusedTag: document.activeElement ? document.activeElement.tagName : null,
    value: ta ? ta.value : null,
    taRect: r ? { cx: r.x + r.width / 2, cy: r.y + r.height / 2, w: r.width, h: r.height } : null,
  }
})
console.log('EDIT STATE:', JSON.stringify(editState))
check('textarea overlay mounted on dblclick', editState.hasTextarea === true)
check('textarea is focused', editState.focusedTag === 'TEXTAREA')
check('textarea seeded with the run content', editState.value === meta.text, `got "${editState.value}"`)
// CTM mapping sanity: the overlay sits over the run's on-screen bbox.
if (editState.taRect) {
  const dx = Math.abs(editState.taRect.cx - meta.cx)
  const dy = Math.abs(editState.taRect.cy - meta.cy)
  check('overlay maps over the doubly-transformed run bbox',
    dx <= meta.w && dy <= Math.max(meta.h, 28), `dx=${dx.toFixed(1)} dy=${dy.toFixed(1)} w=${meta.w.toFixed(1)} h=${meta.h.toFixed(1)}`)
}

// retype a new word (select-all then type → replace)
await page.keyboard.press('Control+a'); await page.waitForTimeout(60)
await page.keyboard.type(NEW_WORD, { delay: 25 })
await page.waitForTimeout(150)
await shot(page, 'exp-edit-imported-text-02-typed')

// Commit via blur by clicking neutral CHROME (the inspector), NOT the canvas —
// a canvas click would re-run selectTool and clear the selection before we can
// assert the box still tracks the edited run. This still exercises blur-commit.
const inspPt = await page.evaluate(() => {
  const i = document.querySelector('[data-testid="inspector"]')
  if (!i) return null
  const r = i.getBoundingClientRect()
  return { x: r.x + r.width / 2, y: r.y + 24 }
})
if (inspPt) await page.mouse.click(inspPt.x, inspPt.y)
else await page.evaluate(() => document.activeElement && document.activeElement.blur())
await page.waitForTimeout(300)
await shot(page, 'exp-edit-imported-text-03-committed')

const after = await targetHandle.evaluate((el) => ({
  text: el.textContent || '',
  connected: el.isConnected,
  tspanCount: el.querySelectorAll('tspan').length,
  firstTspanX: el.querySelector('tspan') ? el.querySelector('tspan').getAttribute('x') : null,
}))
const ui = await page.evaluate(() => ({
  selBoxes: document.querySelectorAll('[data-role="selection-box"]').length,
  taGone: !document.querySelector('textarea[data-role="text-edit-overlay"]'),
}))
console.log('AFTER:', JSON.stringify(after), JSON.stringify(ui))

check('canvas <text> content changed to the new word',
  after.text === NEW_WORD || after.text.includes(NEW_WORD), `got "${after.text}"`)
check('edited <text> mutated in place (same node, still connected)', after.connected === true)
check('run collapsed to a single tspan', after.tspanCount === 1, `tspanCount=${after.tspanCount}`)
check('start-x collapsed to a scalar (no per-char array)',
  after.firstTspanX !== null && !/\s/.test(after.firstTspanX.trim()), `x="${after.firstTspanX}"`)
check('textarea overlay removed after commit', ui.taGone === true)
check('a selection box still tracks the edited run', ui.selBoxes >= 1, `selBoxes=${ui.selBoxes}`)

// Undo restores the original content (byte-exact subtree).
await page.keyboard.press('v'); await page.waitForTimeout(80)
await page.keyboard.press('Control+z'); await page.waitForTimeout(300)
const afterUndo = await targetHandle.evaluate((el) => ({ text: el.textContent || '' }))
console.log('AFTER UNDO:', JSON.stringify(afterUndo))
check('undo restores the original content', afterUndo.text === meta.text, `got "${afterUndo.text}"`)
await shot(page, 'exp-edit-imported-text-04-undone')

dumpLog(log)
console.log(`\nEXP-EDIT-IMPORTED-TEXT DONE — ${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'}`)
await browser.close()
process.exit(failures === 0 ? 0 : 1)
