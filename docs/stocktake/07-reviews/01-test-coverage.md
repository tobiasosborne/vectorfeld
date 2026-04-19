# Adversarial QA Review: Test Coverage & Edge Cases

_Date: 2026-04-19_  
_Reviewer: adversarial QA pass (Claude Sonnet 4.6)_  
_Scope: 472 tests across 40 files; focus on casual-PDF-edit use case_

---

## 1. Executive Summary

The 472 tests are a good foundation but are dangerously concentrated on happy paths. The single most dangerous gap is **`clipboard.ts` has zero tests** — the paste/duplicate path is the primary verb in the casual-PDF-edit workflow ("copy text from one PDF page, paste into another") and the prior B-03 regression (paste drops group children) was already filed, claimed fixed, but still has no regression test preventing a rebreak. Beyond that, the test suite consistently checks "does it render" without checking "does it produce the right attribute values" or "does it survive an undo." `freeTransformTool.test.ts` is the worst offender: 8 tests verify that the tool has handlers and doesn't crash on null inputs; not one test actually transforms an element. `parseSvgString` (the front door for the PDF-edit flow) silently swallows `<image>` elements when a PDF contains flat (non-layered) markup — no test catches this. The overall picture: **this suite would let a release ship with broken paste, broken freeTransform, and broken PDF image import without a single red test.**

---

## 2. Coverage Gaps by Module

### 2.1 src/model — Module-by-module

| Module | Tests | What is tested | Critical gaps |
|--------|-------|----------------|---------------|
| `clipboard.ts` | **0** | Nothing | paste, cut, duplicate, paste-of-group, paste with ID collision, paste offset |
| `gradients.ts` | 0 (mocked in PropertiesPanel) | Only detectFillType via mock | createLinearGradient, createRadialGradient, parseGradientColors, round-trip |
| `align.ts` | 0 | Nothing | computeAlign (all 6 ops), computeDistribute (both), applyDelta |
| `nudge.ts` | 0 | Nothing | nudge a rect, nudge a group, nudge a path, undo |
| `zOrder.ts` | 0 | Nothing | bringForward/sendBackward/bringToFront/sendToBack, undo |
| `reflect.ts` | Well tested (122 lines) | All element types | Pre-existing transform on element |
| `pdfImport.ts` | 5 tests | postProcessPdfSvg only | importPdf (WASM not tested), multi-page, error paths |
| `fileio.ts` | 14 tests | exportSvgString, parseSvgString | `<image>` in flat-mode parseSvgString, SVG with gradients/clipPaths, PDF/PNG/TikZ export functions |
| `commands.ts` | 34 tests | Good coverage of history + all 7 command types | MAX_HISTORY eviction, history at stack boundary, CompoundCommand with 0 commands |
| `geometry.ts` | Indirect (via matrix.test, pureLogic) | transformedAABB | computeTranslateAttrs: text with transform, image, zero-width bbox, hitTestAll |
| `selection.ts` | 14 tests | Handles, positions, multi-select | Selection with transformed element (rotated rect), selection cleared after layer delete, overlay group unset |
| `artboard.ts` | 112 lines, good | CRUD, bounds | Artboard overlap with PDF page size > 279mm |
| `matrix.ts` | 378 lines, excellent | All 11 operations | scale(0,0) degenerate, NaN in matrix components |
| `pathOps.ts` | 207 lines | Parse/split/join/intersect | Empty `d`, `M`-only path, NaN coordinates, `A` arc approximated as `L` (undocumented lossy) |
| `offsetPath.ts` | 5 smoke tests | Returns a string | Collinear points (zero-length normals → NaN), open path with overlapping offset |
| `pathBooleans.ts` | 4 tests | Unite/subtract/intersect/divide | Non-overlapping paths, empty operand, `exclude` operation missing from tests |
| `compoundPath.ts` | ~40 (not read fully) | Make/release | Subpath with no M, subpath starting with Z |

### 2.2 src/tools — Module-by-module

| Tool | Tests | What is tested | Critical gaps |
|------|-------|----------------|---------------|
| `selectTool.ts` (736 LOC) | 26 tests | Click, marquee, move, group move, locked layer | **Scale** (8 handles never tested), **Rotate** (never tested), multi-element move, undo of scale/rotate, image element |
| `freeTransformTool.ts` (313 LOC) | 8 tests | Config, null-guard | **Nothing actually transforms**: no scale, no rotate, no skew, no undo, no group |
| `penTool.ts` | 15 tests | Anchors, close, Escape | Bezier drag, re-opening path by clicking start, undo mid-draw |
| `textTool.ts` | 16 tests | Type, backspace, commit | Multi-line text, edit existing `<text>` element, IME input, paste into text field |
| `directSelectTool.ts` | 16 tests | parsePathAnchors, updatePathAnchor | Actual drag events (zero drag tests), relative path commands (m/l/c), deactivate cleanup |
| `eraserTool.ts` | 0 | Nothing | Erasing with locked layer, erasing group, undo |
| `knifeTool.ts` | 0 | Nothing | Cut through multiple paths, cut missing path, undo |
| `scissorsTool.ts` | 0 | Nothing | Click near endpoint, click on Z segment |
| `lineTool.ts` | `snapAngle.test.ts` (156 lines, private fn duplicate) | snapLineAngle only | Actual line drawing, shift-constrain, snap-to-point, undo |
| `rectTool.ts` | 0 | Nothing | Rect draw, shift=square, Ctrl=from-center, undo |
| `ellipseTool.ts` | 0 | Nothing | Any behavior whatsoever |
| `pencilTool.ts` | 0 | Nothing | Any behavior whatsoever |
| `lassoTool.ts` | 4 tests | pointInPolygon only | Actual lasso drag, selection result |
| `measureTool.ts` | 0 | Nothing | Any behavior |
| `eyedropperTool.ts` | 0 | Nothing | Any behavior |

### 2.3 src/components — Module-by-module

| Component | Tests | What is tested | Critical gaps |
|-----------|-------|----------------|---------------|
| `App.tsx` (464 LOC) | 2 tests | Renders, has `#app` element | Menu actions (boolean, mask, group, ungroup), keyboard shortcuts |
| `ControlBar.tsx` (254 LOC) | 0 | Nothing | X/Y/W/H inputs dispatch commands, rotation input, align buttons |
| `LayersPanel.tsx` (180 LOC) | 0 | Nothing | Add/rename/delete layer, visibility toggle, lock toggle |
| `PropertiesPanel.tsx` (684 LOC) | 12 tests (heavily mocked) | Renders sections, shows field labels | Actual attribute editing, gradient editing, undo invoked, font change |
| `Canvas.tsx` (381 LOC) | 6 tests | SVG present, viewBox, artboard rect | Zoom, pan, tool dispatch |
| `ArtboardDialog.tsx` | 7 tests | Good: validates bad input, presets | Very large dimensions (>10,000mm) |
| `Ruler.tsx` | ~40 tests | pickInterval, formatLabel | Ruler drag to add guide |
| `MenuBar.tsx` | 0 | Nothing | Disabled states, keyboard navigation |

---

## 3. Edge Cases Missing from Existing Tests

### 3.1 `src/model/pathOps.ts`

- **Empty path `d=""`**: `parsePathD('')` returns `[]`; `commandsToD([])` returns `''`; `splitPathAt([], 0)` would access `commands[0]` which is undefined — potential crash.
- **`M`-only path** (no segments): `nearestSegment` returns `{segIndex: -1, distance: Infinity}` — callers (scissorsTool, knifeTool) never guard against `segIndex === -1`.
- **NaN coordinates**: `parsePathD('M NaN NaN L foo bar')` — `parseFloat('foo')` returns `NaN`, which propagates into all downstream geometry. No test exercises this.
- **Arc (`A`) approximated as `L`**: Documented in the source but not tested — any PDF path using arc commands loses curvature silently.
- **`joinPaths` with empty first/second**: Tested only with valid non-empty inputs.
- **`scalePathD` with `sx=0` or `sy=0`**: Results in degenerate path (all points collapse to a line/point). `splitPathAt` on such a path will produce zero-length segments that confuse `nearestSegment`.
- **Multiple M commands** (compound subpath via multiple M): `splitPathAt` with `before = commands.slice(0, segIndex)` will include an intermediate M — the "before" path may have a dangling M with no endpoint, which is malformed SVG.

### 3.2 `src/model/matrix.ts`

- **`scaleMatrix(0, 0)`**: Produces singular matrix. `invertMatrix` returns identity (tested), but `decomposeMatrix` on a zero-scale matrix would compute `scaleX = sqrt(0) = 0`, `scaleY = NaN` (division by zero in skew extraction). Not tested.
- **`parseTransform('')`**: Returns identity. Tested. But `parseTransform(null as unknown as string)` — not tested; likely throws.
- **`matrixToString` with `NaN` components**: Produces `"matrix(NaN, 0, 0, NaN, 0, 0)"` which is invalid SVG and undetected.

### 3.3 `src/model/geometry.ts` — `computeTranslateAttrs`

- **`text` element with existing `translate()` in transform**: Goes through the `rect`/`text`/`image` branch (updates `x`/`y` attributes), but then the trailing block at lines 104–115 tries to update `rotate()` rotation center — the two updates can conflict.
- **`image` element with no `x` or `y` attribute**: `parseFloat(el.getAttribute('x') || '0')` returns 0 — silently moves image to wrong position.
- **`line` element with `transform` attribute**: The line branch updates `x1/y1/x2/y2` but does NOT update the rotation center in the trailing block — the rotation center stays at the old position.

### 3.4 `src/model/pdfImport.ts` — `postProcessPdfSvg`

- **viewBox with negative origin** (e.g. `viewBox="-10 -10 620 800"`): The regex `.replace(/viewBox="([\d.\-]+)...)` — the character class `[\d.\-]` matches `-` but the negative sign on the first value will be consumed correctly. However, `parseFloat("-10")` gives `-10`, and then the conversion `(-10 * 25.4/72).toFixed(2)` gives a string with a leading `-` — the output `viewBox="-3.53 -3.53 ..."` is valid. This edge case works but is untested.
- **MuPDF `text=text` with per-character `x` array**: Spaces are encoded as x-gaps (documented caveat). The `postProcessPdfSvg` does nothing about this. The tspan `x` attribute contains a space-separated list of numbers. Tested that `<text>` survives, but not that `x="10 20 30"` survives (the `x` attribute may contain spaces which are valid in SVG but unusual).
- **SVG masquerading as PDF** (wrong magic bytes): MuPDF throws; `importPdf` catches and rejects. But the error message `"expected magic word 00 61 73 6d"` (a WASM error) surfaces to the user with no friendly wrapper. No test.
- **Password-protected PDF**: MuPDF throws with a permissions error. No test; no user-facing error message.
- **Zero-page PDF or page index out of range**: `doc.loadPage(0)` would throw. `importPdf` only ever loads page 0. No test for error path.
- **Very large PDF (500+ pages, 50MB)**: MuPDF WASM loads the full file into memory. No memory limit check. No test.

### 3.5 `src/model/fileio.ts` — `parseSvgString`

- **`<image>` element in flat SVG** (no layer groups): The `drawingTags` array on line 255 is `['g', 'line', 'rect', 'ellipse', 'circle', 'path', 'text', 'polygon', 'polyline']`. **`'image'` is absent.** An SVG with a flat `<image>` — exactly what a PDF import produces after `applyParsedSvg` wraps the content and you then re-import the exported SVG — **silently drops the image**. No test catches this.
- **SVG with only `<defs>` and no drawing elements**: `parseSvgString` returns `layers = [{ synthetic layer with 0 children }]`. Subsequent `applyParsedSvg` removes all existing layers and replaces them with the empty synthetic layer. Document becomes blank. No test.
- **Malformed XML**: DOMParser produces a `<parsererror>` document. `importedSvg.getAttribute('viewBox')` would return `null` and defs/layers parsing would produce garbage. No test.
- **SVG with `<symbol>` + `<use>` elements**: `<symbol>` is not in `drawingTags`, `<use>` is not in `drawingTags`. Both silently dropped. For the PDF-edit use case, MuPDF default mode (path mode) emits `<use>` for every character; switching to text=text avoids this, but imported SVGs from other tools may use `<use>`. No test.

### 3.6 `src/model/commands.ts`

- **`CommandHistory` at MAX_HISTORY (200) eviction**: `splice(0, length - MAX_HISTORY)` removes oldest entries. The evicted commands reference DOM elements that may have been undo-removed; subsequent undo does not crash, but the undo stack silently becomes shorter. No test for this behavior.
- **`AddElementCommand.execute()` called when parent is no longer in DOM**: The `if (this.parent.isConnected)` guard silently no-ops the re-add. There is no notification to the caller. No test.
- **`CompoundCommand` with zero commands**: `new CompoundCommand([])` — `execute()` is a no-op, `description` is `''`. Harmless but unchecked.
- **`ModifyAttributeCommand` undo when element has been removed from DOM**: `setAttribute` on a detached element is a no-op in most implementations. No test.

### 3.7 `src/tools/selectTool.ts` — Scale and Rotate

The 26 existing tests cover click-select, marquee, move, and group-move. **Scale and rotate are completely untested:**
- Drag `se` handle on a rect — does it scale correctly?
- Drag `se` handle on a rotated rect — does it scale in the correct coordinate space?
- Drag rotation zone on a group — does rotation compose correctly?
- Scale a group with a rotated child — child coordinates correct after undo?
- Scale to produce negative width (dragging past opposite handle) — what happens?

### 3.8 `src/model/selection.ts`

- **Overlay group not set** (`setOverlayGroup` not called): `setSelection([el])` calls `refreshOverlay`, which internally uses the overlay group. If it's `null`, it should silently skip. No test for this guard.
- **Selecting an element with `getBBox()` that throws** (e.g., a detached element): The `try/catch` in `hitTestElement` skips it, but `setSelection([detachedEl])` followed by `refreshOverlaySync()` may throw.
- **Selection with a `<g>` that has transformed children**: The selection bbox is the group's bbox (correct), but handles are sized based on `clientWidth`. No test for scale factor under zoom.

---

## 4. Cross-Module Integration Gaps

These are scenarios that span multiple modules and are tested nowhere:

### INT-01: PDF Import → Select → Move → Undo (PRIMARY USE CASE)

**Scenario**: `importPdf(doc)` → user selects imported text element → drags it → presses Ctrl+Z.

**What could go wrong**: The imported text element lives inside a `<g transform="scale(PT_TO_MM)">` wrapper inserted by `applyParsedSvg`. `computeTranslateAttrs` for a `<text>` element updates `x`/`y` attributes, but the element's visual position is also subject to the parent scale group's transform. After undo, the `x`/`y` are restored but the scale group persists — position is correct. However `getElementAABB` computes AABB from the element's own transform, not its parent's transform. The selection overlay may be mispositioned.

**No test exists for this scenario.**

### INT-02: Paste of Group with Children → Undo → Redo

**Scenario**: Create `<g>` with two `<rect>` children, copy, paste, verify children present, undo, verify removed, redo, verify children restored.

**What could go wrong**: `pasteClipboard` creates the group via `AddElementCommand` (which only creates attributes via `doc.addElement`), then separately appends children. If `AddElementCommand.undo()` removes the element, the children go with it. `AddElementCommand.execute()` on redo calls `this.parent.appendChild(this.element)` — the element reference retained — so children should be there. But `pasteClipboard` re-appends children from `clipboard.current[i]` on every paste, meaning redo after undo appends children TWICE. **No test verifies the redo case**.

### INT-03: Import SVG → Group → Scale → Ungroup → Export → Re-import Identity Check

**Scenario**: Import SVG, select two elements, group them, scale the group, ungroup, export as SVG, re-import, verify element positions match.

**What could go wrong**: `UngroupCommand` moves children from group to parent but does NOT compose the group's transform into each child's transform. If the group had a `matrix(...)` transform applied by a scale operation, ungrouping loses that transform — children snap back to their pre-scale positions.

**No test exists for this scenario.**

### INT-04: PDF Export Round-Trip (mentioned in doc/stocktake/06 as "not done")

**Scenario**: `importPdf` → `exportPdf` → visual comparison. Whether jsPDF + svg2pdf preserves `<text>` elements with `font-family="LMRoman10"` and per-character `x` arrays is completely untested. The 06-pdf-roundtrip-experiment.md explicitly lists this as "remaining experiments."

**No test exists; not even a stub.**

### INT-05: Multi-Layer Document: Add Layer, Draw on New Layer, Delete Old Layer

**Scenario**: Document with two layers; draw a rect on Layer 2; delete Layer 1; verify undo stack and document integrity.

**What could go wrong**: `RemoveElementCommand` stores `removedParent`. If the parent layer is deleted before undo is triggered, the undo re-inserts the element into a detached DOM element. Silent failure.

**No test exists for multi-layer scenarios.**

### INT-06: Clipboard Across Tool Changes

**Scenario**: While pen tool is active (mid-path), press Ctrl+C (copy something), verify keyboard capture doesn't bleed into EditorContext shortcuts.

**What could go wrong**: `isKeyboardCaptured()` blocks tool shortcuts but EditorContext wires copy/paste to `document` keydown directly. The pen tool sets keyboard capture on `onKeyDown`. If the handler order is: pen tool sees Ctrl+C first → `isKeyboardCaptured` check → EditorContext also sees it. Double-paste or pen tool committing path.

**No test exists.**

### INT-07: Undo History Overflow (200 commands)

**Scenario**: Execute 201 commands, verify the oldest is silently evicted, verify the document state is still consistent (no dangling references).

**No test exists.**

---

## 5. Tests That Don't Actually Test Anything

### 5.1 `src/tools/freeTransformTool.test.ts` — near-total tautology

8 tests, 67 lines. Every test is one of:
- "tool has correct config values" (name/shortcut/icon)
- "handler exists"
- "handler doesn't throw when SVG is null"
- "handler doesn't throw when no selection"

Not one test exercises a transform. The 313-LOC source has scale, rotate, skew, group-scale, undo, coordinate-space composition logic — none of it touched. This test file provides zero regression protection for any bug in `freeTransformTool.ts`. It is a confidence placebo.

### 5.2 `src/components/PropertiesPanel.test.tsx` — label-presence tests disguised as coverage

199 lines, 12 tests. Every test calls `render(<PropertiesPanel />)` with a mocked element and then checks `screen.getByText('X')` or `screen.getByText('Style')`. These tests verify that *section headings are present* — they don't verify that attribute values are read correctly, that changing an input dispatches a command, or that the history mock's `execute` is called. The mocks are so deep (`selection`, `EditorContext`, `gradients`, `align`, `matrix`, `markers` all mocked) that the component under test is almost entirely inert. 

Specific tautologies:
- `it('shows position inputs (X, Y) for rect element')` — the mock provides a `rect` element; the test checks for text "X" and "Y". These labels are hardcoded strings in JSX; the test does not verify the *value* in the input, whether it reads `getAttribute('x')`, or whether it dispatches `ModifyAttributeCommand`. A refactor that broke all the actual data-binding would not cause a single test failure.
- `it('shows Font section for text elements')` — checks for text "Fam", "Size", "Lsp". Same pattern.

### 5.3 `src/App.test.tsx` — renders-and-has-div test

2 tests. Verifies `screen.getByText('vectorfeld')` exists and `#app` is present. App.tsx is 464 LOC containing all menu definitions and inline menu-action handlers for booleans, masks, compound paths, offset path, reflect, text-on-path. None of that is tested.

### 5.4 `src/tools/snapAngle.test.ts` — tests a duplicate of a private function

156 lines testing `snapLineAngle` — a function that is explicitly not exported from `lineTool.ts` and is copy-pasted verbatim into the test file. The comment says "must stay in sync." This is a maintenance liability, not a quality signal: if someone fixes a bug in `lineTool.ts`'s `snapLineAngle` but forgets to update the duplicate in the test, the test continues to pass while the production code has the fix and the test covers dead code.

### 5.5 `src/model/offsetPath.test.ts` — smoke tests only

5 tests all of the form "returns a non-empty string containing 'M' and 'C'." The numerical correctness of the offset (is the outward normal computed correctly? do collinear segments produce degenerate normals?) is never verified. A complete NaN bug in the normal computation would still pass these tests as long as the output string starts with 'M'.

---

## 6. PDF-Edit Use Case: Specifically Untested Critical Paths

The primary user story is: **open Word-generated PDF → move/edit text → copy elements → save as PDF**. Here is what that involves and whether tests exist:

| Step | Module(s) | Tested? | Notes |
|------|-----------|---------|-------|
| Open file picker, read PDF as ArrayBuffer | `pdfImport.ts` | No (WASM) | `importPdf` entirely untested end-to-end |
| MuPDF WASM render with `text=text` | `pdfImport.ts` | No (WASM) | Error path (corrupt PDF, password, too large) untested |
| `postProcessPdfSvg` — viewBox conversion | `pdfImport.ts` | 2 tests | Partial; see edge cases above |
| `parseSvgString` picks up `<text>` elements | `fileio.ts` | No direct test | Only indirect via `postProcessPdfSvg` test |
| `parseSvgString` picks up `<image>` elements (flat mode) | `fileio.ts` | **No — BUG** | `'image'` absent from `drawingTags` |
| Scale group wrapping (PT_TO_MM) applied | `pdfImport.ts` | No | `applyParsedSvg` in pdfImport not tested |
| Select imported `<text>` element | `selectTool.ts` | No | Selecting elements inside a `<g transform="scale(...)">` not tested |
| Drag text element — `computeTranslateAttrs` for text | `geometry.ts` | Partial | Happy path only; text inside transform group not tested |
| Edit text content via textTool | `textTool.ts` | 16 tests | Existing text click-to-edit not tested (textTool only tests create-new) |
| Copy selection (Ctrl+C) | `clipboard.ts` | **0 tests** | |
| Paste (Ctrl+V) with offset | `clipboard.ts` | **0 tests** | |
| Paste a `<text>` element with `<tspan>` children | `clipboard.ts` | **0 tests** | Children must survive paste |
| Undo paste | `clipboard.ts` | **0 tests** | |
| Export as PDF (jsPDF + svg2pdf) | `fileio.ts` | 0 tests | Whether `<text>` survives svg2pdf is unknown |
| Export as SVG preserves `<text>` with font-family | `fileio.ts` | 0 tests | |
| Font fallback when `font-family="LMRoman10"` not installed | `textTool.ts` / browser | 0 tests | System renders with fallback; positioning breaks |
| Multi-page PDF (pages 1..N) | `pdfImport.ts` | 0 tests | Hard-coded `pageIndex = 0` |
| Large document (100+ text elements) | `fileio.ts`, `selectTool.ts` | 0 tests | Performance untested |
| Cross-document clipboard (two tabs) | `clipboard.ts` | 0 tests (feature not implemented) | Documented as missing |

---

## 7. Prioritized Test Todo

Ranked by **impact × probability of being hit in the first 10 casual-PDF-edit sessions**:

### 1. `clipboard.ts` — full test suite (BLOCKER)

Write `src/model/clipboard.test.ts`. Must cover:
- `copySelection` serializes elements
- `pasteClipboard` with single rect: creates element at +5mm offset
- `pasteClipboard` with `<g>` containing two `<rect>` children: children survive
- `pasteClipboard` undo removes pasted elements; redo re-adds with children intact
- `cutSelection` removes originals, paste restores them at +5mm
- `duplicateSelection` produces a copy adjacent to original
- Paste with empty clipboard is a no-op

### 2. `parseSvgString` — add `'image'` to drawingTags (BLOCKER + 1-line fix)

In `src/model/fileio.ts` line 255, add `'image'` to the `drawingTags` array. Then add to `fileio.test.ts`:
- `it('imports <image> in flat SVG')` — SVG with no layer groups, containing an `<image>` element; verify it survives in the synthetic layer.

### 3. `selectTool` — scale and rotate tests (BLOCKER)

Add to `selectTool.test.ts`:
- Drag `se` scale handle on a rect → verify width/height attributes change, undo restores
- Drag `se` scale handle on a rotated rect → verify scale in correct coordinate space
- Drag rotation zone → verify transform attribute updated, undo works
- Multi-element select + scale → all elements move correctly

### 4. `freeTransformTool` — replace tautology with real tests (HIGH)

Delete the 8 existing smoke tests. Replace with:
- Scale a selected rect via corner handle drag → verify transform or size attributes
- Rotate via outside-corner drag → verify transform contains rotation
- Undo scale → verify original attributes restored
- Group scale → verify group transform updated

### 5. `postProcessPdfSvg` — error-path tests (HIGH)

Add to `pdfImport.test.ts`:
- Malformed SVG string input → should not throw, return input string
- SVG with no viewBox → viewBox conversion is skipped gracefully (existing test covers)
- viewBox with negative origin → negative mm values produced (regression guard for future "fix")
- `<text>` with `x="10 20 30"` (per-character array) → attribute survives intact
- `<image xlink:href="data:...">` → image element survives intact

### 6. `computeTranslateAttrs` — text inside transform group (HIGH)

Add to geometry tests:
- `text` element with `transform="rotate(10, 50, 50)"` → nudge updates `x`, `y` AND rotation center
- `image` element with no `x`/`y` attributes → default-to-0 behavior is correct

### 7. `pathOps.ts` — numerical edge cases (MEDIUM)

Add to `pathOps.test.ts`:
- `parsePathD('')` returns `[]` without crash
- `parsePathD('M 10 20')` (M only, no segments) → `nearestSegment` returns `{segIndex: -1}` and callers handle it
- `translatePathD('M NaN 0 L 10 10', 0, 0)` → result contains 'NaN' (documents current behavior so future fix is noticed)
- `scalePathD('M0 0 L10 10', 0, 0, 0, 0)` → all points collapse to origin (documents degenerate case)

### 8. Cross-module: PDF import → select → move → undo (HIGH, integration)

Integration test in `pdfImport.test.ts` (mock MuPDF, use real `postProcessPdfSvg` + `parseSvgString` + `applyParsedSvg`):
- Mock MuPDF `getMuPDF` to return a fixture SVG string
- Call through the full `importPdf` → `applyParsedSvg` pipeline with a mock DocumentModel
- Verify: text element present in layer, scale group present, syncIdCounter advanced
- Then: select the text element, `computeTranslateAttrs(el, 10, 5)`, apply changes
- Verify: `x`/`y` attributes updated by 10 and 5

### 9. `CommandHistory` — MAX_HISTORY eviction (MEDIUM)

Add to `commands.test.ts`:
- Execute 201 commands; verify `canUndo` is true and undo stack length is 200
- Undo all 200; verify `canUndo` is false
- Verify the oldest (evicted) command's DOM change is not undoable

### 10. `parseSvgString` — malformed XML (MEDIUM)

Add to `fileio.test.ts`:
- `parseSvgString('<not xml>')` → should return `{viewBox: null, defs: [], layers: [synthetic empty layer]}` without throwing
- `parseSvgString('<svg xmlns="..."><parsererror>...</parsererror></svg>')` → graceful degradation

---

## Appendix: Severity counts

| Severity | Count |
|----------|-------|
| BLOCKER | 5 |
| HIGH | 17 |
| MEDIUM | 11 |
| LOW | 4 |
| **Total** | **37** |

### BLOCKER findings summary

1. **`clipboard.ts` has 0 tests** — The paste/duplicate verb is central to the PDF-edit workflow; the B-03 regression (paste drops group children) was already filed, claimed fixed, but has no regression guard. File: `src/model/clipboard.ts` (93 LOC, 0 tests).

2. **`<image>` silently dropped in `parseSvgString` flat mode** — `src/model/fileio.ts:255` — `drawingTags` array omits `'image'`. Any exported SVG with a flat `<image>` element re-imported via "Open SVG" loses the image without error or warning. For the PDF-edit use case, the workflow is: import PDF (gets image) → export SVG → re-import SVG → image gone.

3. **`freeTransformTool.test.ts` is a confidence placebo** — 313 LOC of transform logic, 0 lines of real coverage. `src/tools/freeTransformTool.ts` could regress on every bug in B-04 (undo broken), B-14 (rotation clobbers), B-15 (wrong anchor space), B-16 (scale on rotated primitive) with no test failure. File: `src/tools/freeTransformTool.test.ts`.

4. **Scale and rotate in `selectTool` entirely untested** — The two most-used interactions in a drawing tool. Eight scale handles, four rotation zones. Zero tests verify they produce correct attribute changes. File: `src/tools/selectTool.test.ts` — handles section missing.

5. **No test for PDF import error paths** — A password-protected PDF, a corrupt file, or a zero-byte file would surface a raw MuPDF WASM stack trace to the user with no friendly wrapper. `importPdf` has a `catch` block but no test verifies it surfaces a useful error. File: `src/model/pdfImport.ts:108`.

---

## How worried should we be?

Moderately worried, moving to very worried under load. The 472 tests pass a build gate but are misallocated: deep coverage of math primitives (matrix: 378 lines, excellent) paired with zero coverage of the glue that actually moves user work forward — clipboard, freeTransform, five drawing tools, ControlBar, LayersPanel, and the full PDF-import pipeline. The most dangerous gap is structural: the test style is "does it render" and "does it not throw" rather than "does it produce the correct DOM state and undo entry." A user who opens a Word PDF, moves three text blocks, copies one, pastes it, then presses Ctrl+Z twice would exercise `importPdf` (WASM, untested), `computeTranslateAttrs` (partially tested), `clipboard.ts` (zero tests), and `CommandHistory` (tested, solid). Two of four core interactions in that workflow have zero coverage. The `<image>` drop bug in `parseSvgString` is the kind of thing a user notices immediately ("where did my company logo go?") and it would not be caught by any current test. The tool also has a 5-year maintenance liability in `snapAngle.test.ts` — a test file that tests a copy of private production code and will silently diverge.
