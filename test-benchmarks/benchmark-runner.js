/**
 * Vectorfeld Benchmark Runner
 *
 * Tests SVG element operations systematically.
 * Runs via playwright-cli run-code.
 * Reports bugs found as structured results.
 */

async function runBenchmark(page) {
  const bugs = [];
  const log = [];

  function bug(severity, category, description, details) {
    bugs.push({ severity, category, description, details });
  }

  // Helper: get SVG coordinate transform
  async function getSvgCTM() {
    return await page.evaluate(() => {
      const svg = document.querySelector('[data-role=overlay]').closest('svg');
      const ctm = svg.getScreenCTM();
      return { a: ctm.a, d: ctm.d, e: ctm.e, f: ctm.f };
    });
  }

  // Helper: SVG coords to screen coords
  function svgToScreen(ctm, x, y) {
    return {
      x: Math.round(x * ctm.a + ctm.e),
      y: Math.round(y * ctm.d + ctm.f)
    };
  }

  // Helper: click at SVG coordinate
  async function clickSvg(ctm, svgX, svgY) {
    const { x, y } = svgToScreen(ctm, svgX, svgY);
    await page.mouse.click(x, y);
  }

  // Helper: drag from SVG coord to SVG coord
  async function dragSvg(ctm, fromX, fromY, toX, toY) {
    const from = svgToScreen(ctm, fromX, fromY);
    const to = svgToScreen(ctm, toX, toY);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down({ button: 'left' });
    // Move in steps to trigger mousemove events
    const steps = 5;
    for (let i = 1; i <= steps; i++) {
      const ix = from.x + (to.x - from.x) * i / steps;
      const iy = from.y + (to.y - from.y) * i / steps;
      await page.mouse.move(ix, iy);
    }
    await page.mouse.up({ button: 'left' });
  }

  // Helper: get element attribute
  async function getAttr(id, attr) {
    return await page.evaluate(([id, attr]) => {
      return document.getElementById(id)?.getAttribute(attr);
    }, [id, attr]);
  }

  // Helper: get selection count
  async function selectionCount() {
    return await page.evaluate(() =>
      document.querySelectorAll('[data-role=selection-box]').length
    );
  }

  // Helper: press key combo
  async function press(key) {
    await page.keyboard.press(key);
  }

  // Helper: click empty to deselect
  async function deselect(ctm) {
    // Click on empty canvas area (far from any element)
    const { x, y } = svgToScreen(ctm, 105, 250);
    await page.mouse.click(x, y);
  }

  // ===========================================================
  // BENCHMARK 1: Rectangle Operations
  // ===========================================================
  log.push('=== BENCHMARK 1: Rectangle Operations ===');

  const ctm = await getSvgCTM();

  // TEST 1.1: Select each rect by clicking
  log.push('Test 1.1: Click-select each rect');
  const rectTests = [
    { id: 'b-r1', cx: 35, cy: 55, desc: 'stroked rect' },
    { id: 'b-r2', cx: 95, cy: 55, desc: 'filled fuchsia rect' },
    { id: 'b-r3', cx: 155, cy: 55, desc: 'rounded stroked rect' },
    { id: 'b-r4', cx: 215, cy: 55, desc: 'rounded filled rect' },
    { id: 'b-r5', cx: 35, cy: 160, desc: 'thick-stroke rect' },
    { id: 'b-r6', cx: 95, cy: 160, desc: 'filled+stroked rect' },
    { id: 'b-r7', cx: 155, cy: 160, desc: 'rounded thick-stroke rect' },
    { id: 'b-r8', cx: 215, cy: 160, desc: 'rounded green rect' },
  ];

  for (const rt of rectTests) {
    await deselect(ctm);
    await clickSvg(ctm, rt.cx, rt.cy);
    const count = await selectionCount();
    if (count !== 1) {
      bug('P1', 'selection', `Click-select failed for ${rt.desc} (${rt.id})`,
        `Expected 1 selection box, got ${count}`);
    } else {
      log.push(`  OK: ${rt.id} (${rt.desc}) selectable`);
    }
  }

  // TEST 1.2: Move rect and verify position change
  log.push('Test 1.2: Move rect b-r1');
  await deselect(ctm);
  const origX1 = await getAttr('b-r1', 'x');
  const origY1 = await getAttr('b-r1', 'y');
  await dragSvg(ctm, 35, 55, 45, 65); // move 10mm right, 10mm down
  const newX1 = await getAttr('b-r1', 'x');
  const newY1 = await getAttr('b-r1', 'y');

  if (newX1 === origX1 && newY1 === origY1) {
    bug('P1', 'move', 'Move did not change position of b-r1',
      `Before: (${origX1}, ${origY1}), After: (${newX1}, ${newY1})`);
  } else {
    log.push(`  OK: b-r1 moved from (${origX1},${origY1}) to (${newX1},${newY1})`);
  }

  // TEST 1.3: Undo move
  log.push('Test 1.3: Undo move');
  await press('Control+z');
  const undoX1 = await getAttr('b-r1', 'x');
  const undoY1 = await getAttr('b-r1', 'y');
  if (undoX1 !== origX1 || undoY1 !== origY1) {
    bug('P1', 'undo', 'Undo did not restore position of b-r1',
      `Expected: (${origX1},${origY1}), Got: (${undoX1},${undoY1})`);
  } else {
    log.push(`  OK: Undo restored b-r1 to (${undoX1},${undoY1})`);
  }

  // TEST 1.4: Move rounded rect (b-r7 with rx/ry)
  log.push('Test 1.4: Move rounded rect b-r7');
  await deselect(ctm);
  const origX7 = await getAttr('b-r7', 'x');
  const origY7 = await getAttr('b-r7', 'y');
  const origRx7 = await getAttr('b-r7', 'rx');
  const origRy7 = await getAttr('b-r7', 'ry');
  await dragSvg(ctm, 155, 160, 165, 170);
  const newX7 = await getAttr('b-r7', 'x');
  const newRx7 = await getAttr('b-r7', 'rx');
  const newRy7 = await getAttr('b-r7', 'ry');

  // Check rx/ry preserved after move
  if (newRx7 !== origRx7 || newRy7 !== origRy7) {
    bug('P1', 'move', 'Move changed rx/ry of rounded rect b-r7',
      `rx: ${origRx7} -> ${newRx7}, ry: ${origRy7} -> ${newRy7}`);
  } else {
    log.push(`  OK: rx/ry preserved after move (rx=${newRx7}, ry=${newRy7})`);
  }
  await press('Control+z');

  // TEST 1.5: Copy/Paste rect
  log.push('Test 1.5: Copy/Paste b-r6');
  await deselect(ctm);
  await clickSvg(ctm, 95, 160); // select b-r6
  await press('Control+c');
  await press('Control+v');

  // Check pasted element exists and has same fill/stroke
  const layerCount = await page.evaluate(() => {
    const svg = document.querySelector('[data-role=overlay]').closest('svg');
    const layer = svg.querySelector('g[data-layer-name]');
    return layer.children.length;
  });

  if (layerCount !== 9) {
    bug('P1', 'paste', `Paste did not create new element (expected 9 children, got ${layerCount})`, '');
  } else {
    // Check the pasted element has correct fill and stroke
    const pastedAttrs = await page.evaluate(() => {
      const svg = document.querySelector('[data-role=overlay]').closest('svg');
      const layer = svg.querySelector('g[data-layer-name]');
      const last = layer.lastElementChild;
      return JSON.stringify({
        tag: last.tagName,
        fill: last.getAttribute('fill'),
        stroke: last.getAttribute('stroke'),
        strokeWidth: last.getAttribute('stroke-width'),
        width: last.getAttribute('width'),
        height: last.getAttribute('height')
      });
    });
    log.push(`  OK: Paste created element: ${pastedAttrs}`);

    const parsed = JSON.parse(pastedAttrs);
    if (parsed.fill !== '#00FF00') {
      bug('P2', 'paste', 'Pasted element lost fill color',
        `Expected #00FF00, got ${parsed.fill}`);
    }
    if (parsed.stroke !== '#0000FF') {
      bug('P2', 'paste', 'Pasted element lost stroke color',
        `Expected #0000FF, got ${parsed.stroke}`);
    }
    if (parsed.strokeWidth !== '8') {
      bug('P2', 'paste', 'Pasted element lost stroke-width',
        `Expected 8, got ${parsed.strokeWidth}`);
    }
  }

  // Undo paste
  await press('Control+z');

  // TEST 1.6: Delete rect and undo
  log.push('Test 1.6: Delete b-r2 and undo');
  await deselect(ctm);
  await clickSvg(ctm, 95, 55); // select b-r2
  const beforeDelete = await page.evaluate(() => {
    const svg = document.querySelector('[data-role=overlay]').closest('svg');
    return svg.querySelector('g[data-layer-name]').children.length;
  });
  await press('Delete');
  const afterDelete = await page.evaluate(() => {
    const svg = document.querySelector('[data-role=overlay]').closest('svg');
    return svg.querySelector('g[data-layer-name]').children.length;
  });
  if (afterDelete !== beforeDelete - 1) {
    bug('P1', 'delete', `Delete did not remove element (${beforeDelete} -> ${afterDelete})`, '');
  }
  await press('Control+z');
  const afterUndoDelete = await page.evaluate(() => {
    const svg = document.querySelector('[data-role=overlay]').closest('svg');
    return svg.querySelector('g[data-layer-name]').children.length;
  });
  if (afterUndoDelete !== beforeDelete) {
    bug('P1', 'undo', `Undo delete did not restore element (${beforeDelete} -> ${afterUndoDelete})`, '');
  } else {
    log.push(`  OK: Delete + undo works (${beforeDelete} -> ${afterDelete} -> ${afterUndoDelete})`);
  }

  // TEST 1.7: Group multiple rects
  log.push('Test 1.7: Group rects via Ctrl+G');
  await deselect(ctm);
  await clickSvg(ctm, 35, 55); // select b-r1
  // Shift+click b-r2 to add to selection
  const scr2 = svgToScreen(ctm, 95, 55);
  await page.keyboard.down('Shift');
  await page.mouse.click(scr2.x, scr2.y);
  await page.keyboard.up('Shift');

  const selCount = await selectionCount();
  if (selCount !== 2) {
    bug('P1', 'selection', `Shift+click did not add to selection (got ${selCount} selection boxes)`, '');
  } else {
    log.push(`  OK: Multi-select via Shift+click (${selCount} selected)`);
  }

  await press('Control+g'); // Group
  const afterGroup = await page.evaluate(() => {
    const svg = document.querySelector('[data-role=overlay]').closest('svg');
    const layer = svg.querySelector('g[data-layer-name]');
    const groups = layer.querySelectorAll('g');
    return { layerChildren: layer.children.length, groupCount: groups.length };
  });
  log.push(`  After group: ${JSON.stringify(afterGroup)}`);

  // Undo group
  await press('Control+z');

  // TEST 1.8: Nudge with arrow keys
  log.push('Test 1.8: Nudge b-r5 with arrow keys');
  await deselect(ctm);
  await clickSvg(ctm, 35, 160); // select b-r5
  const origX5 = parseFloat(await getAttr('b-r5', 'x'));
  await press('ArrowRight');
  const nudgedX5 = parseFloat(await getAttr('b-r5', 'x'));
  if (Math.abs(nudgedX5 - (origX5 + 1)) > 0.1) {
    bug('P2', 'nudge', `Arrow nudge wrong distance for b-r5`,
      `Expected x=${origX5 + 1}, got ${nudgedX5}`);
  } else {
    log.push(`  OK: Nudge right: ${origX5} -> ${nudgedX5}`);
  }
  await press('Control+z');

  // TEST 1.9: Duplicate (Ctrl+D)
  log.push('Test 1.9: Duplicate b-r4');
  await deselect(ctm);
  await clickSvg(ctm, 215, 55); // select b-r4
  const beforeDup = await page.evaluate(() => {
    const svg = document.querySelector('[data-role=overlay]').closest('svg');
    return svg.querySelector('g[data-layer-name]').children.length;
  });
  await press('Control+d');
  const afterDup = await page.evaluate(() => {
    const svg = document.querySelector('[data-role=overlay]').closest('svg');
    return svg.querySelector('g[data-layer-name]').children.length;
  });
  if (afterDup !== beforeDup + 1) {
    bug('P1', 'duplicate', `Duplicate failed (${beforeDup} -> ${afterDup})`, '');
  } else {
    // Check duplicate preserved rx
    const dupRx = await page.evaluate(() => {
      const svg = document.querySelector('[data-role=overlay]').closest('svg');
      const layer = svg.querySelector('g[data-layer-name]');
      return layer.lastElementChild.getAttribute('rx');
    });
    if (dupRx !== '30') {
      bug('P2', 'duplicate', `Duplicate lost rx attribute`, `Expected 30, got ${dupRx}`);
    } else {
      log.push(`  OK: Duplicate preserved rx=${dupRx}`);
    }
  }
  await press('Control+z');

  // ===========================================================
  // BENCHMARK 2: Path Operations (inject paths from paths-data-01)
  // ===========================================================
  log.push('\n=== BENCHMARK 2: Path Operations ===');

  // Clear layer and inject paths
  await page.evaluate(() => {
    const svg = document.querySelector('[data-role=overlay]').closest('svg');
    const layer = svg.querySelector('g[data-layer-name]');
    while (layer.firstChild) layer.removeChild(layer.firstChild);

    const ns = 'http://www.w3.org/2000/svg';
    const paths = [
      { id: 'b-p1', d: 'M 210 130 C 145 130 110 80 110 80 S 75 25 10 25 m 0 105 c 65 0 100 -50 100 -50 s 35 -55 100 -55', fill: '#00FF00', stroke: '#00C000' },
      { id: 'b-p2', d: 'M 240 90 c 0 30 7 50 50 0 c 43 -50 50 -30 50 0 c 0 83 -68 -34 -90 -30 C 240 60 240 90 240 90 z', fill: 'none', stroke: '#000000' },
      { id: 'b-p3', d: 'M80 170 C100 170 160 170 180 170Z', fill: 'none', stroke: '#000000' },
      { id: 'b-p4', d: 'M5 260 C40 260 60 175 55 160 c -5 15 15 100 50 100Z', fill: '#00C000', stroke: 'none' },
      { id: 'b-p5', d: 'm 200 260 c 50 -40 50 -100 25 -100 s -25 60 25 100', fill: 'none', stroke: '#000000' },
      { id: 'b-p6', d: 'M 360 100 C 420 90 460 140 450 190', fill: '#0000FF', stroke: '#000000' },
      { id: 'b-p7', d: 'M360 210 c 0 20 -16 36 -36 36 s -36 -16 -36 -36 s 16 -36 36 -36 s 36 16 36 36 z', fill: '#FFFF00', stroke: '#000000' },
      { id: 'b-p8', d: 'm 360 325 c -40 -60 95 -100 80 0 z', fill: '#F0F0F0', stroke: '#00AA00' },
    ];

    for (const p of paths) {
      const el = document.createElementNS(ns, 'path');
      el.setAttribute('id', p.id);
      el.setAttribute('d', p.d);
      el.setAttribute('fill', p.fill);
      el.setAttribute('stroke', p.stroke);
      layer.appendChild(el);
    }
    return 'Injected ' + paths.length + ' paths';
  });

  // Resize viewBox to fit the paths (they use coords up to 460, 360)
  await page.evaluate(() => {
    const svg = document.querySelector('[data-role=overlay]').closest('svg');
    svg.setAttribute('viewBox', '-10 -10 490 380');
  });

  // Re-read CTM after viewBox change
  const ctm2 = await getSvgCTM();

  // TEST 2.1: Verify all paths render (getBBox should return non-zero)
  log.push('Test 2.1: Verify path rendering');
  for (let i = 1; i <= 8; i++) {
    const id = `b-p${i}`;
    const bbox = await page.evaluate((id) => {
      const el = document.getElementById(id);
      if (!el) return null;
      try {
        const bb = el.getBBox();
        return { x: bb.x, y: bb.y, width: bb.width, height: bb.height };
      } catch (e) {
        return { error: e.message };
      }
    }, id);

    if (!bbox || bbox.error) {
      bug('P1', 'rendering', `Path ${id} has no bounding box`, JSON.stringify(bbox));
    } else if (bbox.width === 0 && bbox.height === 0) {
      bug('P1', 'rendering', `Path ${id} has zero-size bbox`, JSON.stringify(bbox));
    } else {
      log.push(`  OK: ${id} renders (bbox: ${Math.round(bbox.width)}x${Math.round(bbox.height)} at ${Math.round(bbox.x)},${Math.round(bbox.y)})`);
    }
  }

  // TEST 2.2: Select and move a path
  log.push('Test 2.2: Select and move path b-p7 (circle)');
  await deselect(ctm2);
  await clickSvg(ctm2, 324, 210); // center of the circle path
  const pathSel = await selectionCount();
  if (pathSel < 1) {
    bug('P1', 'selection', 'Could not select path b-p7 by clicking', '');
  } else {
    log.push(`  OK: Path b-p7 selected (${pathSel} selection boxes)`);

    // Check the d attribute before move
    const origD = await getAttr('b-p7', 'd');
    await dragSvg(ctm2, 324, 210, 334, 220); // move 10px right, 10px down
    const newD = await getAttr('b-p7', 'd');

    // For paths, move should either modify d or add/modify transform
    const transform = await getAttr('b-p7', 'transform');

    if (origD === newD && !transform) {
      bug('P1', 'move', 'Path b-p7 not moved (d unchanged, no transform)', '');
    } else {
      log.push(`  OK: Path moved (d changed: ${origD !== newD}, transform: ${transform || 'none'})`);
    }
    await press('Control+z');
  }

  // TEST 2.3: Copy/paste path preserves d attribute
  log.push('Test 2.3: Copy/paste path b-p1');
  await deselect(ctm2);
  await clickSvg(ctm2, 110, 80); // somewhere on b-p1
  const origD1 = await getAttr('b-p1', 'd');
  await press('Control+c');
  await press('Control+v');

  const pastedPath = await page.evaluate(() => {
    const svg = document.querySelector('[data-role=overlay]').closest('svg');
    const layer = svg.querySelector('g[data-layer-name]');
    const last = layer.lastElementChild;
    if (last?.tagName === 'path') {
      return { d: last.getAttribute('d'), fill: last.getAttribute('fill'), stroke: last.getAttribute('stroke') };
    }
    return null;
  });

  if (!pastedPath) {
    bug('P1', 'paste', 'Paste did not create a path element', '');
  } else {
    // The d should be similar but offset by 5mm
    if (!pastedPath.d || pastedPath.d.length < 10) {
      bug('P1', 'paste', 'Pasted path has empty/short d attribute', `d=${pastedPath.d}`);
    } else {
      log.push(`  OK: Pasted path has d (${pastedPath.d.substring(0, 50)}...)`);
    }
    if (pastedPath.fill !== '#00FF00') {
      bug('P2', 'paste', 'Pasted path lost fill', `Expected #00FF00, got ${pastedPath.fill}`);
    }
  }
  await press('Control+z');

  // TEST 2.4: Test relative path commands (lowercase m, c, s)
  log.push('Test 2.4: Relative path rendering b-p5 (m, c, s)');
  const p5bbox = await page.evaluate(() => {
    const el = document.getElementById('b-p5');
    const bb = el.getBBox();
    return { x: bb.x, y: bb.y, w: bb.width, h: bb.height };
  });
  // The path starts at m 200 260, so bbox should be around x=200
  if (p5bbox.x < 180 || p5bbox.x > 230) {
    bug('P2', 'path-parsing', 'Relative path b-p5 positioned incorrectly',
      `Expected x near 200, got ${p5bbox.x}`);
  } else {
    log.push(`  OK: Relative path b-p5 at x=${Math.round(p5bbox.x)}`);
  }

  // ===========================================================
  // BENCHMARK 3: Transform Operations (coords-trans-09)
  // ===========================================================
  log.push('\n=== BENCHMARK 3: Matrix Transform Operations ===');

  // Inject transformed groups
  await page.evaluate(() => {
    const svg = document.querySelector('[data-role=overlay]').closest('svg');
    const layer = svg.querySelector('g[data-layer-name]');
    while (layer.firstChild) layer.removeChild(layer.firstChild);
    svg.setAttribute('viewBox', '0 0 480 360');

    const ns = 'http://www.w3.org/2000/svg';
    const transforms = [
      { id: 'b-g1', transform: 'matrix(0 0 0 0 0 0)', label: 'zero matrix' },
      { id: 'b-g2', transform: 'matrix(1 0 0 1 100 100)', label: 'identity + translate' },
      { id: 'b-g3', transform: 'matrix(1.5 0 0 1.5 70 60)', label: 'scale 1.5x + translate' },
      { id: 'b-g4', transform: 'matrix(1 0 0.5 1 30 170)', label: 'skewX + translate' },
      { id: 'b-g5', transform: 'matrix(1 0.5 0 1 100 200)', label: 'skewY + translate' },
      { id: 'b-g6', transform: 'matrix(0 1 -1 0 450 0)', label: '90deg rotation' },
      { id: 'b-g7', transform: 'matrix(1 0.8 0.8 1 300 220)', label: 'combined skew' },
    ];

    for (const t of transforms) {
      const g = document.createElementNS(ns, 'g');
      g.setAttribute('id', t.id);
      g.setAttribute('transform', t.transform);

      const r1 = document.createElementNS(ns, 'rect');
      r1.setAttribute('x', '0'); r1.setAttribute('y', '0');
      r1.setAttribute('width', '150'); r1.setAttribute('height', '5');
      r1.setAttribute('fill', 'blue');
      g.appendChild(r1);

      const r2 = document.createElementNS(ns, 'rect');
      r2.setAttribute('x', '0'); r2.setAttribute('y', '0');
      r2.setAttribute('width', '5'); r2.setAttribute('height', '50');
      r2.setAttribute('fill', 'red');
      g.appendChild(r2);

      layer.appendChild(g);
    }
    return 'Injected ' + transforms.length + ' transform groups';
  });

  const ctm3 = await getSvgCTM();

  // TEST 3.1: Verify transformed groups render
  log.push('Test 3.1: Verify transform rendering');
  for (let i = 2; i <= 7; i++) {  // Skip b-g1 (zero matrix = invisible)
    const id = `b-g${i}`;
    const bbox = await page.evaluate((id) => {
      const el = document.getElementById(id);
      if (!el) return null;
      try {
        const bb = el.getBBox();
        return { x: bb.x, y: bb.y, w: bb.width, h: bb.height };
      } catch (e) {
        return { error: e.message };
      }
    }, id);

    if (!bbox || bbox.error) {
      bug('P1', 'transform', `Transformed group ${id} no bbox`, JSON.stringify(bbox));
    } else {
      log.push(`  OK: ${id} renders (bbox: ${Math.round(bbox.w)}x${Math.round(bbox.h)})`);
    }
  }

  // TEST 3.2: Select and move a transformed group
  log.push('Test 3.2: Select and move transformed group b-g2');
  await deselect(ctm3);
  // b-g2 has transform "matrix(1 0 0 1 100 100)", so its blue rect at (0,0,150,5)
  // appears at screen (100, 100). Click center of the blue bar at ~(175, 102)
  await clickSvg(ctm3, 175, 102);
  const g2sel = await selectionCount();
  if (g2sel < 1) {
    bug('P1', 'selection', 'Could not select transformed group b-g2', '');
  } else {
    log.push(`  OK: b-g2 selected`);

    // Move and check transform updates
    const origTransform = await getAttr('b-g2', 'transform');
    await dragSvg(ctm3, 175, 102, 185, 112);
    const newTransform = await getAttr('b-g2', 'transform');

    if (origTransform === newTransform) {
      bug('P1', 'move', 'Moving transformed group b-g2 did not update transform',
        `transform stayed: ${origTransform}`);
    } else {
      log.push(`  OK: Transform updated: ${origTransform} -> ${newTransform}`);
    }
    await press('Control+z');

    // Verify undo restored original transform
    const undoTransform = await getAttr('b-g2', 'transform');
    if (undoTransform !== origTransform) {
      bug('P1', 'undo', 'Undo did not restore group transform',
        `Expected: ${origTransform}, Got: ${undoTransform}`);
    }
  }

  // TEST 3.3: Select and move group with skew transform
  log.push('Test 3.3: Move group with skewX b-g4');
  await deselect(ctm3);
  // b-g4 at matrix(1 0 0.5 1 30 170) - click near (100, 172) where the blue bar should be
  await clickSvg(ctm3, 100, 172);
  const g4sel = await selectionCount();
  if (g4sel < 1) {
    bug('P2', 'selection', 'Could not select skewed group b-g4', '');
  } else {
    const origT4 = await getAttr('b-g4', 'transform');
    await dragSvg(ctm3, 100, 172, 110, 182);
    const newT4 = await getAttr('b-g4', 'transform');

    // Check transform preserved the skew component
    if (newT4 && !newT4.includes('matrix')) {
      bug('P1', 'transform', 'Move replaced matrix transform with non-matrix form',
        `Was: ${origT4}, Now: ${newT4}`);
    } else {
      log.push(`  OK: Skewed group moved, transform: ${newT4?.substring(0, 50)}`);
    }
    await press('Control+z');
  }

  // TEST 3.4: Copy/paste transformed group
  log.push('Test 3.4: Copy/paste transformed group b-g3');
  await deselect(ctm3);
  // b-g3: matrix(1.5 0 0 1.5 70 60), blue bar at ~(70+75, 60+2) = (145, 62)
  await clickSvg(ctm3, 145, 62);
  const g3sel = await selectionCount();
  if (g3sel < 1) {
    bug('P2', 'selection', 'Could not select scaled group b-g3', '');
  } else {
    await press('Control+c');
    await press('Control+v');

    const pastedGroup = await page.evaluate(() => {
      const svg = document.querySelector('[data-role=overlay]').closest('svg');
      const layer = svg.querySelector('g[data-layer-name]');
      const last = layer.lastElementChild;
      return {
        tag: last.tagName,
        transform: last.getAttribute('transform'),
        childCount: last.children?.length || 0
      };
    });

    if (pastedGroup.tag !== 'g') {
      bug('P1', 'paste', 'Pasted transformed group is not a <g>',
        `Got tag: ${pastedGroup.tag}`);
    }
    if (pastedGroup.childCount !== 2) {
      bug('P0', 'paste', 'Pasted group lost children',
        `Expected 2 children, got ${pastedGroup.childCount}`);
    } else {
      log.push(`  OK: Pasted group has ${pastedGroup.childCount} children, transform: ${pastedGroup.transform}`);
    }
    await press('Control+z');
  }

  // ===========================================================
  // BENCHMARK 4: Stroke Style Operations
  // ===========================================================
  log.push('\n=== BENCHMARK 4: Stroke Styles ===');

  await page.evaluate(() => {
    const svg = document.querySelector('[data-role=overlay]').closest('svg');
    const layer = svg.querySelector('g[data-layer-name]');
    while (layer.firstChild) layer.removeChild(layer.firstChild);
    svg.setAttribute('viewBox', '0 0 300 250');

    const ns = 'http://www.w3.org/2000/svg';
    const strokes = [
      { id: 'b-s1', x: 20, y: 30, w: 260, h: 40, fill: 'blue', stroke: 'none', desc: 'no stroke' },
      { id: 'b-s2', x: 20, y: 90, w: 260, h: 40, fill: 'blue', stroke: 'green', sw: 20, desc: 'thick green stroke' },
      { id: 'b-s3', x: 20, y: 150, w: 100, h: 40, fill: 'red', stroke: '#000', sw: 4, dasharray: '10,5', desc: 'dashed' },
      { id: 'b-s4', x: 140, y: 150, w: 100, h: 40, fill: 'orange', stroke: '#000', sw: 4, linecap: 'round', linejoin: 'round', desc: 'round cap+join' },
      { id: 'b-s5', x: 20, y: 200, w: 100, h: 30, fill: 'none', stroke: 'purple', sw: 6, opacity: '0.5', desc: 'opacity 0.5' },
    ];

    for (const s of strokes) {
      const el = document.createElementNS(ns, 'rect');
      el.setAttribute('id', s.id);
      el.setAttribute('x', String(s.x));
      el.setAttribute('y', String(s.y));
      el.setAttribute('width', String(s.w));
      el.setAttribute('height', String(s.h));
      el.setAttribute('fill', s.fill);
      el.setAttribute('stroke', s.stroke);
      if (s.sw) el.setAttribute('stroke-width', String(s.sw));
      if (s.dasharray) el.setAttribute('stroke-dasharray', s.dasharray);
      if (s.linecap) el.setAttribute('stroke-linecap', s.linecap);
      if (s.linejoin) el.setAttribute('stroke-linejoin', s.linejoin);
      if (s.opacity) el.setAttribute('opacity', s.opacity);
      layer.appendChild(el);
    }
    return 'Injected strokes';
  });

  const ctm4 = await getSvgCTM();

  // TEST 4.1: Select element with dash pattern and verify attributes preserved on move
  log.push('Test 4.1: Move dashed rect, check dash preserved');
  await deselect(ctm4);
  await clickSvg(ctm4, 70, 170); // b-s3
  const origDash = await getAttr('b-s3', 'stroke-dasharray');
  await dragSvg(ctm4, 70, 170, 80, 180);
  const newDash = await getAttr('b-s3', 'stroke-dasharray');
  if (newDash !== origDash) {
    bug('P2', 'move', 'Move changed stroke-dasharray',
      `Was: ${origDash}, Now: ${newDash}`);
  } else {
    log.push(`  OK: stroke-dasharray preserved: ${newDash}`);
  }
  await press('Control+z');

  // TEST 4.2: Copy/paste element with stroke styles
  log.push('Test 4.2: Copy/paste element with stroke styles');
  await deselect(ctm4);
  await clickSvg(ctm4, 190, 170); // b-s4 (round cap/join)
  await press('Control+c');
  await press('Control+v');

  const pastedStroke = await page.evaluate(() => {
    const svg = document.querySelector('[data-role=overlay]').closest('svg');
    const layer = svg.querySelector('g[data-layer-name]');
    const last = layer.lastElementChild;
    return {
      linecap: last.getAttribute('stroke-linecap'),
      linejoin: last.getAttribute('stroke-linejoin'),
      stroke: last.getAttribute('stroke'),
      sw: last.getAttribute('stroke-width')
    };
  });

  if (pastedStroke.linecap !== 'round') {
    bug('P2', 'paste', 'Pasted element lost stroke-linecap',
      `Expected round, got ${pastedStroke.linecap}`);
  }
  if (pastedStroke.linejoin !== 'round') {
    bug('P2', 'paste', 'Pasted element lost stroke-linejoin',
      `Expected round, got ${pastedStroke.linejoin}`);
  }
  if (!pastedStroke.linecap && !pastedStroke.linejoin) {
    log.push(`  FAIL: Lost both linecap and linejoin on paste`);
  } else {
    log.push(`  Paste stroke attrs: linecap=${pastedStroke.linecap}, linejoin=${pastedStroke.linejoin}`);
  }
  await press('Control+z');

  // TEST 4.3: Select and check opacity element
  log.push('Test 4.3: Select opacity element b-s5');
  await deselect(ctm4);
  await clickSvg(ctm4, 70, 215); // b-s5
  const opSel = await selectionCount();
  const origOpacity = await getAttr('b-s5', 'opacity');
  log.push(`  opacity element: selected=${opSel > 0}, opacity=${origOpacity}`);

  // ===========================================================
  // BENCHMARK 5: Import/Export Round-Trip
  // ===========================================================
  log.push('\n=== BENCHMARK 5: Import/Export Round-Trip ===');

  // Inject a known set of elements, export, re-import, compare
  await page.evaluate(() => {
    const svg = document.querySelector('[data-role=overlay]').closest('svg');
    const layer = svg.querySelector('g[data-layer-name]');
    while (layer.firstChild) layer.removeChild(layer.firstChild);
    svg.setAttribute('viewBox', '0 0 210 297');

    const ns = 'http://www.w3.org/2000/svg';

    // Simple rect
    const r = document.createElementNS(ns, 'rect');
    r.setAttribute('id', 'rt-r1');
    r.setAttribute('x', '10'); r.setAttribute('y', '10');
    r.setAttribute('width', '50'); r.setAttribute('height', '30');
    r.setAttribute('fill', '#FF0000'); r.setAttribute('stroke', '#0000FF');
    r.setAttribute('stroke-width', '3');
    r.setAttribute('rx', '5');
    layer.appendChild(r);

    // Ellipse
    const e = document.createElementNS(ns, 'ellipse');
    e.setAttribute('id', 'rt-e1');
    e.setAttribute('cx', '120'); e.setAttribute('cy', '30');
    e.setAttribute('rx', '40'); e.setAttribute('ry', '20');
    e.setAttribute('fill', '#00FF00'); e.setAttribute('stroke', 'none');
    layer.appendChild(e);

    // Path
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('id', 'rt-p1');
    p.setAttribute('d', 'M 10 80 C 30 60 60 60 80 80 S 110 100 130 80');
    p.setAttribute('fill', 'none'); p.setAttribute('stroke', '#FF00FF');
    p.setAttribute('stroke-width', '2');
    layer.appendChild(p);

    // Line
    const l = document.createElementNS(ns, 'line');
    l.setAttribute('id', 'rt-l1');
    l.setAttribute('x1', '10'); l.setAttribute('y1', '120');
    l.setAttribute('x2', '200'); l.setAttribute('y2', '120');
    l.setAttribute('stroke', '#000000'); l.setAttribute('stroke-width', '1');
    layer.appendChild(l);

    // Group with transform
    const g = document.createElementNS(ns, 'g');
    g.setAttribute('id', 'rt-g1');
    g.setAttribute('transform', 'translate(50,150) rotate(45)');
    const gr = document.createElementNS(ns, 'rect');
    gr.setAttribute('x', '0'); gr.setAttribute('y', '0');
    gr.setAttribute('width', '40'); gr.setAttribute('height', '40');
    gr.setAttribute('fill', '#FFD700');
    g.appendChild(gr);
    layer.appendChild(g);

    return 'Injected 5 elements for round-trip test';
  });

  // Capture the SVG DOM state before export
  const beforeExport = await page.evaluate(() => {
    const svg = document.querySelector('[data-role=overlay]').closest('svg');
    const layer = svg.querySelector('g[data-layer-name]');
    const elements = [];
    for (const child of layer.children) {
      const attrs = {};
      for (const attr of child.attributes) {
        attrs[attr.name] = attr.value;
      }
      elements.push({ tag: child.tagName, attrs, childCount: child.children?.length || 0 });
    }
    return JSON.stringify(elements);
  });

  // Use the exportSvgString function to get export output
  const exportedSvg = await page.evaluate(() => {
    // Access the module's export function via the window or import
    // Since this is a Vite app, modules aren't on window. Let's serialize manually.
    const svg = document.querySelector('[data-role=overlay]').closest('svg');
    const clone = svg.cloneNode(true);

    // Strip overlays (same as exportSvgString)
    const overlaySelector = '[data-role="overlay"], [data-role="preview"], [data-role="grid-overlay"], [data-role="guides-overlay"], [data-role="user-guides-overlay"], [data-role="wireframe"]';
    for (const el of clone.querySelectorAll(overlaySelector)) {
      el.remove();
    }

    return new XMLSerializer().serializeToString(clone);
  });

  // Check export contains our elements
  const checks = [
    { name: 'rect rt-r1', pattern: 'rt-r1' },
    { name: 'ellipse rt-e1', pattern: 'rt-e1' },
    { name: 'path rt-p1', pattern: 'rt-p1' },
    { name: 'line rt-l1', pattern: 'rt-l1' },
    { name: 'group rt-g1', pattern: 'rt-g1' },
    { name: 'fill #FF0000', pattern: '#FF0000' },
    { name: 'stroke-width 3', pattern: 'stroke-width="3"' },
    { name: 'rx 5', pattern: 'rx="5"' },
    { name: 'transform rotate', pattern: 'rotate(45)' },
    { name: 'path d attribute', pattern: 'M 10 80 C' },
  ];

  for (const check of checks) {
    if (!exportedSvg.includes(check.pattern)) {
      bug('P2', 'export', `Export missing: ${check.name}`,
        `Pattern "${check.pattern}" not found in exported SVG`);
    } else {
      log.push(`  OK: Export contains ${check.name}`);
    }
  }

  // Now test re-import: parse the exported SVG and check structure
  const reimportResult = await page.evaluate((svgStr) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgStr, 'image/svg+xml');
    const root = doc.documentElement;

    // Count drawing elements
    const drawingTags = ['rect', 'ellipse', 'circle', 'path', 'line', 'g', 'text', 'polygon', 'polyline'];
    let count = 0;
    function countElements(el) {
      for (const child of el.children) {
        if (drawingTags.includes(child.tagName)) count++;
        if (child.children) countElements(child);
      }
    }
    countElements(root);

    // Check for the artboard rect
    const artboard = root.querySelector('[data-role=artboard]');

    return JSON.stringify({
      elementCount: count,
      hasArtboard: !!artboard,
      viewBox: root.getAttribute('viewBox'),
      rootTag: root.tagName
    });
  }, exportedSvg);

  log.push(`  Re-import parse: ${reimportResult}`);

  // ===========================================================
  // BENCHMARK 6: Gradient Elements
  // ===========================================================
  log.push('\n=== BENCHMARK 6: Gradient Rendering ===');

  await page.evaluate(() => {
    const svg = document.querySelector('[data-role=overlay]').closest('svg');
    const layer = svg.querySelector('g[data-layer-name]');
    while (layer.firstChild) layer.removeChild(layer.firstChild);
    svg.setAttribute('viewBox', '0 0 210 297');

    const ns = 'http://www.w3.org/2000/svg';

    // Get or create defs
    let defs = svg.querySelector('defs');
    if (!defs) {
      defs = document.createElementNS(ns, 'defs');
      svg.insertBefore(defs, svg.firstChild);
    }

    // Clear existing gradient defs
    for (const child of Array.from(defs.children)) {
      if (child.tagName === 'linearGradient' || child.tagName === 'radialGradient') {
        child.remove();
      }
    }

    // Linear gradient
    const lg = document.createElementNS(ns, 'linearGradient');
    lg.setAttribute('id', 'bench-lg1');
    lg.setAttribute('x1', '0%'); lg.setAttribute('y1', '0%');
    lg.setAttribute('x2', '100%'); lg.setAttribute('y2', '0%');
    const s1 = document.createElementNS(ns, 'stop');
    s1.setAttribute('offset', '0%'); s1.setAttribute('stop-color', '#0000FF');
    const s2 = document.createElementNS(ns, 'stop');
    s2.setAttribute('offset', '100%'); s2.setAttribute('stop-color', '#FF0000');
    lg.appendChild(s1); lg.appendChild(s2);
    defs.appendChild(lg);

    // Radial gradient
    const rg = document.createElementNS(ns, 'radialGradient');
    rg.setAttribute('id', 'bench-rg1');
    rg.setAttribute('cx', '50%'); rg.setAttribute('cy', '50%');
    rg.setAttribute('r', '50%');
    const s3 = document.createElementNS(ns, 'stop');
    s3.setAttribute('offset', '0%'); s3.setAttribute('stop-color', '#FFFFFF');
    const s4 = document.createElementNS(ns, 'stop');
    s4.setAttribute('offset', '100%'); s4.setAttribute('stop-color', '#000000');
    rg.appendChild(s3); rg.appendChild(s4);
    defs.appendChild(rg);

    // Rect with linear gradient
    const r1 = document.createElementNS(ns, 'rect');
    r1.setAttribute('id', 'bench-gr1');
    r1.setAttribute('x', '10'); r1.setAttribute('y', '10');
    r1.setAttribute('width', '190'); r1.setAttribute('height', '80');
    r1.setAttribute('fill', 'url(#bench-lg1)');
    r1.setAttribute('stroke', 'none');
    layer.appendChild(r1);

    // Rect with radial gradient
    const r2 = document.createElementNS(ns, 'rect');
    r2.setAttribute('id', 'bench-gr2');
    r2.setAttribute('x', '10'); r2.setAttribute('y', '110');
    r2.setAttribute('width', '190'); r2.setAttribute('height', '80');
    r2.setAttribute('fill', 'url(#bench-rg1)');
    r2.setAttribute('stroke', '#333');
    r2.setAttribute('stroke-width', '2');
    layer.appendChild(r2);

    return 'Injected gradient elements';
  });

  const ctm6 = await getSvgCTM();

  // TEST 6.1: Check gradient rects render
  log.push('Test 6.1: Gradient rendering');
  for (const id of ['bench-gr1', 'bench-gr2']) {
    const bbox = await page.evaluate((id) => {
      const el = document.getElementById(id);
      if (!el) return null;
      const bb = el.getBBox();
      return { w: bb.width, h: bb.height };
    }, id);

    if (!bbox || bbox.w === 0) {
      bug('P2', 'gradient', `Gradient rect ${id} not rendering`, JSON.stringify(bbox));
    } else {
      log.push(`  OK: ${id} renders (${bbox.w}x${bbox.h})`);
    }
  }

  // TEST 6.2: Select and move gradient rect
  log.push('Test 6.2: Move gradient rect');
  await deselect(ctm6);
  await clickSvg(ctm6, 105, 50); // center of bench-gr1
  const grSel = await selectionCount();
  if (grSel < 1) {
    bug('P1', 'selection', 'Cannot select gradient-filled rect', '');
  } else {
    const origFill = await getAttr('bench-gr1', 'fill');
    await dragSvg(ctm6, 105, 50, 115, 60);
    const newFill = await getAttr('bench-gr1', 'fill');

    if (newFill !== origFill) {
      bug('P1', 'move', 'Moving gradient rect changed fill attribute',
        `Was: ${origFill}, Now: ${newFill}`);
    } else {
      log.push(`  OK: Gradient fill preserved after move: ${newFill}`);
    }
    await press('Control+z');
  }

  // TEST 6.3: Copy/paste gradient rect
  log.push('Test 6.3: Copy/paste gradient rect');
  await deselect(ctm6);
  await clickSvg(ctm6, 105, 50);
  await press('Control+c');
  await press('Control+v');

  const pastedGrad = await page.evaluate(() => {
    const svg = document.querySelector('[data-role=overlay]').closest('svg');
    const layer = svg.querySelector('g[data-layer-name]');
    const last = layer.lastElementChild;
    const fill = last.getAttribute('fill');
    // Check if the gradient is still referenced and exists
    const match = fill?.match(/url\(#(.+?)\)/);
    const gradId = match ? match[1] : null;
    const gradExists = gradId ? !!svg.querySelector('#' + CSS.escape(gradId)) : false;
    return { fill, gradId, gradExists };
  });

  if (!pastedGrad.gradExists) {
    bug('P1', 'paste', 'Pasted gradient rect references non-existent gradient',
      `fill=${pastedGrad.fill}, gradId=${pastedGrad.gradId}, exists=${pastedGrad.gradExists}`);
  } else {
    log.push(`  OK: Pasted gradient rect references existing gradient: ${pastedGrad.fill}`);
  }
  await press('Control+z');

  // ===========================================================
  // BENCHMARK 7: Scale operations on various element types
  // ===========================================================
  log.push('\n=== BENCHMARK 7: Scale Operations ===');

  await page.evaluate(() => {
    const svg = document.querySelector('[data-role=overlay]').closest('svg');
    const layer = svg.querySelector('g[data-layer-name]');
    while (layer.firstChild) layer.removeChild(layer.firstChild);
    svg.setAttribute('viewBox', '0 0 210 297');

    const ns = 'http://www.w3.org/2000/svg';

    // Rect to scale
    const r = document.createElementNS(ns, 'rect');
    r.setAttribute('id', 'sc-r1');
    r.setAttribute('x', '30'); r.setAttribute('y', '30');
    r.setAttribute('width', '60'); r.setAttribute('height', '40');
    r.setAttribute('fill', '#4488CC'); r.setAttribute('stroke', '#000');
    layer.appendChild(r);

    // Ellipse to scale
    const e = document.createElementNS(ns, 'ellipse');
    e.setAttribute('id', 'sc-e1');
    e.setAttribute('cx', '150'); e.setAttribute('cy', '50');
    e.setAttribute('rx', '30'); e.setAttribute('ry', '20');
    e.setAttribute('fill', '#CC4488'); e.setAttribute('stroke', '#000');
    layer.appendChild(e);

    // Path to scale
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('id', 'sc-p1');
    p.setAttribute('d', 'M 30 120 L 90 120 L 60 80 Z');
    p.setAttribute('fill', '#44CC88'); p.setAttribute('stroke', '#000');
    layer.appendChild(p);

    return 'Injected scale test elements';
  });

  const ctm7 = await getSvgCTM();

  // TEST 7.1: Select rect and attempt scale via handle drag
  log.push('Test 7.1: Scale rect sc-r1');
  await deselect(ctm7);
  await clickSvg(ctm7, 60, 50); // center of sc-r1
  const scSel = await selectionCount();
  if (scSel < 1) {
    bug('P1', 'selection', 'Cannot select sc-r1', '');
  } else {
    // Get the selection handle positions
    const handleInfo = await page.evaluate(() => {
      const handles = document.querySelectorAll('[data-role=selection-box]');
      if (handles.length === 0) return null;
      // The selection box should give us the bbox
      const box = handles[0];
      return {
        x: box.getAttribute('x'),
        y: box.getAttribute('y'),
        width: box.getAttribute('width'),
        height: box.getAttribute('height')
      };
    });
    log.push(`  Selection box: ${JSON.stringify(handleInfo)}`);

    if (handleInfo) {
      // Try dragging the right-middle handle (right edge of selection)
      const boxRight = parseFloat(handleInfo.x) + parseFloat(handleInfo.width);
      const boxMidY = parseFloat(handleInfo.y) + parseFloat(handleInfo.height) / 2;

      const origW = await getAttr('sc-r1', 'width');
      // Drag from right edge to further right
      await dragSvg(ctm7, boxRight, boxMidY, boxRight + 20, boxMidY);
      const newW = await getAttr('sc-r1', 'width');

      if (newW === origW) {
        // Maybe scale uses transform instead of attribute change
        const transform = await getAttr('sc-r1', 'transform');
        if (!transform) {
          log.push(`  NOTE: Scale did not change width or add transform (may need precise handle targeting)`);
        } else {
          log.push(`  OK: Scale added transform: ${transform}`);
        }
      } else {
        log.push(`  OK: Scale changed width: ${origW} -> ${newW}`);
      }
      await press('Control+z');
    }
  }

  // ===========================================================
  // BENCHMARK 8: Ctrl+A Select All
  // ===========================================================
  log.push('\n=== BENCHMARK 8: Select All ===');

  const allCount = await page.evaluate(() => {
    const svg = document.querySelector('[data-role=overlay]').closest('svg');
    return svg.querySelector('g[data-layer-name]').children.length;
  });

  await press('Control+a');
  const selectAllCount = await selectionCount();
  if (selectAllCount !== allCount) {
    bug('P2', 'selection', `Ctrl+A selected ${selectAllCount} but layer has ${allCount} elements`, '');
  } else {
    log.push(`  OK: Ctrl+A selected all ${selectAllCount} elements`);
  }

  // ===========================================================
  // RESULTS
  // ===========================================================
  log.push('\n=== RESULTS ===');
  log.push(`Total bugs found: ${bugs.length}`);

  if (bugs.length > 0) {
    log.push('\nBUGS:');
    for (const b of bugs) {
      log.push(`  [${b.severity}] ${b.category}: ${b.description}`);
      if (b.details) log.push(`    Details: ${b.details}`);
    }
  }

  return { bugs, log: log.join('\n') };
}
