import { openApp, shot, dumpLog } from '../_driver.mjs'
const CR = '[data-role="canvas-root"]'

function readShape(page) {
  return page.evaluate(() => {
    const layers = document.querySelectorAll('g[data-layer-name]')
    let shape = null
    for (const lyr of layers) { for (const c of lyr.children) { shape = c; break } if (shape) break }
    return shape ? {
      tag: shape.tagName, x: shape.getAttribute('x'), w: shape.getAttribute('width'), h: shape.getAttribute('height'),
      rx: shape.getAttribute('rx'), ry: shape.getAttribute('ry'),
      fill: shape.getAttribute('fill'), transform: shape.getAttribute('transform'),
      sw: shape.getAttribute('stroke-width'), dash: shape.getAttribute('stroke-dasharray'),
      selBoxes: document.querySelectorAll('[data-role="selection-box"]').length,
    } : { none: true, selBoxes: document.querySelectorAll('[data-role="selection-box"]').length }
  })
}
async function drawRect(page,x1,y1,x2,y2){const b=await page.locator(CR).boundingBox();await page.keyboard.press('r');await page.mouse.move(b.x+x1,b.y+y1);await page.mouse.down();await page.mouse.move(b.x+x2,b.y+y2,{steps:8});await page.mouse.up()}
async function sel(page,dx,dy){const b=await page.locator(CR).boundingBox();await page.keyboard.press('v');await page.mouse.click(b.x+dx,b.y+dy)}
async function fillPanel(page,label,v){const i=page.locator(`xpath=//span[normalize-space(text())="${label}"]/following-sibling::input`).first();await i.click();await i.fill('');await i.type(String(v));await page.keyboard.press('Enter');await page.waitForTimeout(120)}

async function run(){
  const {browser,page,log}=await openApp()
  await drawRect(page,150,150,380,330)
  await sel(page,260,240)
  let r=await readShape(page); console.log('drawn selBoxes=',r.selBoxes,'fill=',r.fill)

  console.log('\n=== FILL transitions ===')
  const ft=page.locator('[data-testid="fill-type"]')
  for(const t of ['solid','linear','radial','none','solid']){
    await ft.selectOption(t); await page.waitForTimeout(150)
    r=await readShape(page); console.log(`fill->${t}: fill=`,r.fill)
    await shot(page,`exp-properties4-fill-${t}`)
  }

  console.log('\n=== ROUNDED CORNERS ===')
  await fillPanel(page,'Rx',25); await fillPanel(page,'Ry',18)
  r=await readShape(page); console.log('corners rx=',r.rx,'ry=',r.ry)
  await shot(page,'exp-properties4-corners')

  console.log('\n=== EDGE W/H ===')
  await fillPanel(page,'W',-40); r=await readShape(page); console.log('W=-40 -> width=',r.w,'selBoxes=',r.selBoxes)
  await shot(page,'exp-properties4-negW')
  await fillPanel(page,'W',0); r=await readShape(page); console.log('W=0 -> width=',r.w)
  await fillPanel(page,'H',88888); r=await readShape(page); console.log('H=88888 -> height=',r.h)
  await shot(page,'exp-properties4-hugeH')
  // restore
  await fillPanel(page,'W',150); await fillPanel(page,'H',120)
  await fillPanel(page,'H','abc'); r=await readShape(page); console.log('H=abc -> height=',r.h,'(should be unchanged 120)')

  console.log('\n=== ROTATION ===')
  await fillPanel(page,'Rot',35); r=await readShape(page); console.log('Rot=35 -> transform=',r.transform)
  await shot(page,'exp-properties4-rot')

  console.log('\n=== SKEW ===')
  await fillPanel(page,'SkX',20); r=await readShape(page); console.log('SkX=20 -> transform=',r.transform)
  await fillPanel(page,'SkY',12); r=await readShape(page); console.log('SkY=12 -> transform=',r.transform)
  await shot(page,'exp-properties4-skew')

  console.log('\n=== STROKE width/dash ===')
  await fillPanel(page,'SW',5); r=await readShape(page); console.log('SW=5 -> sw=',r.sw)
  const dash=page.locator('xpath=//span[normalize-space(text())="Dash"]/following-sibling::select').first()
  await dash.selectOption('2 2'); await page.waitForTimeout(120)
  r=await readShape(page); console.log('dash dotted -> dash=',r.dash)
  await shot(page,'exp-properties4-stroke')

  // custom dash
  await dash.selectOption('__custom__'); await page.waitForTimeout(120)
  r=await readShape(page); console.log('dash __custom__ -> dash=',r.dash,'(custom is a no-op return)')

  dumpLog(log); await browser.close()
}
run().catch(e=>{console.error('FATAL',e);process.exit(1)})
