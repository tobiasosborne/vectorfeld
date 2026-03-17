# Code Bug Report

Reviewed files: `selectTool.ts`, `geometry.ts`, `selection.ts`, `ControlBar.tsx`
Date: 2026-03-17

---

## Bug 1: Scale/Rotate dead zone discards visual mutations without rollback

**File:** `src/tools/selectTool.ts`, lines 665-673
**Severity:** High

**Root cause:** The `onMouseUp` handler computes `dx`/`dy` as the straight-line distance between the mouseDown and mouseUp screen positions. If the mouse ends up near its start position (within `MOVE_DEAD_ZONE = 0.01`), the handler bails out early without committing OR rolling back. But during `onMouseMove`, the element's DOM attributes were already mutated (transform, x/y/width/height, d). The early return clears `startPositions`/`scale`/`rotate` state but never restores the element to its original attribute values.

**Reproduction steps:**
1. Select a single element (e.g., a rectangle).
2. Grab a rotation handle.
3. Drag in a wide arc (the element visually rotates during the drag).
4. Return the mouse to very close to the starting point and release.
5. The mouse displacement `dx/dy` is near zero, so the dead zone triggers.

**What goes wrong:** The element's `transform` attribute now contains the rotated value from the last `onMouseMove`, but no undo command was recorded. The element appears rotated, but Ctrl+Z does nothing because no command was pushed to the history. The DOM is now out of sync with the undo stack. The same issue applies to scale operations -- the element's geometry attributes (width, height, x, y, etc.) are mutated during the drag but never restored.

**Fix:** When the dead zone triggers for `scale` or `rotate` modes, restore all mutated attributes from `dragState.origTransforms`, `dragState.startPositions`, and `dragState.origPathDs` before returning. Alternatively, only apply the dead zone check for `move` mode.

---

## Bug 2: `computeTranslateAttrs` breaks for groups with `matrix()` transforms

**File:** `src/model/geometry.ts`, lines 96-106
**Severity:** High

**Root cause:** When a group (`<g>`) is moved via the select tool's drag, `moveElement` correctly uses matrix composition: `multiplyMatrix(translateMatrix(dx, dy), origM)`, producing a `matrix(...)` string. But `computeTranslateAttrs` (used by nudge, paste, and align) uses regex to find/replace `translate(x,y)` in the transform string. After the group has been drag-moved even once, its transform is `matrix(a,b,c,d,e,f)` -- there is no `translate(...)` substring to match.

**Reproduction steps:**
1. Create a group (select multiple elements, Ctrl+G).
2. Drag-move the group with the select tool. Its transform is now `matrix(1, 0, 0, 1, dx, dy)`.
3. Use arrow keys to nudge the group.

**What goes wrong:** `computeTranslateAttrs` at line 99 does `existing.match(/translate\(...)/)` which returns `null`. It then falls through to line 103-104: `translate(${dx}, ${dy}) matrix(1, 0, 0, 1, oldDx, oldDy)` -- prepending a fresh `translate()` before the existing `matrix()`. Per the SVG spec, these compose left-to-right, so the group gets a double translation: the old matrix translation is still there, and the new nudge translation is added on top. Each subsequent nudge adds another translation to the already-wrong matrix.

The same issue affects paste offset (clipboard.ts) and alignment (align.ts), since both delegate to `computeTranslateAttrs`.

**Fix:** Replace the regex approach for groups with matrix composition: parse the existing transform via `parseTransform()`, multiply with `translateMatrix(dx, dy)`, and serialize back with `matrixToString()`.

---

## Bug 3: `moveElement` conjugation is mathematically wrong for elements with matrix transforms

**File:** `src/tools/selectTool.ts`, lines 217-226
**Severity:** Medium

**Root cause:** For non-path elements that have a transform other than `rotate()` (e.g., an imported `matrix()` or a `scale()` transform), the fallback code applies the conjugation `T(dx,dy) * M * T(-dx,-dy)`. This is intended to "shift the coordinate system" but the math is wrong for the purpose of translation.

Conjugation `T * M * T^-1` does NOT translate the visual output by `(dx, dy)`. It shifts the coordinate frame in which `M` operates, which for a pure `scale(2)` transform produces `matrix(2, 0, 0, 2, -dx, -dy)` -- the element moves in the OPPOSITE direction of `(-dx, -dy)` at the scale factor, not by `(dx, dy)`.

The correct formula for "translate the rendered output by (dx, dy)" is simply `T(dx, dy) * M`, i.e., pre-multiply with the translation matrix, which is what the group path on line 202 already does correctly.

**Reproduction steps:**
1. Import an SVG file that contains a `<rect>` with `transform="scale(2)"` (or any non-rotate, non-skew transform).
2. Select the rect and drag it.
3. The element moves in a distorted way -- the displacement depends on the existing transform rather than being a clean (dx, dy) offset.

**What goes wrong:** The element moves incorrectly because the conjugation formula does not produce a simple translation of the visual output. The position attrs (x, y) are updated correctly, but the transform conjugation counteracts part of that movement by shifting the coordinate frame.

**Fix:** Change lines 220-225 to use simple pre-multiplication: `multiplyMatrix(translateMatrix(dx, dy), origM)`, matching the group path.

---

## Bug 4: `getRotation` in ControlBar returns wrong value for `matrix()` transforms

**File:** `src/components/ControlBar.tsx`, lines 48-52
**Severity:** Medium

**Root cause:** `getRotation` uses a regex to extract the angle from `rotate(angle...)`. After any rotation via the select tool on a group (or the matrix fallback path for other elements), the transform is stored as `matrix(a,b,c,d,e,f)`. The regex `rotate\(([-\d.]+)` will not match, so `getRotation` returns `'0'` even though the element is visually rotated.

**Reproduction steps:**
1. Select a group element.
2. Rotate it 45 degrees using the rotation handle.
3. Look at the "R:" field in the ControlBar.

**What goes wrong:** The ControlBar shows `R: 0.00` even though the group is visibly rotated 45 degrees. The rotation information is embedded in the matrix coefficients but the regex cannot extract it.

**Fix:** When the regex fails but the element has a `matrix()` transform, decompose the matrix using `decomposeMatrix()` (already exists in matrix.ts) to extract the rotation angle.

---

## Bug 5: `onRot` in ControlBar destroys existing skew/scale transforms

**File:** `src/components/ControlBar.tsx`, lines 176-184
**Severity:** Medium

**Root cause:** When the user types a new rotation value, `onRot` replaces the entire `transform` attribute with `rotate(angle, cx, cy)` or `''`. If the element previously had a compound transform like `rotate(30, 50, 50) skewX(15)` or `matrix(...)`, the skew/scale components are silently deleted.

**Reproduction steps:**
1. Select a rectangle, rotate it 30 degrees, then apply a skew via the free transform tool.
2. The transform is now something like `rotate(30, 50, 50) skewX(15)`.
3. In the ControlBar, change the rotation value to 45.

**What goes wrong:** The transform becomes `rotate(45, cx, cy)` -- the `skewX(15)` is gone. There is no undo path that restores both the rotation and skew, because `ModifyAttributeCommand` captured only the new full transform string.

**Fix:** Parse the existing transform, extract non-rotation components, and preserve them when writing the new rotation.

---

## Bug 6: `getBBox` in ControlBar ignores transforms for groups and paths

**File:** `src/components/ControlBar.tsx`, lines 54-79
**Severity:** Medium

**Root cause:** For groups and paths (the fallback branch at line 74), `getBBox` calls `(el as SVGGraphicsElement).getBBox()` which returns the **local-space** bounding box, ignoring the element's `transform` attribute. For a group at position (0,0) with `transform="matrix(1, 0, 0, 1, 100, 200)"`, the ControlBar will show X:0 Y:0 instead of X:100 Y:200.

**Reproduction steps:**
1. Create a group.
2. Drag it to position (100, 200) using the select tool. The group now has `transform="matrix(1, 0, 0, 1, 100, 200)"`.
3. Look at the X and Y fields in the ControlBar.

**What goes wrong:** The ControlBar shows X and Y as the local-space bbox origin (likely 0, 0 or the original coordinates of the grouped children), not the actual visual position on the canvas.

**Fix:** For the fallback branch, apply `transformedAABB` (from geometry.ts) to transform the local bbox through the element's transform before displaying.

---

## Bug 7: `onX`/`onY` in ControlBar are no-ops for groups

**File:** `src/components/ControlBar.tsx`, lines 126-165
**Severity:** Low-Medium

**Root cause:** The `onX` and `onY` handlers have explicit branches for `rect`, `image`, `ellipse`, `circle`, `text`, and `path` -- but no branch for `g` (group). When `tag === 'g'`, none of the `if/else if` conditions match, so the function does nothing. The user can see position values in the ControlBar (from `getBBox`), can type new values, but nothing happens.

**Reproduction steps:**
1. Select a group.
2. Change the X value in the ControlBar and press Enter.

**What goes wrong:** Nothing happens. No error, no movement. The input silently reverts to the old value on the next render.

---

## Bug 8: `parsePathD` breaks scientific notation in coordinates

**File:** `src/model/pathOps.ts`, line 17
**Severity:** Low-Medium

**Root cause:** The normalization step `.replace(/-/g, ' -')` blindly inserts a space before every hyphen. This breaks scientific notation like `1.5e-3` by turning it into `1.5e -3`, which then splits into two tokens: `1.5e` and `-3`. `parseFloat('1.5e')` returns `1.5` (drops the `e`), losing the exponent entirely.

SVG path data from other tools (Illustrator, Inkscape) and from this editor's own `matrixToString` (which uses `.toFixed(6)`) can produce very small numbers in scientific notation.

**Reproduction steps:**
1. Import an SVG with a path containing scientific notation coordinates, e.g., `d="M 0 0 L 1.5e-3 2.5e-4"`.
2. Move or scale the path.

**What goes wrong:** The path coordinates are parsed incorrectly. `1.5e-3` (0.0015) becomes `1.5` followed by `-3`, completely changing the path shape. Any subsequent `translatePathD` or `scalePathD` operation produces a corrupted path.

**Fix:** Change the regex to only insert spaces before minus signs that are NOT preceded by `e` or `E`: `.replace(/(?<![eE])-/g, ' -')` (using a negative lookbehind).

---

## Bug 9: `parsePathD` does not handle implicit repeat commands

**File:** `src/model/pathOps.ts`, lines 26-155
**Severity:** Low

**Root cause:** Per the SVG path spec, when a command letter is followed by more coordinate pairs than it requires, the extra pairs are treated as implicit repetitions of that command (except M becomes implicit L after the first pair). The parser does not handle this -- it consumes exactly the expected number of arguments per command letter and then expects the next token to be a new command letter.

For example, `M 0 0 10 20 30 40` should parse as `M 0 0 L 10 20 L 30 40`, but the parser will try to read `10` as a command letter, fail to match any branch, skip it (since it falls through the if-else chain with no match), and the remaining tokens get out of sync.

**Reproduction steps:**
1. Import an SVG containing `d="M 0 0 10 20 30 40 Z"` (implicit L after M) or `d="M 0 0 L 10 10 20 20 30 30"` (implicit repeat L).

**What goes wrong:** The path is parsed incorrectly: implicit lineto coordinates after M are dropped, and the parser index gets desynchronized, potentially producing garbage coordinates for subsequent commands.

**Fix:** After each command handler, check if the next token is a number (not a command letter). If so, repeat the current command (with M becoming L for subsequent pairs).

---

## Summary

| # | File | Severity | Category |
|---|------|----------|----------|
| 1 | selectTool.ts:665-673 | High | Rotate/scale dead zone leaves dirty DOM without undo |
| 2 | geometry.ts:96-106 | High | `computeTranslateAttrs` breaks for groups with matrix() |
| 3 | selectTool.ts:217-226 | Medium | Wrong conjugation math for non-rotate transforms |
| 4 | ControlBar.tsx:48-52 | Medium | `getRotation` fails on matrix() transforms |
| 5 | ControlBar.tsx:176-184 | Medium | `onRot` destroys existing skew/scale transforms |
| 6 | ControlBar.tsx:54-79 | Medium | `getBBox` ignores transforms for groups |
| 7 | ControlBar.tsx:126-165 | Low-Medium | X/Y input is a no-op for groups |
| 8 | pathOps.ts:17 | Low-Medium | Scientific notation broken by `-` replacement |
| 9 | pathOps.ts:26-155 | Low | No implicit repeat command handling |
