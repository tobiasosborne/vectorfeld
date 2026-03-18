/**
 * Vectorfeld Benchmark: Redraw shapes-rect-01 from scratch using tools.
 *
 * This script uses playwright-cli run-code to:
 * 1. Draw 8 rectangles using the rect tool
 * 2. Modify their properties (fill, stroke, rx, ry) via the Properties panel
 * 3. Verify the resulting DOM matches expectations
 * 4. Test operations (move, undo, copy/paste) on each
 * 5. Report all bugs found
 */
async function run(page) {
  const bugs = [];
  const log = [];

  function bug(sev, cat, desc, details) {
    bugs.push({ sev, cat, desc, details: details || '' });
    log.push(`  BUG [${sev}] ${cat}: ${desc}`);
  }

  // ===== HELPERS =====

  async function getCTM() {
    return await page.evaluate(() => {
      const svg = document.querySelector('[data-role=overlay]').closest('svg');
      const ctm = svg.getScreenCTM();
      return { a: ctm.a, d: ctm.d, e: ctm.e, f: ctm.f };
    });
  }

  function toScreen(ctm, x, y) {
    return { x: Math.round(x * ctm.a + ctm.e), y: Math.round(y * ctm.d + ctm.f) };
  }

  async function drawRect(ctm, x1, y1, x2, y2) {
    const tl = toScreen(ctm, x1, y1);
    const br = toScreen(ctm, x2, y2);
    await page.mouse.move(tl.x, tl.y);
    await page.mouse.down({ button: 'left' });
    // Move in small steps to trigger mousemove properly
    for (let i = 1; i <= 3; i++) {
      await page.mouse.move(
        tl.x + (br.x - tl.x) * i / 3,
        tl.y + (br.y - tl.y) * i / 3
      );
    }
    await page.mouse.up({ button: 'left' });
    await page.waitForTimeout(100);
  }

  async function clickAt(ctm, x, y) {
    const s = toScreen(ctm, x, y);
    await page.mouse.click(s.x, s.y);
    await page.waitForTimeout(100);
  }

  async function dragFromTo(ctm, x1, y1, x2, y2) {
    const from = toScreen(ctm, x1, y1);
    const to = toScreen(ctm, x2, y2);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down({ button: 'left' });
    for (let i = 1; i <= 5; i++) {
      await page.mouse.move(
        from.x + (to.x - from.x) * i / 5,
        from.y + (to.y - from.y) * i / 5
      );
    }
    await page.mouse.up({ button: 'left' });
    await page.waitForTimeout(100);
  }

  async function getLayerChildren() {
    return await page.evaluate(() => {
      const svg = document.querySelector('[data-role=overlay]').closest('svg');
      const layer = svg.querySelector('g[data-layer-name]');
      return Array.from(layer.children).map(el => {
        const attrs = {};
        for (const a of el.attributes) attrs[a.name] = a.value;
        return { tag: el.tagName, id: el.id, attrs };
      });
    });
  }

  async function getElementAttr(id, attr) {
    return await page.evaluate(([id, attr]) => document.getElementById(id)?.getAttribute(attr), [id, attr]);
  }

  async function selectionCount() {
    return await page.evaluate(() => document.querySelectorAll('[data-role=selection-box]').length);
  }

  async function pressKey(key) {
    await page.keyboard.press(key);
    await page.waitForTimeout(100);
  }

  // Fill a textbox ref with a value (triple-click to select all, then type)
  async function fillField(refSelector, value) {
    const el = page.locator(refSelector);
    await el.click({ clickCount: 3 });
    await page.keyboard.type(String(value));
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
  }

  // ===== PHASE 1: Draw 8 rectangles =====
  log.push('=== PHASE 1: Draw rectangles with rect tool ===');

  const ctm = await getCTM();

  // Switch to rect tool
  await pressKey('r');

  // Rect layout in SVG mm coordinates:
  // Row 1: y=10 to y=55 (45mm tall)
  // Row 2: y=70 to y=115
  // Columns: x=10, x=60, x=110, x=160 (40mm wide each, 10mm gap)
  const rects = [
    { x: 10, y: 10, w: 40, h: 45, label: 'R1: stroke only' },
    { x: 60, y: 10, w: 40, h: 45, label: 'R2: fuchsia fill' },
    { x: 110, y: 10, w: 40, h: 45, label: 'R3: rounded stroke' },
    { x: 160, y: 10, w: 40, h: 45, label: 'R4: rounded fuchsia' },
    { x: 10, y: 70, w: 40, h: 45, label: 'R5: thick blue stroke' },
    { x: 60, y: 70, w: 40, h: 45, label: 'R6: green+blue stroke' },
    { x: 110, y: 70, w: 40, h: 45, label: 'R7: rounded thick' },
    { x: 160, y: 70, w: 40, h: 45, label: 'R8: rounded green' },
  ];

  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    await drawRect(ctm, r.x, r.y, r.x + r.w, r.y + r.h);
    log.push(`  Drew ${r.label}`);
  }

  // Check we created 8 elements
  let children = await getLayerChildren();
  if (children.length !== 8) {
    bug('P0', 'rect-tool', `Expected 8 rects, got ${children.length}`, JSON.stringify(children.map(c=>c.tag)));
  } else {
    log.push(`  OK: 8 elements created`);
  }

  // Record element IDs for later
  children = await getLayerChildren();
  const ids = children.map(c => c.id);
  log.push(`  IDs: ${ids.join(', ')}`);

  // ===== PHASE 2: Verify initial properties =====
  log.push('\n=== PHASE 2: Check initial rect properties ===');

  for (let i = 0; i < ids.length; i++) {
    const el = children[i];
    const r = rects[i];

    // Check it's a rect
    if (el.tag !== 'rect') {
      bug('P1', 'rect-tool', `Element ${i+1} is ${el.tag}, expected rect`, '');
      continue;
    }

    // Check approximate position (allow 2mm tolerance for mouse precision)
    const x = parseFloat(el.attrs.x);
    const y = parseFloat(el.attrs.y);
    const w = parseFloat(el.attrs.width);
    const h = parseFloat(el.attrs.height);

    if (Math.abs(x - r.x) > 2) bug('P2', 'position', `${r.label} x=${x}, expected ~${r.x}`, '');
    if (Math.abs(y - r.y) > 2) bug('P2', 'position', `${r.label} y=${y}, expected ~${r.y}`, '');
    if (Math.abs(w - r.w) > 3) bug('P2', 'size', `${r.label} width=${w}, expected ~${r.w}`, '');
    if (Math.abs(h - r.h) > 3) bug('P2', 'size', `${r.label} height=${h}, expected ~${r.h}`, '');

    // Default style should be: fill=none, stroke=#000000
    if (el.attrs.fill !== 'none') {
      bug('P2', 'default-style', `${r.label} fill=${el.attrs.fill}, expected none`, '');
    }
    if (el.attrs.stroke !== '#000000') {
      bug('P2', 'default-style', `${r.label} stroke=${el.attrs.stroke}, expected #000000`, '');
    }

    log.push(`  ${r.label}: (${x.toFixed(1)}, ${y.toFixed(1)}) ${w.toFixed(1)}x${h.toFixed(1)} fill=${el.attrs.fill} stroke=${el.attrs.stroke}`);
  }

  // ===== PHASE 3: Modify properties via Properties Panel =====
  log.push('\n=== PHASE 3: Modify properties via UI ===');

  // Switch to select tool
  await pressKey('v');

  // --- R2: Set fill to fuchsia (#FF00FF), stroke to none ---
  log.push('  Modifying R2: fill=fuchsia, stroke=none');
  await clickAt(ctm, 80, 32); // center of R2
  let sel = await selectionCount();
  if (sel < 1) {
    bug('P1', 'selection', 'Cannot select R2 at (80, 32)', '');
  } else {
    // Change Fill dropdown from "None" to "Solid"
    const fillCombo = page.locator('select[aria-label="Fill"], [aria-label="Fill"]').first();
    try {
      await fillCombo.selectOption('Solid');
      await page.waitForTimeout(200);
    } catch (e) {
      // Try finding it by snapshot ref
      log.push(`    Fill combo error: ${e.message.substring(0, 80)}`);
    }

    // After selecting "Solid", a color button should appear. Click it and set color.
    // For now, check if fill changed
    const fillAfter = await getElementAttr(ids[1], 'fill');
    log.push(`    R2 fill after 'Solid': ${fillAfter}`);

    // Try setting fill color via the color button that appears
    // We need a fresh snapshot to find the color button
    const colorBtn = page.locator('button[title*="fill"], button[aria-label*="Fill color"]').first();
    try {
      await colorBtn.click({ timeout: 2000 });
      log.push('    Clicked fill color button');
    } catch (e) {
      log.push(`    No fill color button found: ${e.message.substring(0, 50)}`);
    }
  }

  // --- R5: Set stroke to blue (#0000FF), stroke-width to 8 ---
  log.push('  Modifying R5: stroke=#0000FF, stroke-width=8');
  await clickAt(ctm, 30, 92); // center of R5
  sel = await selectionCount();
  if (sel < 1) {
    bug('P1', 'selection', 'Cannot select R5 at (30, 92)', '');
  } else {
    // Change stroke-width via the SW textbox
    const swInput = page.locator('input[aria-label="SW"]');
    try {
      await swInput.click({ clickCount: 3 });
      await page.keyboard.type('8');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(200);
      const sw = await getElementAttr(ids[4], 'stroke-width');
      log.push(`    R5 stroke-width after edit: ${sw}`);
      if (sw !== '8') {
        bug('P2', 'property-edit', `R5 stroke-width set to ${sw}, expected 8`, '');
      }
    } catch (e) {
      log.push(`    SW input error: ${e.message.substring(0, 80)}`);
    }
  }

  // ===== PHASE 4: Test operations on drawn elements =====
  log.push('\n=== PHASE 4: Test operations ===');

  // Test 4.1: Move R1 and undo
  log.push('  Test 4.1: Move R1');
  await clickAt(ctm, 30, 32); // select R1
  const origX = await getElementAttr(ids[0], 'x');
  const origY = await getElementAttr(ids[0], 'y');
  await dragFromTo(ctm, 30, 32, 35, 37); // move 5mm right, 5mm down
  const movedX = await getElementAttr(ids[0], 'x');
  const movedY = await getElementAttr(ids[0], 'y');

  const dx = parseFloat(movedX) - parseFloat(origX);
  const dy = parseFloat(movedY) - parseFloat(origY);
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1) {
    bug('P1', 'move', 'Move had no effect on R1', `dx=${dx}, dy=${dy}`);
  } else {
    log.push(`    Moved R1: dx=${dx.toFixed(1)}, dy=${dy.toFixed(1)}`);
  }

  // Undo
  await pressKey('Control+z');
  const undoX = await getElementAttr(ids[0], 'x');
  if (Math.abs(parseFloat(undoX) - parseFloat(origX)) > 0.1) {
    bug('P1', 'undo', `Undo did not restore R1 position: ${undoX} vs ${origX}`, '');
  } else {
    log.push(`    Undo restored R1: x=${undoX}`);
  }

  // Test 4.2: Copy/Paste R1
  log.push('  Test 4.2: Copy/Paste R1');
  await clickAt(ctm, 30, 32);
  await pressKey('Control+c');
  await pressKey('Control+v');
  const afterPaste = await getLayerChildren();
  if (afterPaste.length !== 9) {
    bug('P1', 'paste', `After paste: ${afterPaste.length} elements, expected 9`, '');
  } else {
    const pasted = afterPaste[afterPaste.length - 1];
    if (pasted.tag !== 'rect') {
      bug('P1', 'paste', `Pasted element is ${pasted.tag}, expected rect`, '');
    } else {
      // Check pasted rect has same dimensions
      const origW = parseFloat(children[0].attrs.width);
      const pastedW = parseFloat(pasted.attrs.width);
      if (Math.abs(origW - pastedW) > 0.1) {
        bug('P2', 'paste', `Pasted width ${pastedW} != original ${origW}`, '');
      }
      log.push(`    Pasted rect: ${pasted.attrs.width}x${pasted.attrs.height}, fill=${pasted.attrs.fill}, stroke=${pasted.attrs.stroke}`);
    }
  }
  await pressKey('Control+z'); // undo paste

  // Test 4.3: Delete R1 and undo
  log.push('  Test 4.3: Delete R1 and undo');
  await clickAt(ctm, 30, 32);
  await pressKey('Delete');
  const afterDel = await getLayerChildren();
  if (afterDel.length !== 7) {
    bug('P1', 'delete', `After delete: ${afterDel.length} elements, expected 7`, '');
  }
  await pressKey('Control+z');
  const afterUndoDel = await getLayerChildren();
  if (afterUndoDel.length !== 8) {
    bug('P1', 'undo-delete', `After undo delete: ${afterUndoDel.length} elements, expected 8`, '');
  } else {
    log.push(`    Delete + undo: 8 -> ${afterDel.length} -> 8 OK`);
  }

  // Test 4.4: Group two rects, move group, ungroup
  log.push('  Test 4.4: Group R1+R2, move, ungroup');
  await clickAt(ctm, 30, 32); // select R1
  const r2screen = toScreen(ctm, 80, 32);
  await page.keyboard.down('Shift');
  await page.mouse.click(r2screen.x, r2screen.y);
  await page.keyboard.up('Shift');
  await page.waitForTimeout(100);

  sel = await selectionCount();
  log.push(`    Multi-select: ${sel} selection boxes`);

  await pressKey('Control+g'); // Group
  const afterGroup = await getLayerChildren();
  const groupEl = afterGroup.find(c => c.tag === 'g');
  if (!groupEl) {
    bug('P1', 'group', 'Ctrl+G did not create a group element', '');
  } else {
    // Check group has children
    const groupChildren = await page.evaluate((id) => {
      const g = document.getElementById(id);
      return g ? g.children.length : 0;
    }, groupEl.id);
    if (groupChildren < 2) {
      bug('P0', 'group', `Group has ${groupChildren} children, expected 2`, '');
    } else {
      log.push(`    Group created with ${groupChildren} children`);
    }

    // Move the group
    const origTransform = groupEl.attrs.transform || 'none';
    await dragFromTo(ctm, 55, 32, 60, 37);
    const newTransform = await getElementAttr(groupEl.id, 'transform');
    log.push(`    Group transform: ${origTransform} -> ${newTransform}`);

    await pressKey('Control+z'); // undo move

    // Ungroup
    await clickAt(ctm, 55, 32); // select group
    await page.keyboard.press('Control+Shift+g');
    await page.waitForTimeout(100);
    const afterUngroup = await getLayerChildren();
    const stillGroup = afterUngroup.find(c => c.tag === 'g');
    if (stillGroup) {
      bug('P1', 'ungroup', 'Ctrl+Shift+G did not remove the group', '');
    } else {
      log.push(`    Ungroup OK: ${afterUngroup.length} elements`);
    }
  }

  // Undo ungroup and undo group to restore original state
  await pressKey('Control+z'); // undo ungroup
  await pressKey('Control+z'); // undo group

  // Test 4.5: Nudge with arrow keys
  log.push('  Test 4.5: Nudge R3 with arrow keys');
  await clickAt(ctm, 130, 32); // select R3
  const origX3 = parseFloat(await getElementAttr(ids[2], 'x'));
  await pressKey('ArrowRight');
  const nudgedX3 = parseFloat(await getElementAttr(ids[2], 'x'));
  const nudgeDelta = nudgedX3 - origX3;
  if (Math.abs(nudgeDelta - 1) > 0.1) {
    bug('P2', 'nudge', `Arrow nudge moved ${nudgeDelta.toFixed(2)}mm, expected 1mm`, '');
  } else {
    log.push(`    Nudge right: ${origX3.toFixed(1)} -> ${nudgedX3.toFixed(1)} (delta=${nudgeDelta.toFixed(2)}mm)`);
  }
  await pressKey('Control+z');

  // Test 4.6: Shift+Arrow nudge (10mm)
  log.push('  Test 4.6: Shift+nudge R3');
  await clickAt(ctm, 130, 32);
  const origX3b = parseFloat(await getElementAttr(ids[2], 'x'));
  await pressKey('Shift+ArrowDown');
  const nudgedY3 = parseFloat(await getElementAttr(ids[2], 'y'));
  const origY3b = parseFloat(children[2].attrs.y);
  const bigNudge = nudgedY3 - origY3b;
  if (Math.abs(bigNudge - 10) > 0.5) {
    bug('P2', 'nudge', `Shift+Arrow nudge moved ${bigNudge.toFixed(1)}mm, expected 10mm`, '');
  } else {
    log.push(`    Shift+nudge down: delta=${bigNudge.toFixed(1)}mm`);
  }
  await pressKey('Control+z');

  // Test 4.7: Ctrl+A select all
  log.push('  Test 4.7: Ctrl+A select all');
  await pressKey('Control+a');
  sel = await selectionCount();
  const expected = (await getLayerChildren()).length;
  if (sel !== expected) {
    bug('P2', 'select-all', `Ctrl+A selected ${sel}, expected ${expected}`, '');
  } else {
    log.push(`    Ctrl+A: selected ${sel}/${expected} elements`);
  }

  // Deselect
  await clickAt(ctm, 105, 130); // empty area

  // Test 4.8: Duplicate (Ctrl+D)
  log.push('  Test 4.8: Duplicate R4');
  await clickAt(ctm, 180, 32);
  const beforeDup = (await getLayerChildren()).length;
  await pressKey('Control+d');
  const afterDup = (await getLayerChildren()).length;
  if (afterDup !== beforeDup + 1) {
    bug('P1', 'duplicate', `Duplicate: ${beforeDup} -> ${afterDup}, expected +1`, '');
  } else {
    log.push(`    Duplicate: ${beforeDup} -> ${afterDup}`);
  }
  await pressKey('Control+z');

  // ===== PHASE 5: Draw with different tools =====
  log.push('\n=== PHASE 5: Draw with other tools ===');

  // Ellipse tool
  log.push('  Test 5.1: Draw ellipse');
  await pressKey('e');
  await drawRect(ctm, 10, 70, 50, 115);
  const ellipseCheck = await getLayerChildren();
  const lastEl = ellipseCheck[ellipseCheck.length - 1];
  if (lastEl.tag !== 'ellipse') {
    bug('P1', 'ellipse-tool', `Ellipse tool created ${lastEl.tag}, expected ellipse`, '');
  } else {
    log.push(`    Ellipse: cx=${lastEl.attrs.cx}, cy=${lastEl.attrs.cy}, rx=${lastEl.attrs.rx}, ry=${lastEl.attrs.ry}`);
  }
  await pressKey('Control+z');

  // Line tool
  log.push('  Test 5.2: Draw line');
  await pressKey('l');
  const lStart = toScreen(ctm, 10, 70);
  const lEnd = toScreen(ctm, 200, 70);
  await page.mouse.click(lStart.x, lStart.y);
  await page.waitForTimeout(100);
  await page.mouse.click(lEnd.x, lEnd.y);
  await page.waitForTimeout(100);

  const lineCheck = await getLayerChildren();
  const lastLine = lineCheck[lineCheck.length - 1];
  if (lastLine.tag !== 'line') {
    bug('P1', 'line-tool', `Line tool created ${lastLine.tag}, expected line`, '');
  } else {
    log.push(`    Line: (${lastLine.attrs.x1},${lastLine.attrs.y1}) to (${lastLine.attrs.x2},${lastLine.attrs.y2})`);
  }
  await pressKey('Control+z');

  // Pen tool - draw a triangle path
  log.push('  Test 5.3: Draw path with pen tool');
  await pressKey('p');
  const pts = [[60, 70], [80, 115], [100, 70], [60, 70]]; // triangle
  for (const pt of pts) {
    const s = toScreen(ctm, pt[0], pt[1]);
    await page.mouse.click(s.x, s.y);
    await page.waitForTimeout(100);
  }
  // Press Escape or Enter to finish path
  await pressKey('Escape');

  const penCheck = await getLayerChildren();
  const lastPath = penCheck[penCheck.length - 1];
  if (!lastPath || lastPath.tag !== 'path') {
    // Pen tool might need different interaction
    log.push(`    Pen result: ${lastPath?.tag || 'nothing'} (may need different workflow)`);
    if (lastPath?.tag !== 'path') {
      bug('P2', 'pen-tool', `Pen tool did not create path, got ${lastPath?.tag}`, '');
    }
  } else {
    log.push(`    Path: d="${lastPath.attrs.d?.substring(0, 60)}..."`);
  }
  await pressKey('Control+z');

  // ===== PHASE 6: Stress-test property editing =====
  log.push('\n=== PHASE 6: Property editing stress test ===');

  // Select R1 and edit W/H via property panel
  await pressKey('v');
  await clickAt(ctm, 30, 32);

  log.push('  Test 6.1: Edit width via Properties panel');
  const origW = await getElementAttr(ids[0], 'width');
  try {
    const wInput = page.locator('input[aria-label="W"]');
    await wInput.click({ clickCount: 3 });
    await page.keyboard.type('60');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    const newW = await getElementAttr(ids[0], 'width');
    log.push(`    Width: ${origW} -> ${newW}`);
    if (Math.abs(parseFloat(newW) - 60) > 0.1) {
      bug('P2', 'property-edit', `Width set to ${newW}, expected 60`, '');
    }
  } catch (e) {
    bug('P2', 'property-edit', `Could not edit width: ${e.message.substring(0, 80)}`, '');
  }
  await pressKey('Control+z');

  // Test 6.2: Edit X position
  log.push('  Test 6.2: Edit X position via Properties panel');
  await clickAt(ctm, 30, 32);
  try {
    const xInput = page.locator('input[aria-label="X"]');
    await xInput.click({ clickCount: 3 });
    await page.keyboard.type('25');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    const newX = await getElementAttr(ids[0], 'x');
    log.push(`    X position: ${origX} -> ${newX}`);
    if (Math.abs(parseFloat(newX) - 25) > 0.5) {
      bug('P2', 'property-edit', `X set to ${newX}, expected 25`, '');
    }
  } catch (e) {
    bug('P2', 'property-edit', `Could not edit X: ${e.message.substring(0, 80)}`, '');
  }
  await pressKey('Control+z');

  // Test 6.3: Edit rotation via Properties panel
  log.push('  Test 6.3: Set rotation via Properties panel');
  await clickAt(ctm, 30, 32);
  try {
    const rotInput = page.locator('input[aria-label="Rot"]');
    await rotInput.click({ clickCount: 3 });
    await page.keyboard.type('45');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    const transform = await getElementAttr(ids[0], 'transform');
    log.push(`    Transform after 45deg: ${transform}`);
    if (!transform || !transform.includes('rotate')) {
      bug('P2', 'rotation', `Rotation not applied. transform=${transform}`, '');
    }
  } catch (e) {
    bug('P2', 'property-edit', `Could not set rotation: ${e.message.substring(0, 80)}`, '');
  }
  await pressKey('Control+z');

  // Test 6.4: Edit opacity
  log.push('  Test 6.4: Set opacity via Properties panel');
  await clickAt(ctm, 30, 32);
  try {
    const opaInput = page.locator('input[aria-label="Opa"]');
    await opaInput.click({ clickCount: 3 });
    await page.keyboard.type('0.5');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    const opacity = await getElementAttr(ids[0], 'opacity');
    log.push(`    Opacity: ${opacity}`);
    if (opacity !== '0.5') {
      bug('P2', 'opacity', `Opacity set to ${opacity}, expected 0.5`, '');
    }
  } catch (e) {
    bug('P2', 'property-edit', `Could not set opacity: ${e.message.substring(0, 80)}`, '');
  }
  await pressKey('Control+z');

  // Test 6.5: Change fill type to Solid
  log.push('  Test 6.5: Change fill to Solid');
  await clickAt(ctm, 30, 32);
  try {
    // The fill combobox
    const fillSelect = page.locator('select').filter({ has: page.locator('option:text("None")') }).filter({ has: page.locator('option:text("Solid")') }).filter({ has: page.locator('option:text("Linear Gradient")') }).first();
    await fillSelect.selectOption('Solid');
    await page.waitForTimeout(300);

    const fill = await getElementAttr(ids[0], 'fill');
    log.push(`    Fill after 'Solid': ${fill}`);
    if (fill === 'none') {
      bug('P2', 'fill-type', 'Fill type changed to Solid but fill attribute still none', '');
    }
  } catch (e) {
    log.push(`    Fill select error: ${e.message.substring(0, 100)}`);
  }
  await pressKey('Control+z');

  // Test 6.6: Change stroke-width
  log.push('  Test 6.6: Change stroke-width to 4');
  await clickAt(ctm, 30, 32);
  try {
    const swInput = page.locator('input[aria-label="SW"]');
    await swInput.click({ clickCount: 3 });
    await page.keyboard.type('4');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    const sw = await getElementAttr(ids[0], 'stroke-width');
    log.push(`    stroke-width: ${sw}`);
    if (sw !== '4') {
      bug('P2', 'stroke-width', `stroke-width=${sw}, expected 4`, '');
    }
  } catch (e) {
    bug('P2', 'property-edit', `Could not edit SW: ${e.message.substring(0, 80)}`, '');
  }
  await pressKey('Control+z');

  // Test 6.7: Change dash pattern
  log.push('  Test 6.7: Change dash pattern');
  await clickAt(ctm, 30, 32);
  try {
    const dashSelect = page.locator('select').filter({ has: page.locator('option:text("Dashed")') }).first();
    await dashSelect.selectOption('Dashed');
    await page.waitForTimeout(200);
    const dash = await getElementAttr(ids[0], 'stroke-dasharray');
    log.push(`    Dash: ${dash}`);
    if (!dash) {
      bug('P2', 'dash', 'Dash pattern not applied', '');
    }
  } catch (e) {
    log.push(`    Dash select error: ${e.message.substring(0, 80)}`);
  }
  await pressKey('Control+z');

  // ===== PHASE 7: Console errors check =====
  log.push('\n=== PHASE 7: Console errors ===');
  // This would need console monitoring, skip for now
  log.push('  (Console monitoring requires separate setup)');

  // ===== RESULTS =====
  log.push('\n=============================');
  log.push(`TOTAL BUGS FOUND: ${bugs.length}`);
  log.push('=============================');

  if (bugs.length > 0) {
    log.push('\nBUG LIST:');
    for (let i = 0; i < bugs.length; i++) {
      const b = bugs[i];
      log.push(`${i+1}. [${b.sev}] ${b.cat}: ${b.desc}`);
      if (b.details) log.push(`   Details: ${b.details}`);
    }
  }

  return log.join('\n');
}
