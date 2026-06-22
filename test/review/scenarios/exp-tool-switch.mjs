import { openApp, shot, dumpLog } from '../_driver.mjs'

const SID = 'exp-tool-switch'
const { browser, page, log } = await openApp()

function st() {
  return page.evaluate(() => {
    const lyr = document.querySelector('g[data-layer-name]')
    return {
      layerKids: lyr ? lyr.children.length : null,
      previews: document.querySelectorAll('[data-role="preview"]').length,
      selBoxes: document.querySelectorAll('[data-role="selection-box"]').length,
      activeTool: document.querySelector('[data-tool-slot][data-active="true"]')?.getAttribute('data-tool-slot') || null,
      inspector: (document.querySelector('[data-testid="inspector"]')?.innerText || '').replace(/\s+/g, ' ').slice(0, 120),
    }
  })
}

async function canvasBox() {
  const b = await page.locator('[data-role="canvas-root"]').boundingBox()
  return b
}

const out = (label, s) => console.log(`[${label}]`, JSON.stringify(s))

const cb = await canvasBox()
const cx = (fx) => cb.x + fx
const cy = (fy) => cb.y + fy

console.log('=== INITIAL ===')
out('init', await st())

// ---------- A) mid-rectangle-drag -> switch tool via shortcut ----------
console.log('\n=== A: mid-rect-drag, switch to V (select) via keyboard ===')
await page.keyboard.press('r')
await page.mouse.move(cx(200), cy(200))
await page.mouse.down()
await page.mouse.move(cx(320), cy(300), { steps: 5 })
out('A.mid-drag', await st())
await shot(page, `${SID}-A1-mid-rect-drag`)
// switch tool mid-drag via keyboard shortcut
await page.keyboard.press('v')
out('A.after-V-keypress (still mouse down)', await st())
await shot(page, `${SID}-A2-after-V-mid-drag`)
// now release mouse - where does it go?
await page.mouse.up()
out('A.after-mouseup', await st())
await shot(page, `${SID}-A3-after-mouseup`)

// ---------- B) mid-rectangle-drag -> Escape ----------
console.log('\n=== B: mid-rect-drag, press Escape ===')
await page.keyboard.press('r')
await page.mouse.move(cx(400), cy(200))
await page.mouse.down()
await page.mouse.move(cx(500), cy(300), { steps: 5 })
out('B.mid-drag', await st())
await page.keyboard.press('Escape')
out('B.after-Escape (still mouse down)', await st())
await shot(page, `${SID}-B1-rect-escape`)
await page.mouse.up()
out('B.after-mouseup', await st())
await shot(page, `${SID}-B2-rect-escape-up`)

// reset to empty: undo any committed
async function clearAll() {
  for (let i = 0; i < 8; i++) await page.keyboard.press('Control+z')
  await page.keyboard.press('v')
}
await clearAll()
out('after-clearAll', await st())

// ---------- C) mid-text-typing -> switch tool ----------
console.log('\n=== C: mid-text typing, switch to Rect via keyboard ===')
await page.keyboard.press('t')
await page.mouse.click(cx(250), cy(250))
await page.keyboard.type('HELLO')
out('C.mid-type', await st())
await shot(page, `${SID}-C1-mid-text`)
// switch tool - but keyboard is captured; does pressing 'r' switch or type 'r'?
await page.keyboard.press('r')
out('C.after-r-press', await st())
await shot(page, `${SID}-C2-after-r`)

await clearAll()

// ---------- D) mid-text-typing -> Escape ----------
console.log('\n=== D: mid-text typing, press Escape ===')
await page.keyboard.press('t')
await page.mouse.click(cx(250), cy(250))
await page.keyboard.type('WORLD')
out('D.mid-type', await st())
await page.keyboard.press('Escape')
out('D.after-Escape', await st())
await shot(page, `${SID}-D1-text-escape`)

await clearAll()

// ---------- E) mid-text typing -> click tool slot button (mouse) ----------
console.log('\n=== E: mid-text typing, click Select tool slot with mouse ===')
await page.keyboard.press('t')
await page.mouse.click(cx(250), cy(250))
await page.keyboard.type('CLICKED')
out('E.mid-type', await st())
await page.locator('[data-tool-slot="select"]').click()
out('E.after-click-select', await st())
await shot(page, `${SID}-E1-text-clickswitch`)

await clearAll()

// ---------- F) mid-pen-path (2 anchors) -> switch tool ----------
console.log('\n=== F: mid-pen (2+ anchors), switch to V via keyboard ===')
await page.keyboard.press('p')
await page.mouse.click(cx(150), cy(400))
await page.mouse.click(cx(250), cy(450))
await page.mouse.click(cx(350), cy(400))
out('F.mid-pen-3clicks', await st())
await shot(page, `${SID}-F1-mid-pen`)
await page.keyboard.press('v')
out('F.after-V', await st())
await shot(page, `${SID}-F2-pen-after-V`)

await clearAll()

// ---------- G) mid-pen-path -> Escape ----------
console.log('\n=== G: mid-pen (2+ anchors), Escape ===')
await page.keyboard.press('p')
await page.mouse.click(cx(150), cy(400))
await page.mouse.click(cx(250), cy(450))
await page.mouse.click(cx(350), cy(400))
out('G.mid-pen', await st())
await page.keyboard.press('Escape')
out('G.after-Escape', await st())
await shot(page, `${SID}-G1-pen-escape`)

await clearAll()

// ---------- H) mid-pen -> switch to Text via keyboard (chained) ----------
console.log('\n=== H: mid-pen, switch to Text, then type (chained corruption probe) ===')
await page.keyboard.press('p')
await page.mouse.click(cx(150), cy(400))
await page.mouse.click(cx(250), cy(450))
out('H.mid-pen-2', await st())
await page.keyboard.press('t')
out('H.after-t', await st())
await page.mouse.click(cx(400), cy(300))
await page.keyboard.type('AFTER')
out('H.after-type', await st())
await page.keyboard.press('Escape')
out('H.final', await st())
await shot(page, `${SID}-H1-pen-to-text`)

await clearAll()

// ---------- I) rapid tool cycling V/R/T/P/A/E ----------
console.log('\n=== I: rapid tool cycle ===')
for (const k of ['v', 'r', 't', 'p', 'a', 'e', 'v']) {
  await page.keyboard.press(k)
  const s = await st()
  out(`I.cycle-${k}`, s)
}
await shot(page, `${SID}-I1-after-cycle`)

// ---------- J) Escape with nothing happening (idle) on each tool ----------
console.log('\n=== J: Escape semantics with selection present ===')
await page.keyboard.press('r')
await page.mouse.move(cx(600), cy(200))
await page.mouse.down(); await page.mouse.move(cx(700), cy(280), {steps:4}); await page.mouse.up()
out('J.rect-committed', await st())
await shot(page, `${SID}-J1-rect-committed`)
// now element selected (rect auto-selects + switches to select). Press Escape.
await page.keyboard.press('Escape')
out('J.after-escape-on-selection', await st())
await shot(page, `${SID}-J2-after-escape`)

console.log('\n=== FINAL ===')
out('final', await st())

dumpLog(log)
await browser.close()
