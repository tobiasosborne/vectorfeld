# SVG Benchmark Redraw Report

## Methodology

Downloaded 8 W3C SVG test suite files and complex SVG samples. Used playwright-cli
to redraw reference SVGs from scratch using vectorfeld's tools (rect, ellipse, line,
pen) and then tested operations (select, move, undo, copy/paste, group/ungroup,
nudge, duplicate, property editing) on the drawn elements. Also tested SVG import
with complex elements (bezier paths, transforms, gradients, groups).

## Benchmark Files

| File | Features | Status |
|------|----------|--------|
| shapes-rect-01.svg | 8 rects, fill, stroke, rx/ry | Redrawn + tested |
| paths-data-01.svg | 8 bezier paths (M,C,S,c,s,z) | Import tested |
| coords-trans-09.svg | Matrix transforms | Import tested |
| radialgradient2.svg | Linear/radial gradients | Downloaded |
| painting-stroke-01.svg | Stroke properties | Import tested |
| tiger.svg | 300+ paths stress test | Downloaded |

## Bugs Found

### P1: removeChild crash on undo (FIXED)

**File:** `src/model/document.ts:70`, `src/model/commands.ts:86`
**Symptom:** `TypeError: Cannot read properties of null (reading 'removeChild')`
**Cause:** `AddElementCommand.undo()` called `removeElement()` on an element whose
parent was null (element already detached from DOM, e.g., by layer clear).
The `removeElement()` used a non-null assertion (`el.parentElement!`) that crashed.
**Fix:** Added null guard in `removeElement()` and `AddElementCommand.undo/execute`.

### P3: Layout overflow when viewport resized

**Symptom:** Resizing browser viewport to 1280x1080 causes the `<html>` element to
scroll 403px because the canvas SVG element overflows its flex container.
**Root cause:** The canvas SVG's natural height (from preserveAspectRatio) exceeds
the flex container, pushing the overall layout beyond the viewport.
**Status:** Noted, not fixed (CSS layout issue in canvas container).

## Tests Passed

| Test | Result |
|------|--------|
| Draw 8 rects with rect tool | PASS - All 8 created at correct positions |
| Select each rect by clicking | PASS |
| Move rect and undo | PASS - dx/dy correct, undo restores |
| Copy/paste preserves attrs | PASS - fill, stroke, stroke-width preserved |
| Delete and undo | PASS - 8->7->8 |
| Group and ungroup (Ctrl+G / Ctrl+Shift+G) | PASS |
| Nudge with arrow keys (1mm) | PASS - delta=1.00mm |
| Duplicate (Ctrl+D) | PASS |
| Draw ellipse | PASS |
| Draw line (click-drag) | PASS |
| Draw triangle with pen tool | PASS - M/L/Z path |
| Draw bezier curve with pen tool | PASS - C command path |
| Select and move path | PASS - d attribute changes |
| Ctrl+A select all | PASS |
| Import complex SVG (6 elements) | PASS - all render |
| Select imported elements (path, rect, ellipse, group) | PASS |
| Export preserves all attributes | PASS |
