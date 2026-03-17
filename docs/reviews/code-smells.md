# Code Smells Review: select-tool bug fixes + matrix refactor

Reviewed: 2026-03-17
Files: `src/tools/selectTool.ts`, `src/model/matrix.ts`, `src/model/matrix.test.ts`

---

## 1. Divergent Change -- two parallel transform code paths

**Severity: HIGH**

`selectTool.ts` now maintains two distinct strategies for handling transforms:

- **Groups (`<g>`)**: full matrix composition via `parseTransform` / `multiplyMatrix` / `matrixToString` (lines 208-211 in `moveElement`, 277-284 in `scaleElement`, 589-593 in the rotate handler).
- **Primitives (rect, ellipse, etc.)**: regex string manipulation to extract `rotate(...)`, `skewX(...)`, `skewY(...)` and splice them back together (lines 214-225 in `moveElement`, 596-605 in the rotate handler).

The two paths solve the same conceptual problem (composing a new transform with an existing one) using completely different mechanisms. Any future change to how transforms are stored or composed will require touching both paths in lockstep. The regex path is also fragile -- it does not handle `matrix()` or `scale()` sub-strings that may already be present in a primitive's transform attribute.

**Recommendation**: Unify on matrix composition for all element types. Primitives already have `parseTransform` available; the only reason the regex path exists is to preserve the human-readable `rotate(angle, cx, cy) skewX(n)` form. Consider normalizing to `matrix()` output for all elements, or extract a `composeRotation(origTransform, angleDeg, cx, cy)` helper that uses matrices internally but can optionally serialize to the readable form.

---

## 2. Shotgun Surgery -- tag-name switch repeated 5 times

**Severity: HIGH**

Adding a new SVG element type (e.g., `<polygon>`, `<polyline>`, `<image>`) requires updating **all** of these locations:

| # | Function         | Line  | Purpose                     |
|---|------------------|-------|-----------------------------|
| 1 | `getAllGeomAttrs` | 52-88 | Read all geometry attrs     |
| 2 | `getPositionAttrs`| 164-179 | Read position attrs only  |
| 3 | `moveElement`    | 181-228 | Translate by dx/dy         |
| 4 | `scaleElement`   | 231-285 | Scale around anchor         |
| 5 | rotate handler   | 586-607 | `g` vs others (implicit)   |

`getPositionAttrs` and `getAllGeomAttrs` overlap significantly -- `getPositionAttrs` is a strict subset but uses a different return shape (`{ attr, vals }` vs plain `Record`). Additionally, `freeTransformTool.ts` (line 264) has its own parallel tag switch for reading bbox attributes.

**Recommendation**: Create a per-element-type strategy object (or a simple lookup table) that declares geometry attributes, position attributes, and move/scale semantics. Each element type registers once; the tool functions become generic dispatchers. This collapses 5 switch chains into 1 registration site.

---

## 3. Feature Envy -- selectTool reaching into matrix internals

**Severity: MEDIUM**

`selectTool.ts` imports 8 functions from `matrix.ts` and manually orchestrates multi-step matrix pipelines such as:

```ts
// line 279-283: scale around a point
const scaleAround = multiplyMatrix(
  multiplyMatrix(translateMatrix(anchorX, anchorY), scaleMatrix(sx, sy)),
  translateMatrix(-anchorX, -anchorY)
)
const newM = multiplyMatrix(origM, scaleAround)
```

This is a well-known affine operation ("scale around point") that belongs in the matrix module. The tool should call `scaleAroundPoint(sx, sy, cx, cy)` -- not assemble the sandwich itself.

Similarly, line 590 (`multiplyMatrix(rotM, origM)`) for rotation composition is another common operation.

**Recommendation**: Add `scaleAroundMatrix(sx, sy, cx, cy): Matrix` and optionally `composeTransform(original: Matrix, operation: Matrix): Matrix` to `matrix.ts`. This reduces the tool's coupling to matrix internals.

---

## 4. Long Method -- mouse handlers

**Severity: MEDIUM**

| Handler      | Lines     | Span |
|-------------|-----------|------|
| onMouseDown | 351-491   | 140  |
| onMouseMove | 493-611   | 118  |
| onMouseUp   | 613-695   | 82   |

`onMouseDown` is the longest at 140 lines. It handles 4 distinct entry points (rotation handle, scale handle, element hit, marquee start) in one function. `onMouseMove` handles 4 modes (marquee, move, scale, rotate) inline.

These are not critically long for event handlers in a graphics editor, but the scale and rotate paths in `onMouseMove` (lines 533-607, ~75 lines) would benefit from extraction into named functions like `handleScaleMove` and `handleRotateMove`.

**Recommendation**: Extract the mode-specific bodies of `onMouseMove` into helper functions. This also enables unit-testing the math paths without simulating full mouse events.

---

## 5. Primitive Obsession -- transforms as strings parsed repeatedly

**Severity: MEDIUM**

The transform attribute is read as a string, parsed to a matrix, used, then serialized back. But the same original transform string gets parsed multiple times across a single drag operation:

- `moveElement` parses `origTransform` on every call (line 209: `parseTransform(orig)`)
- `scaleElement` parses `origTransforms.get(el)` on every call (line 278: `parseTransform(origT)`)
- The rotate handler parses `origT` on every mousemove (line 591)

During a drag, `onMouseMove` fires at ~60Hz, so `parseTransform` runs once per frame per selected element, re-parsing the same immutable original string every time.

**Recommendation**: Parse the original transform once at drag-start and store the `Matrix` in `dragState.origMatrices: Map<Element, Matrix>`. The per-element helpers then receive the pre-parsed matrix directly.

---

## 6. Dead Code / Potentially Unreachable Code

**Severity: LOW**

- **`decomposeMatrix`** (matrix.ts line 70-103) is exported and tested but never called by any production code. Only the test file references it. It may have been written speculatively or for a feature that was not completed.

- **`transformedAABB` wrapper** (selectTool.ts line 120-125) wraps `sharedTransformedAABB` without adding any value. It exists presumably for historical reasons when the function was local.

- **`hitTest` / `hitTestAll` wrappers** (lines 15-21) similarly just forward to the shared module.

**Recommendation**: Remove `decomposeMatrix` or mark it with a `// Used by: tests only` comment if it is intended for future use. The thin wrapper functions (`transformedAABB`, `hitTest`, `hitTestAll`) can be replaced with direct imports.

---

## 7. Magic Numbers

**Severity: LOW**

| Value    | Location                        | Meaning                                 |
|----------|---------------------------------|-----------------------------------------|
| `1e-10`  | matrix.ts:141                   | Singularity threshold for matrix invert |
| `0.001`  | selectTool.ts:562-563           | Minimum bbox dimension to avoid div/0   |
| `0.1`    | selectTool.ts:555, 559          | Minimum allowed width/height during scale |
| `0.5`    | selectTool.ts:634               | Marquee click-vs-drag threshold (doc units) |
| `0.01`   | selectTool.ts:663               | Dead-zone for move commit               |
| `15`     | selectTool.ts:582               | Rotation snap increment in degrees      |
| `16`     | selectTool.ts:85                | Default font-size fallback for text     |
| `2`      | selectTool.ts:523               | Smart guide tolerance in screen pixels  |

Most of these are reasonable but undocumented. The `1e-10` singularity threshold in `invertMatrix` is the most consequential -- a near-singular matrix will silently return identity instead of signaling an error, which could mask bugs.

**Recommendation**: Extract at least `MIN_BBOX_DIMENSION = 0.001`, `MIN_SCALE_SIZE = 0.1`, `ROTATION_SNAP_DEG = 15`, and `SINGULARITY_THRESHOLD = 1e-10` as named constants. For `invertMatrix`, consider returning `null` for singular matrices so callers can handle the failure explicitly.

---

## 8. DRY Violations

**Severity: MEDIUM**

**Regex-based skew preservation is duplicated.** The pattern of extracting `skewX(...)` and `skewY(...)` from a transform string and appending them to a new transform appears in two places:

- `moveElement` lines 220-223
- Rotate handler lines 601-604

Both do the same thing: `orig.match(/skewX\([^)]+\)/)` then `newTransform += skewXMatch[0]`. This is also done in `geometry.ts` (lines 81-82) and `ControlBar.tsx` (line 139).

**`computeAnchor` called twice.** Lines 420-421 call `computeAnchor(handle, bbox)` twice to extract `.x` and `.y` separately instead of destructuring a single call:

```ts
anchorX: computeAnchor(handle, bbox).x,
anchorY: computeAnchor(handle, bbox).y,
```

This creates a throwaway object each call. Minor, but sloppy.

**Recommendation**: Extract `preserveSkew(origTransform, newRotateTransform): string` as a shared helper. Destructure the `computeAnchor` call once: `const anchor = computeAnchor(handle, bbox)`.

---

## 9. Missing Null Checks

**Severity: MEDIUM**

- **`el.getAttribute('transform')` on line 541**: Used without a null guard before passing to `parseTransform`. The surrounding `if (transform)` check on line 542 handles `null`, but if that branch is skipped, `localPt` stays as-is, which is correct but not obviously intentional.

- **`el.getAttribute('d')` on line 304**: `newD` could be `null` if the `d` attribute was removed during the drag. The check `newD !== null` is present, so this is safe.

- **`dragState.rotate!.origTransform` on line 587**: Non-null assertion (`!`) on `dragState.rotate` inside a block already guarded by `dragState.rotate` being truthy on line 575. The assertion is technically redundant but suggests the guard is far enough away that the author was not confident. Safe but a minor TypeScript smell.

- **`target?.getAttribute?.('data-role')` on lines 357, 388**: Uses optional chaining, which is correct -- `e.target` could theoretically be a non-Element `EventTarget`. But `target` is cast to `Element` on line 356 without a guard, then optional chaining is used on the cast result, which is contradictory. If the cast is wrong, `getAttribute` would throw before the `?.` has a chance to help.

**Recommendation**: On line 356, either keep the cast and drop the `?.` (you trust the cast), or use `instanceof Element` guard and drop the cast (you do not trust it). The current code is half-and-half.

---

## 10. Type Safety

**Severity: LOW**

- **`as HandlePosition`** (line 389): `target.getAttribute('data-handle-pos')` returns `string | null`. The cast assumes the attribute value is always a valid `HandlePosition` union member. If the DOM is corrupted or a third-party extension adds an unexpected value, this could cause silent misbehavior in the `switch` statement inside `computeAnchor` (which has no `default` case and returns `undefined` for unknown values, despite the return type suggesting otherwise).

- **`as SVGGraphicsElement`** (lines 133, 362, 397, 643): These casts are used to access `getBBox()`. If the element is not actually an `SVGGraphicsElement` (e.g., a `<defs>` child or `<metadata>`), `getBBox()` will throw. The `try/catch` blocks on lines 132 and 642 handle this for the iteration cases, but lines 362 and 397 are unguarded.

- **`as SVGElement`** (line 640): Cast on `layer` to access `.style.display`. Since layers come from `querySelectorAll('g[data-layer-name]')`, they are always `SVGGElement`, making this safe but unnecessarily loose.

**Recommendation**: Add a `default` branch (or exhaustive check) to `computeAnchor`. Guard the `getBBox()` calls on lines 362 and 397 with try/catch, or check `instanceof SVGGraphicsElement` first.

---

## Summary

| # | Smell                          | Severity | Effort to Fix |
|---|--------------------------------|----------|---------------|
| 1 | Divergent change (dual paths)  | HIGH     | Medium        |
| 2 | Shotgun surgery (5 tag switches)| HIGH    | Medium        |
| 3 | Feature envy (matrix assembly) | MEDIUM   | Low           |
| 4 | Long methods (140-line handler)| MEDIUM   | Low           |
| 5 | Primitive obsession (re-parse) | MEDIUM   | Low           |
| 6 | Dead code (decomposeMatrix)    | LOW      | Trivial       |
| 7 | Magic numbers                  | LOW      | Trivial       |
| 8 | DRY violations (skew, anchor)  | MEDIUM   | Low           |
| 9 | Missing null checks            | MEDIUM   | Low           |
| 10| Type safety (as casts)         | LOW      | Low           |

The two HIGH findings (divergent change and shotgun surgery) are structural. They will not cause bugs today but will increase the cost and risk of every future element-type addition or transform-handling change. Addressing them together -- by creating an element-type strategy table and unifying on matrix composition -- would resolve most of the MEDIUM findings as collateral benefit.
