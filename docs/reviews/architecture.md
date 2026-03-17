# Architecture Review: Group Transform Fixes in selectTool.ts

**Date:** 2026-03-17
**Scope:** Bugs 1-4 (move, scale, rotate, scale-mouse-mapping for groups/paths)
**Files reviewed:** selectTool.ts, matrix.ts, geometry.ts, commands.ts, freeTransformTool.ts, directSelectTool.ts, lassoTool.ts, knifeTool.ts, nudge.ts, clipboard.ts, align.ts, reflect.ts

---

## 1. The Dual-Path Architecture: Matrix Composition vs Regex Manipulation

### Current Design

selectTool.ts uses two distinct strategies for applying transforms:

- **Groups (`<g>`):** Full matrix composition via `parseTransform` / `multiplyMatrix` / `matrixToString`. Move, scale, and rotate all produce a single `matrix(a,b,c,d,e,f)` attribute.
- **Elements with position attrs (rect, ellipse, circle, line, text):** Modify position attributes directly (x, y, cx, cy, etc.) and use regex-based manipulation of the `transform` attribute to shift rotation centers and preserve skew.

### Assessment: Correct for now, but carries maintenance risk

The split is architecturally justified by how SVG works. Elements like `<rect>` have geometric attributes (x, y, width, height) that define their shape in local space. Moving a rect by changing `x` from 10 to 20 is semantically cleaner than wrapping it in `translate(10,0)` -- it keeps the SVG readable, exports cleanly, and interoperates with the properties panel. Groups have no such attributes; transform is their only positioning mechanism.

**However, the regex path is a latent maintenance trap.** Three specific risks:

1. **Regex fragility.** The patterns like `orig.match(/rotate\(([-\d.]+)(?:,\s*([-\d.]+),\s*([-\d.]+))?\)/)` assume a specific formatting of the transform string. If any code path writes `rotate(45 100 200)` (space-separated, valid SVG) instead of `rotate(45, 100, 200)`, the regex silently fails and the rotation center is lost. The matrix codepath has no such fragility -- `parseTransform` handles all syntactic variants.

2. **Skew/scale composition.** The current regex path handles `rotate(...)` + `skewX(...)` + `skewY(...)` by string concatenation. This works only because those specific transforms commute in the restricted ways they're used. If `scale()` or `translate()` ever appears on a non-group element's transform (e.g., from reflect.ts's `buildScaleTransform`, which writes `translate(...) scale(...)` for paths), the regex path in `moveElement` won't handle it -- the transform will be silently mangled.

3. **Growing tag-type switch statements.** `moveElement`, `scaleElement`, `getAllGeomAttrs`, and `getPositionAttrs` all contain parallel per-tag-name switch/if-else chains. Each new element type requires updating all four. This is the same pattern that caused the `image` tag gap (see finding #5).

**Recommendation:** The dual-path design should remain for now. Migrating elements to transform-only positioning would break the properties panel, SVG export readability, and several downstream consumers. But the regex path in `moveElement` (lines 214-225) should be migrated to matrix composition in a future pass -- parse the full transform, compose with a new rotation center offset, serialize back via `matrixToString`. This eliminates the regex fragility without changing the position-attribute strategy.

---

## 2. Cross-Tool Consistency: Who Else Manipulates Transforms?

Six other modules manipulate element transforms. Their approaches vary:

| Module | Approach | Uses matrix.ts? | Group-safe? |
|---|---|---|---|
| `geometry.ts:computeTranslateAttrs` | Regex for rotate center shift; `translate(...)` prepend for groups | No | Partial -- groups use translate prepend/replace, not matrix composition |
| `reflect.ts:buildScaleTransform` | String concatenation: `translate(...) scale(...) existing` | No | Yes (treats groups same as paths) |
| `freeTransformTool.ts` | Regex for rotate (`rotate(angle, cx, cy)`); direct attr modification for scale | Imports `parseTransform`, `parseSkew` | Incomplete -- scale `applyScale` has no `g` case (line 285: "paths and groups use transform-based scaling (handled elsewhere)") |
| `nudge.ts` | Delegates to `computeTranslateAttrs` | Indirect | Same as geometry.ts |
| `clipboard.ts:pasteClipboard` | Delegates to `computeTranslateAttrs` | Indirect | Same as geometry.ts |
| `align.ts:applyDelta` | Delegates to `computeTranslateAttrs` | Indirect | Same as geometry.ts |

### Key inconsistency: `computeTranslateAttrs` vs `moveElement`

`geometry.ts:computeTranslateAttrs` (used by nudge, paste, align) and `selectTool.ts:moveElement` (used by drag-move) implement the same logical operation -- translating an element -- but with different code. Critically, they diverge for groups:

- **`computeTranslateAttrs` (geometry.ts, line 96-106):** Uses regex to find/replace `translate(x,y)` in the existing transform string. Prepends `translate(...)` if none found.
- **`moveElement` (selectTool.ts, line 208-211):** Uses matrix composition: `multiplyMatrix(translateMatrix(dx,dy), parseTransform(orig))` serialized to `matrix(...)`.

The `computeTranslateAttrs` approach will break if a group has a `matrix(...)` transform (no `translate(...)` substring to find/replace). After the selectTool fix, groups will commonly have `matrix(...)` transforms. This means **nudge, paste, and align will produce wrong results for groups that have been moved or scaled via the select tool**, because `computeTranslateAttrs` won't parse the matrix correctly.

**This is a latent bug.** It should be fixed by migrating `computeTranslateAttrs`'s group path to use the same matrix composition as `moveElement`.

### freeTransformTool.ts gap

`freeTransformTool.ts:applyScale` (line 254-286) has no `g` case. The comment on line 285 says "paths and groups use transform-based scaling (handled elsewhere)" but there is no "elsewhere" for groups in this tool. If a user selects a group and tries to scale it with the free transform tool, nothing will happen. This matches the original Bug 2 that was fixed in selectTool but was not propagated to freeTransformTool.

**Recommendation:** Add the same matrix-based group scaling to freeTransformTool's `applyScale`, or better, extract a shared `scaleGroupViaTransform(el, sx, sy, anchorX, anchorY)` utility that both tools call.

---

## 3. commitChanges() Correctness for Matrix-Based Transforms

### How it works

`commitChanges()` (lines 289-330) iterates over selected elements and:
1. For each position attribute (from `startPositions`), compares current value to original and creates a `ModifyAttributeCommand` if changed.
2. For path `d` attributes, same diff logic.
3. For `transform` attributes, same diff logic.

After recording the new value, it **resets the element to its original state** so that `cmd.execute()` can apply the change forward. This reset-then-execute pattern is correct and is the same pattern used by `freeTransformTool.ts:onMouseUp`.

### Analysis

For groups, `moveElement` now writes a `matrix(...)` string to the transform attribute. `commitChanges` captures this correctly because:
- `origTransforms` stores the original transform string (or null).
- The comparison at line 314 is `newTransform !== origTransform` which is a string comparison.
- The new `matrix(...)` string will differ from the original, so it gets committed.
- Reset at lines 317-320 restores the original, then `cmd.execute()` applies the new matrix.

For groups, `scaleElement` similarly writes `matrix(...)` via `matrixToString`. Same commit path works.

**One subtle correctness issue:** For move operations on groups, `startPositions` will have `{ attr: 'transform', vals: {} }` (from `getPositionAttrs`, line 178). The `vals` is empty, so the loop at line 294 iterates over zero entries -- no position attribute commands are created. The transform change is captured solely by the transform-diff block at lines 311-322. This is correct. But it means groups only produce one `ModifyAttributeCommand` per move (the transform), while rects produce three (x, y, transform). This asymmetry is fine but not obvious.

**Potential fragility:** `commitChanges` assumes that `origTransforms` is populated for any element whose transform might change. If a caller forgets to populate `origTransforms`, transform changes are silently lost. This contract is implicit. Currently all three setup paths (move, scale, rotate mousedowns) correctly populate `origTransforms`, but there is no guard.

---

## 4. Module Boundaries: Where Should matrixToString/invertMatrix Live?

### Current layout

`matrix.ts` contains:
- Type: `Matrix`
- Construction: `identityMatrix`, `translateMatrix`, `scaleMatrix`, `rotateMatrix`, `skewXMatrix`, `skewYMatrix`
- Arithmetic: `multiplyMatrix`, `invertMatrix`, `applyMatrixToPoint`
- Decomposition: `decomposeMatrix`
- Parsing: `parseTransform`, `parseSkew`, `setSkew`
- Serialization: `matrixToString`

### Assessment: Correct home

`matrixToString` and `invertMatrix` belong in `matrix.ts`. The module is a coherent unit: "2D affine matrix math for SVG transforms." Every function in it operates on the `Matrix` type or converts to/from it. A separate "transform utils" module would fragment this cohesion without adding clarity.

The module is 191 lines. That is a healthy size. If it grew past ~400 lines, splitting into `matrix-core.ts` (type + arithmetic) and `matrix-svg.ts` (parsing + serialization + skew helpers) would make sense. Not yet.

`parseSkew` and `setSkew` are the weakest members -- they use regex on strings rather than operating on matrices. They exist because the skew property panel needs to read/write skew independently without roundtripping through matrix decomposition. This is pragmatic but should be noted as tech debt: ideally, all transform manipulation would go through parse -> modify matrix -> serialize.

---

## 5. The `image` Tag Gap in selectTool

### Finding

`selectTool.ts` does not handle `<image>` in:

- **`getAllGeomAttrs`** (line 52-89): No `image` case. Returns `{}`.
- **`getPositionAttrs`** (line 164-179): No `image` case. Falls through to `{ attr: 'transform', vals: {} }`.
- **`moveElement`** (line 181-228): No `image` case. Falls through to transform-only path (group behavior).
- **`scaleElement`** (line 231-286): No `image` case. No-op.

The `<image>` tag uses the same position model as `<rect>` (x, y, width, height). Other modules handle this correctly:
- `geometry.ts:computeTranslateAttrs` line 63: `tag === 'rect' || tag === 'text' || tag === 'image'`
- `freeTransformTool.ts:applyScale` line 264: `tag === 'rect' || tag === 'image'`
- `reflect.ts` lines 23, 57: `tag === 'rect' || tag === 'text' || tag === 'image'`

**This is a real bug.** Moving an `<image>` element via the select tool will treat it like a group (transform-only), which will work but produce a `matrix(...)` transform on an element that should be positioned via x/y attributes. Scaling an `<image>` will silently do nothing.

The `docs/lessons.md` entry on line 19 already flags this: "When adding a new SVG element type, it needs support in: ... selectTool.ts (hit test + move/scale)." The image support was added to geometry.ts and freeTransformTool.ts but not propagated to selectTool.ts.

**Fix:** Add `image` alongside `rect` in `getAllGeomAttrs`, `getPositionAttrs`, `moveElement`, and `scaleElement`. Trivial -- image uses the same x/y/width/height model as rect.

---

## 6. Missing Element Types: polygon, polyline

`selectTool.ts` also has no cases for `<polygon>` or `<polyline>`. These elements have no simple position attributes (they use a `points` attribute with coordinate lists). `computeTranslateAttrs` in geometry.ts handles them like groups (via translate transform, line 96). selectTool's `moveElement` will fall through to the transform path, which now uses matrix composition. This is actually correct for polygon/polyline since you can't meaningfully offset a points list with a simple dx/dy on individual attributes.

However, `scaleElement` has no polygon/polyline case and will silently skip them. If the project ever creates these elements (currently they appear only in reflect.ts's tag list), scaling will not work. Low priority, but worth noting.

---

## 7. Implicit Contracts Between moveElement/scaleElement and commitChanges

The following contracts are implicit (not enforced by types or assertions):

1. **`startPositions` must be populated before calling `moveElement`/`scaleElement`.** Both functions call `dragState.startPositions.get(el)` and return early if null. If the setup code in onMouseDown fails to populate startPositions for an element, it will be silently unmovable.

2. **`origTransforms` must be populated for transform changes to be committed.** `commitChanges` only diffs transforms for elements in `origTransforms`. If an element's transform changes but it was not in `origTransforms`, the change is invisible to undo.

3. **`origPathDs` must be populated for path `d` changes to be committed.** Same pattern as transforms.

4. **`commitChanges` resets elements to original state before executing commands.** This means the DOM is temporarily in the "before" state during `history.execute()`. If any listener or side effect reads the DOM during execute, it sees stale data for a frame. In practice, `ModifyAttributeCommand.execute()` immediately sets the new value, so the window is tiny.

5. **For groups, `startPositions` vals is empty.** `getPositionAttrs` returns `{ attr: 'transform', vals: {} }` for groups. `commitChanges` iterates `Object.entries(start.vals)` which yields nothing. The entire move/scale delta for groups is captured only through the `origTransforms` diff path. If `origTransforms` is missing, the group's change is silently lost.

**Recommendation:** Contracts 1-3 could be enforced with a debug assertion: `if (DEBUG && !dragState.startPositions.has(el)) throw new Error(...)`. Contract 5 is the most fragile -- it would be clearer if `getPositionAttrs` for groups returned something more explicit than an empty vals object, or if `commitChanges` had a code comment explaining the asymmetry.

---

## 8. Rotation Commit Path Asymmetry

Rotation uses a different commit path than move/scale. Move and scale go through `commitChanges()`. Rotation is committed inline in `onMouseUp` (lines 670-685):

```
const newTransform = el.getAttribute('transform') || ''
// Reset to original for proper undo capture
el.setAttribute('transform', origTransform)
const cmd = new ModifyAttributeCommand(el, 'transform', newTransform)
getHistory().execute(cmd)
```

This works correctly but is a different pattern than `commitChanges`. Having two commit mechanisms for one tool increases the chance of a future change breaking one path while the other works. Consider unifying: rotation could populate `startPositions` and `origTransforms` and call `commitChanges('Rotate')` instead of inlining its own commit logic.

---

## 9. Summary of Findings

| # | Finding | Severity | Action |
|---|---|---|---|
| 1 | Dual-path (matrix vs regex) architecture is justified but regex path is fragile | Low | Migrate regex path to matrix composition in future pass |
| 2 | `computeTranslateAttrs` in geometry.ts uses regex for groups, will break after `matrix(...)` transforms | **High** | Migrate to matrix composition |
| 3 | freeTransformTool has no group scaling | Medium | Add `g` case or extract shared utility |
| 4 | commitChanges correctly handles matrix-based transforms | OK | No action |
| 5 | `image` tag missing from selectTool move/scale | Medium | Add alongside `rect` in all four functions |
| 6 | `polygon`/`polyline` missing from scaleElement | Low | Add when these elements become creatable |
| 7 | Implicit contracts between setup and commit | Low | Add debug assertions |
| 8 | Rotation uses different commit path than move/scale | Low | Consider unifying |
| 9 | matrixToString/invertMatrix correctly placed in matrix.ts | OK | No action |

### Priority order for follow-up work

1. **Fix `computeTranslateAttrs` for matrix-format transforms** (finding #2) -- this is a latent bug that will bite as soon as someone nudges or aligns a group that was previously moved.
2. **Add `image` to selectTool** (finding #5) -- straightforward, one-line additions in four places.
3. **Add group scaling to freeTransformTool** (finding #3) -- prevents a silent no-op for an expected interaction.
