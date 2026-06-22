import { openApp, shot, dumpLog } from '../_driver.mjs'
const { browser, page, log } = await openApp()

async function guides() {
  return await page.evaluate(() => {
    const g = document.querySelector('g[data-role="user-guides"], [data-role="user-guides"]')
    // guides may render as lines; count line elements flagged as guides
    const all = Array.from(document.querySelectorAll('line, [data-guide]'))
    return {
      userGuidesGroupKids: g ? g.children.length : 'no-group',
      anyGuideLines: document.querySelectorAll('[data-role*="guide"] line, line[data-guide]').length,
    }
  })
}

// ruler positions: HRuler is the top strip (y 66-80), VRuler is left strip (x 78-92)
console.log('before:', JSON.stringify(await guides()))

// Drag from H ruler (top strip) DOWN into canvas -> should create a horizontal guide
await page.mouse.move(400, 73)   // on H ruler
await page.mouse.down()
await page.mouse.move(400, 300, { steps: 10 })  // drag down into canvas
await page.mouse.up()             // release over SVG, NOT over ruler
await page.waitForTimeout(200)
console.log('after H-ruler drag (release in canvas):', JSON.stringify(await guides()))
await shot(page, 'exp-chaos-drill9-hguide')

// try releasing while still technically... move back? No, real gesture releases in canvas.
// Drag from V ruler (left strip) RIGHT into canvas
await page.mouse.move(85, 400)
await page.mouse.down()
await page.mouse.move(400, 400, { steps: 10 })
await page.mouse.up()
await page.waitForTimeout(200)
console.log('after V-ruler drag (release in canvas):', JSON.stringify(await guides()))
await shot(page, 'exp-chaos-drill9-vguide')

dumpLog(log)
await browser.close()
console.log('DRILL9 DONE')
