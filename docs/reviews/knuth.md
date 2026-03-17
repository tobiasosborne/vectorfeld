# Code Review: Group Transform Bug Fixes

**Reviewer:** Donald Knuth (simulated)
**Date:** 2026-03-17
**Files:** `src/model/matrix.ts`, `src/tools/selectTool.ts`
**Scope:** 4 bug fixes for group/path transform handling, plus new `invertMatrix` and `matrixToString` utilities

---

## 1. Matrix Representation Convention

The file header states:

```
Matrix is [a, b, c, d, e, f] representing:
  | a c e |
  | b d f |
  | 0 0 1 |
```

This matches the SVG specification (SVG 1.1, Section 7.15.3), where `matrix(a,b,c,d,e,f)` denotes the column-major affine matrix with `a,b` as the first column and `c,d` as the second. The point transformation `[x', y'] = [ax + cy + e, bx + dy + f]` is confirmed by `applyMatrixToPoint` at line 59--63. **CORRECT.**

---

## 2. `invertMatrix` (matrix.ts, lines 138--144)

```ts
const det = a * d - b * c
const id = 1 / det
return [d * id, -b * id, -c * id, a * id, (c * f - d * e) * id, (b * e - a * f) * id]
```

### Derivation check

For the 2x2 linear part `M_lin = [[a, c], [b, d]]`, the inverse is `(1/det) * [[d, -c], [-b, a]]`. Packing back into `[a', b', c', d']` storage order (column-major), that gives `[d/det, -b/det, -c/det, a/det]`. **CORRECT.**

For the translation part, we need `M_lin^{-1} * [-e, -f]^T`:

```
e' = (1/det) * ( d*(-e) + (-c)*(-f) ) = (1/det) * (-de + cf) = (cf - de)/det
f' = (1/det) * ( (-b)*(-e) + a*(-f) ) = (1/det) * (be - af) = (be - af)/det
```

The code returns `(c*f - d*e) * id` and `(b*e - a*f) * id`. **CORRECT.**

### Singularity guard

Threshold `|det| < 1e-10` returns identity. This is a reasonable defensive choice. For a production graphics editor, one might log a warning, but returning identity is safe: the worst case is a no-op transform rather than `Infinity/NaN` propagation. The threshold is appropriate for double-precision coordinates in the range of typical SVG viewboxes (0--1000). **CORRECT.**

**Rating: CORRECT**

---

## 3. `matrixToString` (matrix.ts, lines 147--149)

```ts
return `matrix(${m[0]}, ${m[1]}, ${m[2]}, ${m[3]}, ${m[4]}, ${m[5]})`
```

The SVG spec defines `matrix(a,b,c,d,e,f)`. With the storage convention `[a, b, c, d, e, f]`, emitting indices 0 through 5 in order produces `matrix(a, b, c, d, e, f)`. **CORRECT.**

One minor observation: JavaScript's default `Number.toString()` can produce scientific notation for very large or very small values (e.g., `1e-7`). The SVG spec requires decimal notation. In practice, transform matrix entries for a vector graphics editor will never reach such extremes, so this is not a real issue, but worth noting for defensive completeness.

**Rating: CORRECT** (with minor robustness note)

---

## 4. Bug Fix 1: `moveElement` group composition (selectTool.ts, lines 207--211)

### Before (buggy)

```ts
el.setAttribute('transform', `translate(${dx}, ${dy})`)
```

This replaced the entire existing transform with a bare `translate`, destroying rotation, scale, and any prior translation.

### After (fixed)

```ts
const origM = parseTransform(orig)
const newM = multiplyMatrix(translateMatrix(dx, dy), origM)
el.setAttribute('transform', matrixToString(newM))
```

### Mathematical analysis

The intent is: "shift the entire visual result by `(dx, dy)` in document space." The visual position of a point `p` under the original transform is `origM * p`. After the move, it should be `T(dx,dy) * origM * p`, i.e., the translate is applied *after* (leftward in composition) the original transform. The code computes `T * origM` via `multiplyMatrix(T, origM)`. **CORRECT.**

Note that `dx, dy` are measured from the drag start position each frame (not incremental deltas), and `origM` is the transform captured at drag start. This is the correct pattern: absolute displacement from the original, not accumulation of incremental deltas (which would suffer floating-point drift).

**Rating: CORRECT**

---

## 5. Bug Fix 2: `scaleElement` group case (selectTool.ts, lines 275--285)

```ts
const origM = parseTransform(origT)
const scaleAround = multiplyMatrix(
  multiplyMatrix(translateMatrix(anchorX, anchorY), scaleMatrix(sx, sy)),
  translateMatrix(-anchorX, -anchorY)
)
const newM = multiplyMatrix(origM, scaleAround)
el.setAttribute('transform', matrixToString(newM))
```

### Mathematical analysis

Scale-around-anchor is the standard formula: `T(a) * S(sx,sy) * T(-a)`. This translates the anchor to the origin, applies the scale, then translates back. The three-matrix composition is evaluated left-to-right via two `multiplyMatrix` calls:

1. Inner: `T(a) * S(sx,sy)` -- translate then scale
2. Outer: `(T(a) * S(sx,sy)) * T(-a)` -- complete scale-around-anchor

**CORRECT** as a standalone operation.

### Composition order concern

The final transform is `origM * scaleAround`. This means: first apply `scaleAround` to the point (in local space), then apply `origM`. In other words, the scale-around-anchor happens *before* the original group transform.

This is the right choice for groups. The anchor coordinates come from `computeAnchor`, which uses a bbox that (for single transformed elements) is the *local* bbox. So `anchorX, anchorY` are in local coordinates. The scale-around-anchor in local space, composed with the original group-to-document transform, produces the correct visual result: the group scales around the local anchor point, then the existing group transform (e.g., rotation) maps the result to document space.

However, I note a subtlety: for multi-element selections, `unionBBox` is used instead, which returns document-space coordinates. In that case, the scale anchor is in document space, but the group's `scaleElement` branch composes `origM * scaleAround` where `scaleAround` uses the document-space anchor. If `origM` is non-trivial (e.g., a rotated group within a multi-selection), the anchor coordinates are in the wrong space. This path may not trigger in practice (multi-selection scaling likely hits the per-primitive branches, not the group branch), but it is a latent geometric inconsistency worth documenting.

**Rating: CORRECT** (for single-group selection; latent concern for multi-group selection)

---

## 6. Bug Fix 3: Rotation center computation (selectTool.ts, lines 361--369)

### Before (buggy)

```ts
const localBBox = (sel[0] as SVGGraphicsElement).getBBox()
const cx = localBBox.x + localBBox.width / 2
const cy = localBBox.y + localBBox.height / 2
```

Used the local-space center directly as if it were in document space. For any element with a non-identity transform, this produces wrong angles.

### After (fixed)

```ts
const localBBox = (sel[0] as SVGGraphicsElement).getBBox()
const localCx = localBBox.x + localBBox.width / 2
const localCy = localBBox.y + localBBox.height / 2
const elTransform = sel[0].getAttribute('transform')
const elM = parseTransform(elTransform || '')
const docCenter = applyMatrixToPoint(elM, localCx, localCy)
const cx = docCenter.x
const cy = docCenter.y
```

### Mathematical analysis

The local bbox center `(localCx, localCy)` is the geometric center in the element's coordinate system. To get the document-space position, we apply the element's transform: `docCenter = M * localCenter`. The mouse position `pt` comes from `screenToDoc`, which is already in document space. The angle `atan2(pt.y - cy, pt.x - cx)` is therefore computed in a consistent coordinate system.

This is geometrically sound. The rotation handle is positioned at the visual (document-space) center, and angles are measured in that same space. **CORRECT.**

### Rotation application (lines 588--606)

For groups:

```ts
const rotM = rotateMatrix(angleDeg, centerX, centerY)
const origM = parseTransform(origT)
const newM = multiplyMatrix(rotM, origM)
```

This computes `R(angle, center) * origM`, which rotates the entire visual output around the document-space center. Since `centerX, centerY` are in document space and `angleDeg` is the delta from the start angle, this is correct. The rotation is applied *after* the original transform, wrapping it.

For non-group elements, the `rotate(totalAngle, cx, cy)` string approach with skew preservation is maintained from the earlier code. This is adequate for elements whose primary geometry is controlled by position attributes rather than transforms.

**Rating: CORRECT**

---

## 7. Bug Fix 4: Scale inverse transform (selectTool.ts, lines 537--546)

### Before (buggy)

```ts
const rotMatch = transform?.match(/rotate\(([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)\)/)
if (rotMatch) {
  const angle = -parseFloat(rotMatch[1]) * Math.PI / 180
  const rcx = parseFloat(rotMatch[2])
  const rcy = parseFloat(rotMatch[3])
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const dx = pt.x - rcx
  const dy = pt.y - rcy
  localPt = { x: rcx + dx * cos - dy * sin, y: rcy + dx * sin + dy * cos }
}
```

This manually implemented inverse rotation via regex, handling only `rotate(angle, cx, cy)`. Any other transform type (translate, scale, matrix, compound transforms) was silently ignored.

### After (fixed)

```ts
if (transform) {
  const m = parseTransform(transform)
  const inv = invertMatrix(m)
  localPt = applyMatrixToPoint(inv, pt.x, pt.y)
}
```

### Mathematical analysis

The mouse position `pt` is in document space. The scale anchor and original bbox are in local space. To compare them, the mouse must be mapped to local space via `M^{-1}`. The code applies `invertMatrix(parseTransform(transform))` to `pt`, which is the general solution for any affine transform. **CORRECT.**

This properly supersedes the rotation-only special case. It handles arbitrary compound transforms (translate + rotate + scale + skew) through a single, clean code path.

**Rating: CORRECT**

---

## 8. Existing `multiplyMatrix` Verification (matrix.ts, lines 47--56)

Since all four fixes depend heavily on `multiplyMatrix`, I verify it independently.

For matrices `A = [a0,a1,a2,a3,a4,a5]` and `B = [b0,b1,b2,b3,b4,b5]`:

```
A * B as 3x3:
| a0 a2 a4 |   | b0 b2 b4 |
| a1 a3 a5 | * | b1 b3 b5 |
| 0  0  1  |   | 0  0  1  |
```

Result `[0]` = `a0*b0 + a2*b1` (row 0 of A . col 0 of B). Code: `a[0]*b[0] + a[2]*b[1]`. **CORRECT.**
Result `[1]` = `a1*b0 + a3*b1`. Code: `a[1]*b[0] + a[3]*b[1]`. **CORRECT.**
Result `[2]` = `a0*b2 + a2*b3`. Code: `a[0]*b[2] + a[2]*b[3]`. **CORRECT.**
Result `[3]` = `a1*b2 + a3*b3`. Code: `a[1]*b[2] + a[3]*b[3]`. **CORRECT.**
Result `[4]` = `a0*b4 + a2*b5 + a4`. Code: `a[0]*b[4] + a[2]*b[5] + a[4]`. **CORRECT.**
Result `[5]` = `a1*b4 + a3*b5 + a5`. Code: `a[1]*b[4] + a[3]*b[5] + a[5]`. **CORRECT.**

**Rating: CORRECT**

---

## 9. `parseTransform` composition order (matrix.ts, lines 156--190)

```ts
result = multiplyMatrix(result, m)  // left-to-right accumulation
```

The SVG specification (Section 7.6) states: "The value of the 'transform' attribute is a `<transform-list>`, which is defined as a list of transform definitions, which are applied in the order provided." The spec further clarifies that for `transform="T1 T2 T3"`, the effective matrix is `T1 * T2 * T3` (multiply left-to-right).

Starting with `result = I`, the loop processes transforms left-to-right and accumulates `result = result * m_i`. After all iterations: `result = I * T1 * T2 * ... = T1 * T2 * ...`. **CORRECT per SVG spec.**

The test at line 107--121 confirms: `translate(10,0) scale(2)` applied to `(5,0)` gives `(20,0)`. Trace: `S*(5,0) = (10,0)`, then `T*(10,0) = (20,0)`. This matches `T*S*p`.

**Rating: CORRECT**

---

## 10. `rotateMatrix` with center (matrix.ts, lines 23--36)

```ts
return [
  cos, sin, -sin, cos,
  cx - cos * cx + sin * cy,
  cy - sin * cx - cos * cy,
]
```

The formula for `rotate(a, cx, cy)` is `T(cx,cy) * R(a) * T(-cx,-cy)`. Expanding:

```
T(cx,cy) * R(a) * T(-cx,-cy) =
| 1 0 cx |   | cos -sin 0 |   | 1 0 -cx |
| 0 1 cy | * | sin  cos 0 | * | 0 1 -cy |
| 0 0 1  |   | 0    0   1 |   | 0 0  1  |
```

The linear part is just `R(a)`: `[cos, sin, -sin, cos]`. **CORRECT.**

Translation part `e`:
```
e = cx + cos*(-cx) + (-sin)*(-cy) = cx - cos*cx + sin*cy
```
Code: `cx - cos * cx + sin * cy`. **CORRECT.**

Translation part `f`:
```
f = cy + sin*(-cx) + cos*(-cy) = cy - sin*cx - cos*cy
```
Code: `cy - sin * cx - cos * cy`. **CORRECT.**

**Rating: CORRECT**

---

## 11. Numerical Stability Notes

1. **Determinant near zero:** The `1e-10` threshold in `invertMatrix` is appropriate. For coordinates in the range 0--1000 (typical SVG), the determinant of a well-conditioned transform is O(1). A threshold of `1e-10` catches degenerate transforms without false positives on normal ones.

2. **Floating-point accumulation in drag:** The code recomputes the transform from `origTransform` (captured at drag start) plus the total displacement `(dx, dy)` on every mouse move. This is the correct approach -- it avoids accumulating rounding errors from incremental updates. Each frame computes a fresh result from the original data.

3. **Scientific notation in `matrixToString`:** As noted above, `Number.toString()` could produce `1.5e-7` for very small values. The SVG parser in browsers handles this, but some external SVG consumers may not. For a production system, consider `toFixed(6)` or similar. Low severity.

4. **Loss of symbolic transform:** Converting any transform to `matrix(a,b,c,d,e,f)` loses the symbolic decomposition. A group that was `translate(10,20) rotate(45)` becomes `matrix(0.707, 0.707, -0.707, 0.707, 10, 20)`. This is mathematically equivalent but less human-readable in the SVG source and makes future round-trip editing of individual transform components harder. This is an acceptable tradeoff for correctness.

---

## 12. Test Coverage Assessment

The `matrix.test.ts` file includes tests for `invertMatrix` and `matrixToString` that cover:

- Identity round-trip
- Translation inversion
- Rotation inversion
- Compound transform (translate + rotate) round-trip
- Singular matrix fallback
- `matrixToString` serialization and round-trip through `parseTransform`

This is adequate. A suggested addition: test `invertMatrix` on a matrix with scale and skew components, to exercise all six entries of the inverse formula.

The `selectTool.ts` changes lack dedicated unit tests, but these are interaction handlers best tested via playwright-cli (integration/e2e). The mathematical primitives they depend on are well-tested.

---

## Summary

| Operation | Location | Rating |
|-----------|----------|--------|
| `invertMatrix` formula | matrix.ts:138--144 | **CORRECT** |
| `matrixToString` SVG syntax | matrix.ts:147--149 | **CORRECT** |
| Move composition `T(dx,dy) * origM` | selectTool.ts:209--211 | **CORRECT** |
| Scale-around-anchor `T(a) * S * T(-a)` | selectTool.ts:279--282 | **CORRECT** |
| Group scale composition `origM * scaleAround` | selectTool.ts:283 | **CORRECT** |
| Rotation center local-to-doc mapping | selectTool.ts:362--369 | **CORRECT** |
| Rotation composition `R * origM` for groups | selectTool.ts:590--593 | **CORRECT** |
| Scale inverse transform via `invertMatrix` | selectTool.ts:543--545 | **CORRECT** |
| `multiplyMatrix` | matrix.ts:47--56 | **CORRECT** |
| `rotateMatrix` with center | matrix.ts:23--36 | **CORRECT** |
| `parseTransform` L-to-R composition | matrix.ts:187 | **CORRECT** |

All eleven mathematical operations are **CORRECT**.

### Recommendations (non-blocking)

1. Consider `toFixed(6)` in `matrixToString` for SVG interoperability with strict parsers.
2. Document the "loss of symbolic transform" tradeoff for future maintainers who may wonder why groups end up with `matrix(...)` instead of readable `translate() rotate()`.
3. Add an `invertMatrix` test case with scale+skew for full formula coverage.
4. The multi-group selection scaling path has a latent coordinate-space inconsistency (Section 5). File an issue if multi-group selection scaling is a supported workflow.

---

*"Beware of bugs in the above code; I have only proved it correct, not tried it." --D.E.K.*
