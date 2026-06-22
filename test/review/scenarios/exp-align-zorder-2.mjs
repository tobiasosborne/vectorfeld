import { openApp, shot, dumpLog } from '../_driver.mjs'

const { browser, page, log } = await openApp()
const box = await page.locator('[data-role="canvas-root"]').boundingBox()
async function tool(letter) { await page.keyboard.press(letter); await page.waitForTimeout(80) }
async function drag(x1, y1, x2, y2) {
  await page.mouse.move(box.x + x1, box.y + y1); await page.mouse.down()
  for (let i = 1; i <= 5; i++) { await page.mouse.move(box.x + x1 + (x2-x1)*i/5, box.y + y1 + (y2-y1)*i/5); await page.waitForTimeout(10) }
  await page.mouse.up(); await page.waitForTimeout(80)
}
async function clickAt(cx, cy, opts={}) { await page.mouse.click(box.x+cx, box.y+cy, opts); await page.waitForTimeout(100) }
async function objectAction(name) {
  await page.getByRole('button', { name: 'Object', exact: true }).click(); await page.waitForTimeout(120)
  await page.locator('button', { has: page.locator('span', { hasText: new RegExp('^'+name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$') }) }).last().click()
  await page.waitForTimeout(150)
}
async function order() {
  return await page.evaluate(() => {
    const layer = document.querySelector('g[data-layer-name]')
    return Array.from(layer.children).map(c => c.getAttribute('id')).join(',')
  })
}
async function sel() {
  return await page.evaluate(() => {
    const insp = document.querySelector('[data-testid="inspector"]')
    return { boxes: document.querySelectorAll('[data-role="selection-box"]').length, insp: insp ? insp.innerText.replace(/\s+/g,' ').slice(0,40) : '' }
  })
}

// 3 rects, well separated so single-clicks land cleanly
await tool('r'); await drag(120, 120, 200, 200)   // A left  -> vf-1
await tool('r'); await drag(320, 120, 400, 200)   // B mid   -> vf-2
await tool('r'); await drag(520, 120, 600, 200)   // C right -> vf-3
await tool('v')
await clickAt(900, 600) // deselect (empty area)
await shot(page, 'exp-align-zorder-2-setup')
console.log('order after create:', await order(), 'sel:', JSON.stringify(await sel()))

// SINGLE-select rect A (vf-1, lowest in z, leftmost) by clicking it
await clickAt(160, 160)
console.log('after click A -> sel:', JSON.stringify(await sel()))
console.log('order:', await order())

// Bring to Front: vf-1 should move to end
await objectAction('Bring to Front')
console.log('A Bring to Front -> order:', await order(), '(expect vf-2,vf-3,vf-1)')
await shot(page, 'exp-align-zorder-2-A-front')

// Send to Back
await clickAt(160, 160) // A may have moved? it's still at same canvas pos
console.log('reselect A sel:', JSON.stringify(await sel()))
await objectAction('Send to Back')
console.log('A Send to Back -> order:', await order(), '(expect vf-1,...)')

// Bring Forward one step on vf-1
await clickAt(160, 160)
await objectAction('Bring Forward')
console.log('A Bring Forward -> order:', await order(), '(expect vf-1 moved one step right)')

// Send Backward on vf-3 (rightmost / topmost)
await clickAt(900, 600)
await clickAt(560, 160)
console.log('select C sel:', JSON.stringify(await sel()))
await objectAction('Send Backward')
console.log('C Send Backward -> order:', await order())

// keyboard shortcuts on single selection
await clickAt(900, 600); await clickAt(160, 160)
const kb1 = await order()
await page.keyboard.press('Control+BracketRight'); await page.waitForTimeout(120) // bring forward
console.log('Ctrl+] on A: before', kb1, 'after', await order())

await clickAt(900, 600); await clickAt(560, 160)
const kb2 = await order()
await page.keyboard.press('Control+BracketLeft'); await page.waitForTimeout(120) // send backward
console.log('Ctrl+[ on C: before', kb2, 'after', await order())

// Ctrl+Shift+] bring to front
await clickAt(900, 600); await clickAt(160, 160)
const kb3 = await order()
await page.keyboard.press('Control+Shift+BracketRight'); await page.waitForTimeout(120)
console.log('Ctrl+Shift+] on A: before', kb3, 'after', await order())

// SELECTION-AFTER-CTRL-A then single-click (the earlier anomaly)
await page.keyboard.press('Control+a'); await page.waitForTimeout(120)
console.log('after Ctrl+A sel:', JSON.stringify(await sel()))
await clickAt(160, 160)
console.log('after Ctrl+A then single-click A sel:', JSON.stringify(await sel()), '(expect 1)')

dumpLog(log)
await browser.close()
console.log('DONE-2')
