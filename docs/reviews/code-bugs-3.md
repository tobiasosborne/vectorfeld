# Code Bug Report 3

Date: 2026-03-17
Scope: PropertiesPanel, MenuBar, activeLayer, ContextMenu, defaultStyle, penTool, directSelectTool

---

## Bug 1: PropertiesPanel shows no position/size controls for `<g>`, `<path>`, `<circle>`, `<image>`, `<polyline>`, or `<polygon>` elements

**File:** `/home/tobias/Projects/vectorfeld/src/components/PropertiesPanel.tsx`, lines 198-217 (Position), lines 220-319 (Size)

**What goes wrong:** The Position section only renders inputs for `rect`, `text`, `ellipse`, `circle`, and `line`. If you select a `<path>`, `<g>` (group), `<image>`, `<polyline>`, or `<polygon>`, the Position heading appears but is completely empty -- no inputs are shown. The Size section only renders for `rect` and `ellipse`, so selecting a `<circle>` shows no radius input despite it being a sized shape.

**Reproduction steps:**
1. Draw a path with the pen tool, then select it.
2. Open the Properties panel. The "Position" header is visible but there are zero input fields beneath it.
3. Same with any grouped element or circle.

**Root cause:** The tag-conditional blocks (lines 198-217) have no branch for `path`, `g`, `image`, `polyline`, or `polygon`. The Size section (line 220) checks `tag === 'rect' || tag === 'ellipse'` and omits `circle` (which uses `r` not `rx`/`ry`). The Position header at line 197 always renders, but the inputs inside it are all conditional, so for unhandled tags the user sees an orphaned "Position" label with nothing below it.

---

## Bug 2: PropertiesPanel stroke-width input shows empty string and `formatNumeric` returns it unchanged

**File:** `/home/tobias/Projects/vectorfeld/src/components/PropertiesPanel.tsx`, line 440

**What goes wrong:** When an SVG element has no explicit `stroke-width` attribute (SVG defaults to `1`), `getAttr(el, 'stroke-width')` returns `''` (empty string). The `PropertyInput` receives `value=""`, `formatNumeric('')` returns `''` (since `parseFloat('') -> NaN`), and the input displays as blank. The user sees an empty stroke-width field even though the element visibly has a stroke of width 1.

**Reproduction steps:**
1. Draw any shape (rect, ellipse, etc.). The default style sets `stroke-width: '1'` via `AddElementCommand`, so this specific case works.
2. Import an SVG file where an element has no explicit `stroke-width` attribute (relying on SVG default).
3. Select that element -- the SW field shows blank instead of `1`.

**Root cause:** `getAttr` at line 31 returns `el.getAttribute(attr) || ''`. The fallback is `''`, not `'1'`. Unlike fill (which defaults to `'#000000'` via `|| '#000000'` on lines 438/474) and opacity (which defaults to `'1'` via `|| '1'` on line 575), `stroke-width` has no default fallback on line 440.

---

## Bug 3: Gradient color changes via `updateGradientColors` bypass undo history

**File:** `/home/tobias/Projects/vectorfeld/src/components/PropertiesPanel.tsx`, lines 485-498; `/home/tobias/Projects/vectorfeld/src/model/gradients.ts`, lines 116-129

**What goes wrong:** When the user changes a gradient stop color (C1 or C2) on a gradient fill, `updateGradientColors()` directly mutates the `<stop>` elements' `stop-color` attributes in the DOM. No `ModifyAttributeCommand` is created, so the change is not recorded in the undo history. Pressing Ctrl+Z after changing a gradient color does not revert it.

**Reproduction steps:**
1. Select a shape and set its fill to "Linear Gradient".
2. Change the C1 (first stop) color from black to red using the color picker.
3. Press Ctrl+Z.
4. The gradient color remains red -- it was not undone.

**Root cause:** `updateGradientColors` (gradients.ts:116-129) does `stops[0].setAttribute('stop-color', color1)` directly, bypassing `applyAttr` / `ModifyAttributeCommand`. The PropertiesPanel calls it at lines 487 and 498 without routing through the command history.

---

## Bug 4: MenuBar items have no `disabled` support -- selection-dependent operations always fire

**File:** `/home/tobias/Projects/vectorfeld/src/components/MenuBar.tsx`, lines 3-8, 52-58; `/home/tobias/Projects/vectorfeld/src/App.tsx`, lines 182-288

**What goes wrong:** The `MenuItem` interface (MenuBar.tsx:3-8) does not include a `disabled` property, unlike `ContextMenuItem` which does. The menu item buttons (line 52-58) have no `disabled` attribute and no disabled styling. Operations like "Flip Horizontal", "Make Clipping Mask", "Join Paths" etc. are always clickable and always execute their action, even when nothing is selected. While some actions have internal guards (e.g., `if (sel.length === 0) return`), others do not, and the UX is broken: items that cannot work appear fully active.

**Reproduction steps:**
1. Deselect everything (click on empty canvas).
2. Open the Object menu.
3. Click "Flip Horizontal" -- it fires `applyReflect(computeReflectH)` with an empty selection.
4. Click "Make Clipping Mask" -- it silently fails but the menu item looks active.

**Root cause:** `MenuBar.tsx` `MenuItem` interface has no `disabled` field, and the `<button>` on line 52 never sets `disabled`. The `ContextMenu` component supports `disabled` (ContextMenu.tsx:8, 47), but `MenuBar` does not implement equivalent functionality.

---

## Bug 5: Context menu "Bring to Front" and "Send to Back" bypass undo history

**File:** `/home/tobias/Projects/vectorfeld/src/App.tsx`, lines 114-131

**What goes wrong:** The context menu's "Bring to Front" and "Send to Back" actions directly call `parent.appendChild(el)` and `parent.insertBefore(el, parent.firstChild)` on the DOM without creating a `ReorderElementCommand`. This means the z-order change is not recorded in the undo history and cannot be undone. Meanwhile, the keyboard shortcut versions (in `zOrder.ts`) correctly use `ReorderElementCommand`.

**Reproduction steps:**
1. Draw two overlapping shapes.
2. Select the bottom shape.
3. Right-click and choose "Bring to Front" from the context menu.
4. Press Ctrl+Z to undo.
5. The shape stays in front -- the z-order change was not undone.

**Root cause:** The context menu actions at lines 114-121 and 123-130 do raw DOM manipulation (`parent.appendChild(el)`) instead of using `history.execute(new ReorderElementCommand(...))` like `zOrder.ts` does.

---

## Bug 6: Direct select tool does not clean up visuals on deactivation

**File:** `/home/tobias/Projects/vectorfeld/src/tools/directSelectTool.ts`, lines 310-314

**What goes wrong:** The direct select tool has no `onDeactivate` handler. When the user switches away from the direct select tool (e.g., presses V for select tool), any anchor point visuals and control handle visuals appended to the SVG remain visible and are orphaned in the SVG DOM. They are overlay-style elements with `pointer-events: 'auto'`, so they can interfere with subsequent hit testing.

**Reproduction steps:**
1. Switch to the direct select tool (A key).
2. Click on a path to show its anchor points and handles.
3. Press V to switch to the select tool.
4. The blue anchor squares and handle circles remain visible on the canvas.

**Root cause:** The tool config object returned at line 310 has no `onDeactivate` method. Compare with `penTool.ts` (line 201) which has `onDeactivate() { if (state.drawing) finish() }` and calls `cleanup()`. The direct select tool's `clearVisuals()` function exists (line 224) but is never called on deactivation.

---

## Bug 7: Direct select tool anchor drag does not move associated control handles

**File:** `/home/tobias/Projects/vectorfeld/src/tools/directSelectTool.ts`, lines 393-405

**What goes wrong:** When dragging an anchor point on a Bezier path, only the anchor endpoint is updated via `updatePathAnchor`, but the associated control handles (handleIn and handleOut) are NOT moved along with it. This means dragging an anchor on a curved path distorts the curve incorrectly -- the handles stay at their original absolute positions while the anchor moves.

**Reproduction steps:**
1. Draw a curved path with the pen tool (click-drag to create handles).
2. Switch to direct select (A key), click the path, click an anchor with handles.
3. Drag the anchor to a new position.
4. The curve distorts because the control handles remain at their original absolute positions instead of moving relative to the anchor.

**Root cause:** In `onMouseMove` (lines 393-405), for `dragTarget.type === 'anchor'`, only `updatePathAnchor` is called, which updates coords at index `[i+4], [i+5]` in C segments. The associated `handleIn` (`[i+2], [i+3]`) and `handleOut` of the previous anchor's C segment (`[i], [i+1]`) are not offset by the same delta. In Illustrator/Figma, dragging an anchor moves its handles with it.

---

## Bug 8: Direct select and pen tool path parsers silently ignore relative path commands (m, l, c)

**File:** `/home/tobias/Projects/vectorfeld/src/tools/directSelectTool.ts`, lines 20, 28, 35, 109, 117, 121

**What goes wrong:** The regex at lines 20 and 109 matches both uppercase AND lowercase commands (`[MLCZmlcz]`), but the conditional branches at lines 28/117 only check uppercase: `if (cmd === 'M' || cmd === 'L')` and `if (cmd === 'C')`. Lowercase relative commands (`m`, `l`, `c`) are matched by the regex but fall through all branches and are silently dropped. Any path using relative coordinates will have missing anchor points.

**Reproduction steps:**
1. Import or paste an SVG with a path using relative commands, e.g., `<path d="M 0 0 l 10 10 l 20 0" .../>`.
2. Switch to direct select tool and click the path.
3. Only the first anchor (from M) is shown. The relative `l` points are missing.

**Root cause:** The regex captures lowercase commands but the if/else-if chains only test for uppercase letters. Relative commands need different handling (adding deltas to the current position), but since they are not handled at all, the anchors from those segments are lost.

---

## Bug 9: Pen tool Escape key finishes path instead of canceling it

**File:** `/home/tobias/Projects/vectorfeld/src/tools/penTool.ts`, lines 359-365

**What goes wrong:** When the user presses Escape during pen tool drawing, the handler calls `finish()` which commits the path to the document. The expected behavior for Escape is to cancel the current operation and discard the in-progress path, not to finish it. Enter should finish the path; Escape should cancel.

**Reproduction steps:**
1. Activate the pen tool (P key).
2. Click to place 3 or 4 anchor points.
3. Realize you don't want this path and press Escape.
4. Instead of canceling, the path is committed to the document.

**Root cause:** Line 361 treats Enter and Escape identically: `if (e.key === 'Enter' || e.key === 'Escape')` -> `finish()`. Escape should instead call `cleanup()` (which removes preview elements and resets state without committing).

---

## Bug 10: Pen tool rubber-band line not updated during handle drag

**File:** `/home/tobias/Projects/vectorfeld/src/tools/penTool.ts`, lines 313-317

**What goes wrong:** During `onMouseMove`, the rubber-band preview line is only updated when `!state.draggingHandle` (line 314). While the user is click-dragging to create a Bezier handle, the rubber-band line remains frozen at its last position. When the user releases and moves the mouse, the line jumps to catch up.

**Reproduction steps:**
1. Activate the pen tool.
2. Click to place the first anchor.
3. Click and hold at a second position, then drag to create a control handle.
4. During the drag, observe the dashed rubber-band line -- it does not update.
5. Release the mouse and move -- the line snaps to the cursor.

**Root cause:** The condition on line 314 (`if (state.previewLine && !state.draggingHandle)`) deliberately suppresses rubber-band updates during handle dragging, but the `onMouseUp` handler at lines 349-350 updates the line's start position to the anchor. The visual gap during the drag is jarring.

---

## Bug 11: PropertiesPanel applies fill/stroke style controls directly on `<g>` group elements

**File:** `/home/tobias/Projects/vectorfeld/src/components/PropertiesPanel.tsx`, lines 431-579

**What goes wrong:** When a `<g>` (group) element is selected, the entire Style section (fill, stroke, opacity, dash, etc.) renders and allows changes. Setting fill or stroke on a `<g>` element in SVG sets it as a presentation attribute that cascades to children, which is rarely what the user intends. More critically, `detectFillType()` reads the `fill` attribute of the `<g>` element, which is typically unset (`none`), so the fill controls show "None" even when the children inside the group have visible fills.

**Reproduction steps:**
1. Draw two colored shapes and group them (Ctrl+G).
2. Select the group.
3. Properties panel shows Style section. Fill shows "None" even though children have fills.
4. Change fill to "Solid" and pick red -- the `<g>` element gets `fill="red"`, which cascades to all children, overriding their individual fills.

**Root cause:** The Style section at line 431 renders unconditionally for any single-selected element (`{el && (...`). There is no check for `tag === 'g'` to either skip the section or handle it differently (e.g., showing the first child's style or a "mixed" indicator).

---

## Bug 12: PropertyInput allows committing non-numeric values to numeric SVG attributes

**File:** `/home/tobias/Projects/vectorfeld/src/components/PropertiesPanel.tsx`, lines 42-89

**What goes wrong:** `PropertyInput` accepts any text and calls `onChange` with the raw string. For numeric SVG attributes (x, y, width, height, rx, ry, cx, cy, stroke-width, opacity, font-size), typing non-numeric text like "abc" commits it as an SVG attribute value, producing `width="abc"` which breaks rendering. The `applyAttr` function at line 102 applies the string directly without validation.

**Reproduction steps:**
1. Select a rectangle.
2. In the Properties panel, click the W (width) field.
3. Type "hello" and press Enter.
4. The rectangle disappears because `width="hello"` is invalid SVG.
5. The change is recorded in undo history, so Ctrl+Z reverts it, but the user experience is broken.

**Root cause:** `PropertyInput.commit()` (line 54) calls `onChange(localValue)` with no numeric validation. `applyAttr` (line 102) passes the value straight to `ModifyAttributeCommand`. There is no validation layer between user input and DOM mutation for numeric fields.

---

## Summary

| # | Severity | File | Description |
|---|----------|------|-------------|
| 1 | Medium | PropertiesPanel.tsx | No position/size controls for path, group, circle, image |
| 2 | Low | PropertiesPanel.tsx | Empty stroke-width field for elements without explicit attribute |
| 3 | High | PropertiesPanel.tsx + gradients.ts | Gradient color changes bypass undo history |
| 4 | Medium | MenuBar.tsx | No disabled state support -- operations always clickable |
| 5 | High | App.tsx | Context menu Bring to Front/Send to Back bypass undo |
| 6 | Medium | directSelectTool.ts | No onDeactivate -- anchor visuals leak on tool switch |
| 7 | High | directSelectTool.ts | Anchor drag does not move associated Bezier handles |
| 8 | High | directSelectTool.ts | Relative path commands (m, l, c) silently dropped |
| 9 | Medium | penTool.ts | Escape finishes path instead of canceling |
| 10 | Low | penTool.ts | Rubber-band line frozen during handle drag |
| 11 | Medium | PropertiesPanel.tsx | Fill/stroke controls apply directly to group elements |
| 12 | Medium | PropertiesPanel.tsx | No validation on numeric inputs -- can set width="abc" |
