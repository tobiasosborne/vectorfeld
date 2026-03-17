# Code Bug Review #2 -- Data Model and Undo/Redo Consistency

Date: 2026-03-17

---

## Bug 1: Paste/Duplicate loses all children of group elements

**File:** `/home/tobias/Projects/vectorfeld/src/model/clipboard.ts`, lines 43-64

**What goes wrong:** Pasting or duplicating a `<g>` (group) element produces an empty group with no children. All child elements (rects, circles, paths, etc.) inside the group are silently dropped.

**Root cause:** `pasteClipboard` serializes the element to XML (which includes children), then parses it back. But it only extracts the root element's **attributes** into a flat `attrs` dict, then calls `AddElementCommand(doc, layer, tag, attrs)`. The `addElement` function (document.ts line 58-67) creates a bare SVG element and sets only attributes -- it never transfers child nodes. The parsed children exist in the temporary `<g>` but are never moved into the newly created element.

**Reproduction steps:**
1. Create two shapes (e.g., a rect and a circle)
2. Select both and press Ctrl+G to group them
3. Press Ctrl+C to copy the group
4. Press Ctrl+V to paste

**Expected:** A new group appears with both shapes inside it.
**Actual:** A new empty `<g>` appears with correct attributes but zero children.

**Same bug in:** `duplicateSelection` (calls `pasteClipboard` internally), so Ctrl+D on groups is also broken.

---

## Bug 2: freeTransformTool undo broken when transform attribute is newly added

**File:** `/home/tobias/Projects/vectorfeld/src/tools/freeTransformTool.ts`, lines 221-244

**What goes wrong:** After using freeTransformTool to add a transform to an element that previously had none (e.g., rotating or skewing an un-transformed element), pressing Ctrl+Z does not remove the transform. The element appears to undo visually but the transform persists.

**Root cause:** The `onMouseUp` commit logic has two code paths:
1. Lines 228-234: iterate `origAttrs`, restore originals, create commands for diffs
2. Lines 237-239: handle newly added `transform` not in `origAttrs`

For path (2), the code reads `currentTransform = el.getAttribute('transform')` at line 237. But the transform was never restored by the loop (it wasn't in `origAttrs`), so `currentTransform` is the new value. When `history.execute(compound)` later calls `ModifyAttributeCommand.execute()`, it captures `oldValue = el.getAttribute('transform')` which is STILL the new value (never restored). On undo, it sets transform back to this captured "old" value (which is actually the new value) instead of `null`.

**Reproduction steps:**
1. Draw a rect (no existing transform)
2. Switch to freeTransformTool (Q)
3. Rotate the rect by dragging outside a corner
4. Release mouse (transform is committed)
5. Press Ctrl+Z to undo

**Expected:** Rect returns to original un-rotated state (transform attribute removed).
**Actual:** Rect keeps the rotation. The undo appears to do nothing.

---

## Bug 3: freeTransformTool rotation clobbers existing rotation on non-group elements

**File:** `/home/tobias/Projects/vectorfeld/src/tools/freeTransformTool.ts`, lines 196-201

**What goes wrong:** Rotating a non-group element that already has a rotation replaces the existing rotation entirely instead of composing with it.

**Root cause:** The code at line 199 sets the transform to `rotate(degrees, cx, cy)` where `degrees` is the delta angle from the current drag only. It does not add the original rotation angle. Compare with `selectTool.ts` lines 594-604, which correctly extracts `baseAngle` from the original transform and computes `totalAngle = baseAngle + angleDeg`.

The code preserves skew via `parseSkew`/`setSkew`, but the rotation value itself is just the delta.

**Reproduction steps:**
1. Draw a rect
2. Use selectTool to rotate it 45 degrees
3. Switch to freeTransformTool (Q)
4. Rotate it an additional 10 degrees

**Expected:** Rect is now at 55 degrees total rotation.
**Actual:** Rect is at 10 degrees. The original 45 degree rotation is lost.

---

## Bug 4: freeTransformTool group scale uses doc-space anchor in local-space matrix composition

**File:** `/home/tobias/Projects/vectorfeld/src/tools/freeTransformTool.ts`, line 296

**What goes wrong:** Scaling a group that has an existing non-identity transform (e.g., from a previous rotation) produces an incorrect visual result. The group warps or jumps unexpectedly.

**Root cause:** In `detectMode` (line 99), the anchor is set to a **transformed** (doc-space) corner point via `applyMatrixToPoint(transform, ...)`. But in `applyScale` (line 296), this doc-space anchor is passed to `scaleAroundMatrix(sx, sy, anchor.x, anchor.y)`, which is then **post-multiplied** with the original matrix: `multiplyMatrix(origM, scaleAroundMatrix(...))`. Post-multiplication means the scale-around operates in the **pre-transform** (local) coordinate space, but the anchor coordinates are in doc space. The anchor point is in the wrong coordinate space.

The `selectTool.ts` avoids this bug because its anchor comes from `computeAnchor(handle, bbox)` where `bbox` is the un-transformed local BBox for single elements (lines 392-395).

**Reproduction steps:**
1. Create a group of shapes
2. Use selectTool to rotate the group 45 degrees
3. Switch to freeTransformTool (Q)
4. Grab a corner handle and drag to scale

**Expected:** Group scales uniformly around the opposite corner.
**Actual:** Group jumps/distorts because the anchor point is interpreted in the wrong coordinate space.

---

## Bug 5: Nudging a path with a matrix() transform moves in wrong direction

**File:** `/home/tobias/Projects/vectorfeld/src/model/geometry.ts`, lines 69-95

**What goes wrong:** Arrow-key nudging a path that has a `matrix()` transform (as produced by freeTransformTool or selectTool rotation fallback) moves the path in a skewed/rotated direction instead of the expected screen direction.

**Root cause:** `computeTranslateAttrs` for paths uses regex matching to find `translate()`, `rotate()`, and `skew()` functions in the transform string. When the transform is a `matrix(a,b,c,d,e,f)` string, none of these regexes match. So:
- `transMatch` = null, `totalDx = dx`, `totalDy = dy`
- The code translates the `d` attribute points by `(dx, dy)` in **local** coordinate space
- The `matrix()` transform is preserved as-is

Translating d-points by (1, 0) in local space does NOT move the element 1 unit to the right on screen when a matrix transform is applied. It moves along the matrix's local x-axis, which could be rotated or skewed.

This affects any path that has been rotated via the group rotation path (which produces `matrix()` strings) or any imported SVG path with a `matrix()` transform.

**Reproduction steps:**
1. Draw a path
2. Rotate it using freeTransformTool (which produces a matrix() transform for groups, or if the path was in a group that was then ungrouped)
3. Select the path and press the Right arrow key to nudge

**Expected:** Path moves 1mm to the right.
**Actual:** Path moves 1mm along the matrix's local x-axis (e.g., diagonally for a 45-degree rotation).

---

## Bug 6: freeTransformTool scale for non-group elements mixes coordinate spaces when element has existing transform

**File:** `/home/tobias/Projects/vectorfeld/src/tools/freeTransformTool.ts`, lines 268-287 (in `applyScale`)

**What goes wrong:** Scaling a rotated rect, ellipse, circle, or line with freeTransformTool produces incorrect geometry. The shape warps or shifts unexpectedly.

**Root cause:** Same coordinate-space mismatch as Bug 4, but for non-group primitives. The `anchor` from `detectMode` is in doc space (post-transform), but `applyScale` uses it directly with local-space attributes. For example, for a rect:
```
el.setAttribute('x', String(anchor.x + (getOrig('x') - anchor.x) * sx))
```
Here `anchor.x` is in doc space and `getOrig('x')` is in local space. The subtraction `getOrig('x') - anchor.x` is meaningless when the element has a rotation transform.

The `selectTool.ts` avoids this because for single rotated elements, it uses the un-transformed local BBox (lines 392-395), keeping the anchor in local space.

**Reproduction steps:**
1. Draw a rect
2. Rotate it 45 degrees using selectTool
3. Switch to freeTransformTool (Q)
4. Grab a corner handle and scale

**Expected:** Rect scales proportionally in place.
**Actual:** Rect's position and size are wrong because the anchor math mixes doc-space and local-space coordinates.

---

## Bug 7: path nudge absorbs existing translate() but corrupts d-attribute for subsequent operations

**File:** `/home/tobias/Projects/vectorfeld/src/model/geometry.ts`, lines 69-95

**What goes wrong:** When a path has `transform="translate(10, 20)"`, the first nudge absorbs the translate into the d-attribute points. This changes the path's local coordinate space. Any undo of an EARLIER operation (before the nudge) that referenced the original d-attribute now restores a d-value that is geometrically inconsistent with the stripped transform.

**Root cause:** Nudging a path with a translate transform bakes the translate + nudge offset into the d-points and removes the translate from the transform. This is a lossy operation that changes the coordinate system. If the user then undoes past the nudge to a state before the translate was added, the undo stack has the correct d and transform values. BUT if there was a non-undoable source of the translate (e.g., imported SVG, or a translate that was added by dragging in selectTool and then undone partially), the d-coordinates are permanently altered.

More concretely: if a path has `d="M0 0 L50 50"` and `transform="translate(10, 20)"`, after nudging right by 1:
- d becomes `"M11 20 L61 70"` (all points shifted by totalDx=11, totalDy=20)
- transform becomes `""` (translate stripped)

This is visually correct. But the d-attribute has been fundamentally rewritten. If any other code path (e.g., path editing tool) was caching the original d-point coordinates, those caches are now stale.

**Reproduction steps:**
1. Import or create a path with `transform="translate(10, 20)"`
2. Nudge the path right by 1mm (arrow key)
3. Observe that d-attribute has been fundamentally rewritten (translate baked in)
4. Undo the nudge -- d and transform are correctly restored (this part works)
5. But if selectTool's drag created the translate (move the path, then nudge), the d-coordinate system has shifted

**Severity:** Medium-low. The undo stack handles it correctly in isolation, but the coordinate bake-in can surprise other tools that cache d-points.

---

## Summary

| # | Severity | File | Description |
|---|----------|------|-------------|
| 1 | **High** | clipboard.ts | Paste/duplicate drops all children of group elements |
| 2 | **High** | freeTransformTool.ts | Undo broken when transform is newly added |
| 3 | **Medium** | freeTransformTool.ts | Rotation clobbers existing rotation on non-groups |
| 4 | **Medium** | freeTransformTool.ts | Group scale uses wrong coordinate space for anchor |
| 5 | **Medium** | geometry.ts | Nudge moves path in wrong direction with matrix() transform |
| 6 | **Medium** | freeTransformTool.ts | Scale on rotated primitives mixes coordinate spaces |
| 7 | **Low** | geometry.ts | Path nudge absorbs translate, changing d-coordinate system |
