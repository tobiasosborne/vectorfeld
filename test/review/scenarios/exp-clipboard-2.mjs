import { openApp, shot, dumpLog } from '../_driver.mjs'

const { browser, page, log } = await openApp()

async function canvasBox() { return await page.locator('[data-role="canvas-root"]').boundingBox() }
async function drawRect(x1,y1,x2,y2){const cr=await canvasBox();await page.mouse.move(cr.x+x1,cr.y+y1);await page.mouse.down();await page.mouse.move(cr.x+x2,cr.y+y2,{steps:6});await page.mouse.up()}
async function clickCanvas(x,y){const cr=await canvasBox();await page.mouse.click(cr.x+x,cr.y+y)}

async function layerInfo(){
  return await page.evaluate(()=>{
    const layers=[...document.querySelectorAll('g[data-layer-name]')]
    return layers.map(l=>({name:l.getAttribute('data-layer-name'),kids:l.children.length}))
  })
}

try {
  // draw + copy a rect
  await page.keyboard.press('r')
  await drawRect(120,120,200,200)
  await page.keyboard.press('v')
  await clickCanvas(160,160)
  await page.keyboard.press('Control+c')
  console.log('BEFORE addLayer layers=', JSON.stringify(await layerInfo()))

  // add a new layer via inspector
  await page.locator('[data-testid="add-layer"]').click().catch(e=>console.log('add-layer click fail', e.message))
  await page.waitForTimeout(200)
  console.log('AFTER addLayer layers=', JSON.stringify(await layerInfo()))
  await shot(page,'exp-clipboard-11-newlayer')

  // paste — which layer does it land on?
  await page.keyboard.press('Control+v')
  await page.waitForTimeout(150)
  console.log('AFTER paste-on-new-layer layers=', JSON.stringify(await layerInfo()))
  await shot(page,'exp-clipboard-12-paste-newlayer')

  // ---- page test ----
  // Look for page nav / add page
  const pageNav = await page.evaluate(()=>{
    const n=document.querySelector('[data-role="page-nav"]')
    return n? n.innerText : 'NO page-nav'
  })
  console.log('PAGE NAV:', pageNav)

  // Try Pages tab in inspector to add a page
  const pagesTab = page.getByText('Pages',{exact:true}).last()
  await pagesTab.click().catch(e=>console.log('pages tab fail',e.message))
  await page.waitForTimeout(200)
  await shot(page,'exp-clipboard-13-pages-tab')
  const pagesPanel = await page.evaluate(()=>document.querySelector('[data-testid="inspector"]')?.innerText?.slice(0,300))
  console.log('PAGES PANEL:', pagesPanel)

} catch(e){ console.log('ERR', e.message, e.stack) }
finally { dumpLog(log); await browser.close() }
