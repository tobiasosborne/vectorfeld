# Code Review: 4 Group/Path Transform Bug Fixes

**Reviewer:** Torvalds-style review
**Date:** 2026-03-17
**Files:** `src/tools/selectTool.ts`, `src/model/matrix.ts`

---

## Overall Assessment

The approach is correct: stop pretending SVG transforms are strings you can
regex apart and treat them as matrices. That should have been the design from
day one. What we have now is a half-migration: groups go through the matrix
path, everything else still uses regex string surgery. That's a ticking time
bomb, but fixing the immediate crashes is the right first step.

---

## Fix 1 -- Moving groups/paths preserves existing transform

**Rating: GOOD**

```typescript
// Groups: compose translate with full original transform via matrix
const origM = parseTransform(orig)
const newM = multiplyMatrix(translateMatrix(dx, dy), origM)
el.setAttribute('transform', matrixToString(newM))
```

This is the correct fix. `translate(dx,dy) * origTransform` means "first do
the original transform, then translate the result" -- which is exactly what
moving an already-transformed group should do. The composition order is right.

One thing I like: this naturally handles any existing transform (rotate, scale,
skew, compound) because it goes through the full matrix pipeline instead of
pattern-matching individual transform functions.

**But here's what bothers me:** the non-group path still uses regex:

```typescript
const rotMatch = orig.match(/rotate\(([-\d.]+)(?:,\s*([-\d.]+),\s*([-\d.]+))?\)/)
```

Why do `rect`, `ellipse`, `circle`, `text` get the regex path while `g` gets
the matrix path? They're the same problem. If someone puts a `matrix()` or
`translate() rotate()` compound transform on a rect, the regex path silently
drops everything except rotate and skew. You'll get a "works for the common
case, mysteriously breaks for edge cases" bug.

The right thing is: ALL elements should go through the matrix path for
transform composition. The only reason to keep the `rotate(angle, cx, cy)`
string form is if the properties panel needs to read it back -- and if that's
the case, you should have a `matrixToRotate()` decomposition, not a regex.

**Technical note:** The `tag !== 'path'` guard on line 207 is correct because
paths bake translation into their `d` attribute. But the comment should say
WHY, not just WHAT. "paths handle translation via d-attribute rewrite, not
transform" would save the next person 10 minutes.

---

## Fix 2 -- Scale group via transform

**Rating: OK**

```typescript
const scaleAround = multiplyMatrix(
  multiplyMatrix(translateMatrix(anchorX, anchorY), scaleMatrix(sx, sy)),
  translateMatrix(-anchorX, -anchorY)
)
const newM = multiplyMatrix(origM, scaleAround)
```

The scale-around-point formula `T(anchor) * S(sx,sy) * T(-anchor)` is
textbook correct. Good.

**However, the composition order is suspect.** For move, you do
`translate * orig` (translate in doc space). For scale, you do
`orig * scaleAround` (scale in local space). For rotate, you do
`rotate * orig` (rotate in doc space). The inconsistency is:

| Operation | Composition | Space |
|-----------|-------------|-------|
| Move | `T * orig` | doc-space translate |
| Scale | `orig * S_around` | local-space scale |
| Rotate | `R * orig` | doc-space rotate |

Is this intentional? It works if the anchor is in local space (which it is,
since you use `getBBox()` for single elements). But for multi-element
selection with groups, the anchor comes from `unionBBox()` which returns
doc-space coordinates. If a group already has a translate, the anchor point
will be wrong because `unionBBox` accounts for the transform but
`scaleAround` applies it in local space via `orig * scaleAround`.

This is the kind of thing that works for the demo (group at origin, no
existing transform) and breaks in production (group moved 200px, then scaled).
I'd want to see a test that moves a group, then scales it, and verify the
anchor stays put.

**Missing case:** `polygon`, `polyline`, `image`, `use`, and `foreignObject`
all fall through to the `else` at the bottom of `scaleElement` -- which does
nothing. No error, no warning, just silently ignored. At minimum, these
should go through the same transform-based scaling as groups.

---

## Fix 3 -- Rotation center in doc space

**Rating: GOOD**

```typescript
const localCx = localBBox.x + localBBox.width / 2
const localCy = localBBox.y + localBBox.height / 2
const elTransform = sel[0].getAttribute('transform')
const elM = parseTransform(elTransform || '')
const docCenter = applyMatrixToPoint(elM, localCx, localCy)
const cx = docCenter.x
const cy = docCenter.y
```

This is exactly right. `getBBox()` returns local coordinates, mouse events are
in doc coordinates, so you transform the center through the element's CTM to
get a doc-space center for angle computation. Clean fix.

The rotation handler then branches on `tagName === 'g'`:

- Groups: `rotateMatrix(angle, cx, cy) * origM` -- correct, same pattern as move
- Non-groups: regex-rebuild `rotate(totalAngle, cx, cy)` + skew preservation

The group path is solid. The non-group path has the same regex fragility as
Fix 1. If the original transform has `scale()` or `translate()` in it, the
regex silently drops them and replaces with just `rotate(...) skewX(...)`.

**A subtle correctness issue:** for non-groups, `baseAngle` is extracted from
the original rotate string, and `totalAngle = baseAngle + angleDeg`. But
`angleDeg` is computed from mouse-to-center angle difference, which is in doc
space. If the element has a non-uniform scale in its transform, rotating in
doc space is not the same as rotating in local space. For groups this is
handled correctly by matrix composition. For non-groups, it's "close enough"
only because rects and circles with just a rotation transform are the common
case.

---

## Fix 4 -- Scale inverse transform

**Rating: GOOD**

```diff
-const rotMatch = transform?.match(/rotate\(([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)\)/)
-if (rotMatch) {
-  // manual inverse rotation math...
+if (transform) {
+  const m = parseTransform(transform)
+  const inv = invertMatrix(m)
+  localPt = applyMatrixToPoint(inv, pt.x, pt.y)
```

This is the best of the four fixes. Replacing a hand-rolled rotation-only
inverse with a proper matrix inverse that handles any transform is exactly
the right thing. The old code was a regex parsing a rotation, manually
computing sine/cosine for the inverse -- that's the kind of code that works
for exactly one transform type and silently produces garbage for everything
else.

The new code is 3 lines instead of 8, handles every possible SVG transform,
and is obviously correct if `invertMatrix` is correct. That's the definition
of a good fix.

---

## New functions in matrix.ts

### `invertMatrix`

**Rating: GOOD**

```typescript
export function invertMatrix(m: Matrix): Matrix {
  const [a, b, c, d, e, f] = m
  const det = a * d - b * c
  if (Math.abs(det) < 1e-10) return identityMatrix()
  const id = 1 / det
  return [d * id, -b * id, -c * id, a * id, (c * f - d * e) * id, (b * e - a * f) * id]
}
```

The math is correct. Standard 2x3 affine inverse formula. The singular matrix
fallback to identity is a reasonable choice -- returning identity means "no
transform" which is less surprising than NaN or throwing.

The `1e-10` threshold is fine for SVG coordinates (sub-pixel precision). The
test suite covers identity, translation, rotation, compound transforms, and
singular matrices. Good coverage.

One nit: the variable name `id` (for `1/det`) shadows the concept of
"identity" which you also use in this file. `invDet` would be clearer. Not
worth a respin.

### `matrixToString`

**Rating: GOOD**

Clean one-liner. The spacing matches what browsers produce. No floating-point
formatting (no `toFixed()`) which means you might get `matrix(0.30000000000000004, ...)` type strings. For an SVG editor this is probably fine since the browser
will parse it back, but if you're ever diffing SVG output or showing it to
users, you'll want to round.

---

## The Deeper Problem

All four fixes follow the same pattern: "groups go through matrix composition,
non-groups keep the regex string surgery." This creates a two-tier system
where:

1. Groups handle any transform correctly via matrices
2. Non-groups only handle `rotate(a, cx, cy) [skewX(...)] [skewY(...)]`

The regex approach silently drops: `translate()`, `scale()`, `matrix()`, and
compound transforms on non-group elements. Today these don't exist because
the tools always produce `rotate(...)` for primitives. But the moment someone
imports an SVG from Inkscape or Illustrator (which love `matrix()` transforms
on everything), the non-group path will silently destroy transforms.

The real fix is: unify everything on the matrix path. `moveElement` and the
rotation handler should use `multiplyMatrix` for ALL elements, not just
groups. The only per-element-type logic should be for geometry attributes
(x/y/width/height for rects, cx/cy/r for circles, etc.), not for transform
composition.

This is a refactor, not a bug fix, so I'm not saying these patches are wrong.
They fix the immediate crashes correctly. But file an issue to unify the
transform handling before it bites you.

---

## Summary

| Fix | What | Rating | Notes |
|-----|------|--------|-------|
| 1 | Move group preserves transform | **GOOD** | Correct matrix composition. Regex path for non-groups is tech debt. |
| 2 | Scale group via transform | **OK** | Math correct but composition order inconsistent with move/rotate. Anchor space may be wrong for pre-transformed groups. |
| 3 | Rotation center in doc space | **GOOD** | Clean local-to-doc transform via matrix. Same regex tech debt on non-group branch. |
| 4 | Scale inverse transform | **GOOD** | Best fix. Replaces fragile hand-rolled inverse with proper matrix inverse. |
| -- | `invertMatrix()` | **GOOD** | Textbook correct, good test coverage, reasonable singular fallback. |
| -- | `matrixToString()` | **GOOD** | Clean. Consider float formatting eventually. |

**Overall: GOOD.** The fixes are correct for the cases they target. The
matrix approach is the right direction. Finish the migration by putting
non-group elements through the same matrix pipeline and you'll have
something solid.

**Action items:**
1. File issue: unify transform handling (matrix path for all element types)
2. Add test: move group, then scale it, verify anchor stays correct
3. Add test: element with `matrix()` transform (imported SVG), verify move/rotate/scale work
4. Consider `toFixed(6)` in `matrixToString` for cleaner SVG output
