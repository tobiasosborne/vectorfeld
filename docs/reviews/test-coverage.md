# Test Coverage Review: 4 Group Transform Bug Fixes

**Date:** 2026-03-17
**Files analyzed:**
- `src/model/matrix.ts` (new: `invertMatrix`, `matrixToString`)
- `src/tools/selectTool.ts` (bugs 1-4 fixed in `moveElement`, `scaleElement`, rotation handler, scale handler)
- `src/model/matrix.test.ts` (8 new tests added across 2 new describe blocks)
- `src/tools/selectTool.test.ts` (existing tests, no new tests for group transforms)

---

## 1. Summary of Changes

### matrix.ts additions
- **`invertMatrix(m)`** -- Computes the inverse of a 2x3 affine matrix. Falls back to identity when determinant is near-zero (< 1e-10).
- **`matrixToString(m)`** -- Serializes a Matrix tuple to SVG `matrix(a, b, c, d, e, f)` string.

### selectTool.ts bug fixes

| Bug | Location | Old behavior | New behavior |
|-----|----------|-------------|-------------|
| 1. Move loses transform | `moveElement()` | Set `translate(dx, dy)` replacing existing transform | Matrix composition: `translateMatrix(dx, dy) * parseTransform(orig)` |
| 2. Scale missing for groups | `scaleElement()` | No `g` case; groups silently ignored | New `g` case: `origMatrix * translate(anchor) * scale(sx, sy) * translate(-anchor)` |
| 3. Rotation center wrong | rotation handler in `onMouseDown` | Used local bbox center directly as doc-space center | Transforms local center through element matrix via `applyMatrixToPoint` |
| 4. Scale inverse incomplete | scale handler in `onMouseMove` | Regex-based rotation-only inverse | Full `invertMatrix(parseTransform(transform))` |

---

## 2. Existing Test Coverage

### matrix.test.ts (8 new tests)

| Test | Covers |
|------|--------|
| `invertMatrix` inverts identity | Happy path |
| `invertMatrix` inverts translation | Single-component inverse |
| `invertMatrix` inverts rotation | Single-component inverse |
| `invertMatrix` inverts compound transform (translate + rotate 45) | Round-trip: forward then inverse restores point |
| `invertMatrix` returns identity for singular matrix | Error/fallback path |
| `matrixToString` serializes identity | Happy path |
| `matrixToString` serializes translation | Non-identity values |
| `matrixToString` round-trips through `parseTransform` | Integration test |

### selectTool.test.ts (0 new tests for group transforms)

Existing tests cover:
- Click-select, shift-click toggle, locked layer, marquee selection
- Move via drag (rect only), move undo
- Tool creation, handler existence, registration

No tests exercise:
- Moving a `<g>` element
- Scaling any element via scale handles
- Rotating any element via rotation handle
- The `moveElement`, `scaleElement` internal functions with group elements

---

## 3. Missing Test Coverage

### 3.1 invertMatrix edge cases

| Gap | Risk | Priority |
|-----|------|----------|
| Near-singular matrix (det close to 1e-10 but not zero) | Numerical instability could produce wildly wrong results | Medium |
| Large translation values (e.g., 1e6) | Floating-point precision loss in `(c*f - d*e) / det` | Low |
| Scale matrix inverse (non-uniform) | Not tested; only rotation and translation are | Medium |
| Negative scale (mirror) inverse | Determinant is negative; sign handling untested | Medium |
| Identity round-trip: `invert(invert(M)) == M` | Would catch numerical drift | Low |

**Suggested tests:**

```typescript
describe('invertMatrix edge cases', () => {
  it('inverts non-uniform scale', () => {
    const m = scaleMatrix(3, 0.5)
    const inv = invertMatrix(m)
    const fwd = applyMatrixToPoint(m, 7, 11)
    const back = applyMatrixToPoint(inv, fwd.x, fwd.y)
    expect(near(back.x, 7)).toBe(true)
    expect(near(back.y, 11)).toBe(true)
  })

  it('inverts negative scale (mirror)', () => {
    const m = scaleMatrix(-1, 1) // horizontal flip
    const inv = invertMatrix(m)
    const fwd = applyMatrixToPoint(m, 5, 10)
    const back = applyMatrixToPoint(inv, fwd.x, fwd.y)
    expect(near(back.x, 5)).toBe(true)
    expect(near(back.y, 10)).toBe(true)
  })

  it('handles near-singular matrix gracefully', () => {
    // det = 1e-11, just under the 1e-10 threshold
    const m: Matrix = [1, 0, 1, 1e-11, 0, 0]
    const inv = invertMatrix(m)
    // Should fall back to identity
    expect(inv).toEqual(identityMatrix())
  })

  it('inverts large translation values without precision loss', () => {
    const m = translateMatrix(1e6, -1e6)
    const inv = invertMatrix(m)
    const p = applyMatrixToPoint(inv, 1e6, -1e6)
    expect(near(p.x, 0)).toBe(true)
    expect(near(p.y, 0)).toBe(true)
  })

  it('double inversion returns original matrix', () => {
    const m = multiplyMatrix(
      multiplyMatrix(translateMatrix(30, -15), rotateMatrix(37)),
      scaleMatrix(2, 0.7)
    )
    const inv = invertMatrix(m)
    const back = invertMatrix(inv)
    for (let i = 0; i < 6; i++) expect(near(back[i], m[i])).toBe(true)
  })

  it('inverts skew matrix', () => {
    const m = skewXMatrix(30)
    const inv = invertMatrix(m)
    const fwd = applyMatrixToPoint(m, 10, 20)
    const back = applyMatrixToPoint(inv, fwd.x, fwd.y)
    expect(near(back.x, 10)).toBe(true)
    expect(near(back.y, 20)).toBe(true)
  })
})
```

### 3.2 matrixToString floating point precision

| Gap | Risk | Priority |
|-----|------|----------|
| Floating point representation (e.g., `0.30000000000000004`) | SVG parsers may choke on very long decimals; string bloat | Low |
| Negative zero (`-0`) | Cosmetic but could cause string comparison failures | Low |

**Suggested tests:**

```typescript
describe('matrixToString precision', () => {
  it('handles floating point values from rotation', () => {
    const m = rotateMatrix(30)
    const str = matrixToString(m)
    // Verify it produces valid parseable output
    const parsed = parseTransform(str)
    for (let i = 0; i < 6; i++) expect(near(parsed[i], m[i])).toBe(true)
  })

  it('handles matrix with very small values near zero', () => {
    const m: Matrix = [1, 1e-16, -1e-16, 1, 0, 0]
    const str = matrixToString(m)
    expect(str).toContain('matrix(')
    // Should still round-trip
    const parsed = parseTransform(str)
    for (let i = 0; i < 6; i++) expect(near(parsed[i], m[i])).toBe(true)
  })
})
```

### 3.3 Group move (Bug 1 fix) -- NO selectTool tests exist

This is the highest-risk gap. The fix changed `moveElement` from string replacement to matrix composition, but zero tests verify group movement.

| Gap | Risk | Priority |
|-----|------|----------|
| Group move applies correctly | Regression would silently break group drag | **High** |
| Second move accumulates (the actual bug) | Core fix untested | **High** |
| Move preserves existing rotation | Matrix composition must not lose rotation | **High** |
| Move preserves existing skew on group | Skew encoded in matrix must survive | Medium |

**Suggested tests** (these require a `<g>` element in the jsdom SVG, which can be mocked similarly to how `addRect` works):

```typescript
/** Add a <g> element with optional transform, mock getBBox */
function addGroup(
  svg: SVGSVGElement,
  transform?: string
): SVGGElement {
  const layer = svg.querySelector('g[data-layer-name]')!
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g')
  if (transform) g.setAttribute('transform', transform)
  // Add a child rect so the group has a bbox
  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  rect.setAttribute('x', '10')
  rect.setAttribute('y', '10')
  rect.setAttribute('width', '50')
  rect.setAttribute('height', '50')
  g.appendChild(rect)
  ;(g as any).getBBox = () => ({ x: 10, y: 10, width: 50, height: 50 })
  layer.appendChild(g)
  return g
}

describe('group move (Bug 1)', () => {
  it('moves group by composing translate with identity', () => {
    const tool = makeTool()
    const g = addGroup(svg)
    setSelection([g])

    // Simulate mouseDown on the group, move, mouseUp
    // (need to mock hitTest to return g)
    // After move by (20, 10) in doc space:
    const t = g.getAttribute('transform')
    const m = parseTransform(t || '')
    // Translation component should be (20, 10)
    expect(near(m[4], 20)).toBe(true)
    expect(near(m[5], 10)).toBe(true)
  })

  it('second move accumulates with first move', () => {
    // This is THE bug that was fixed
    const tool = makeTool()
    const g = addGroup(svg, 'translate(10, 20)')
    setSelection([g])

    // First move adds (5, 5) -> should result in translate(15, 25)
    // Second move adds (3, 7) -> should result in translate(18, 32)
    // NOT translate(3, 7) which was the old bug
    // Verify by calling moveElement indirectly via drag simulation
  })

  it('move preserves existing rotation on group', () => {
    const tool = makeTool()
    const g = addGroup(svg, 'matrix(0.707, 0.707, -0.707, 0.707, 0, 0)')
    // This is rotate(45) as a matrix
    setSelection([g])

    // After move by (10, 0), the rotation components (a,b,c,d)
    // should be unchanged, only e,f should change
    // The new transform should be: translate(10,0) * rotate(45)
  })
})
```

**Implementation note:** Testing `moveElement` via the full mouse event pipeline is hard because `hitTest` depends on actual SVG rendering (getBBox, getScreenCTM). The most practical approach is either:
1. Extract `moveElement` and `scaleElement` as testable functions (would require a refactor), or
2. Mock `hitTest` to return the desired element and simulate the full drag cycle.

### 3.4 Group scale (Bug 2 fix) -- NO tests exist

| Gap | Risk | Priority |
|-----|------|----------|
| Group scale via SE handle | Core fix completely untested | **High** |
| Scale from each handle direction (N, S, E, W, NE, NW, SW) | Handle axis logic differs per direction | Medium |
| Scale preserves existing group transform | Matrix composition order matters | **High** |
| Shift-constrained proportional scale on group | Constraint applied before group scale | Medium |

**Suggested test approach:**

```typescript
describe('group scale (Bug 2)', () => {
  it('scales group via transform composition', () => {
    // Given a group at identity transform with bbox (10, 10, 50, 50)
    // When scaled by (2, 2) around anchor (10, 10) (the SE handle's opposite corner)
    // Then transform should be: identity * translate(10,10) * scale(2,2) * translate(-10,-10)
    // Which is matrix(2, 0, 0, 2, -10, -10)
    const g = addGroup(svg)
    // Directly test scaleElement behavior by checking the resulting transform
  })

  it('scale preserves existing group rotation', () => {
    // Given a group with rotate(45) as matrix
    // When scaled by (1.5, 1.5) around center
    // The rotation should be preserved in the composed matrix
    const g = addGroup(svg, matrixToString(rotateMatrix(45)))
    // After scale, decompose the result: rotation should still be ~45
  })
})
```

### 3.5 Group rotation (Bug 3 fix) -- NO tests exist

| Gap | Risk | Priority |
|-----|------|----------|
| Rotation center computed in doc space (the bug fix) | Core fix untested | **High** |
| Rotation with existing translate on group | Center must account for translation | **High** |
| Rotation with existing `matrix()` transform | Full matrix path | **High** |
| Rotation preserves skew on non-group elements | Skew regex matching | Medium |
| Group rotation uses matrix composition (not rotate() string) | Different code path for `g` vs primitives | **High** |

**Suggested tests:**

```typescript
describe('group rotation (Bug 3)', () => {
  it('computes rotation center in doc space for translated group', () => {
    // Group with transform="translate(100, 50)"
    // Local bbox center = (35, 35)  [from (10,10,50,50)]
    // Doc-space center should be (135, 85), NOT (35, 35)
    const g = addGroup(svg, 'translate(100, 50)')
    const localBBox = (g as SVGGraphicsElement).getBBox()
    const localCx = localBBox.x + localBBox.width / 2
    const localCy = localBBox.y + localBBox.height / 2
    const elM = parseTransform(g.getAttribute('transform') || '')
    const docCenter = applyMatrixToPoint(elM, localCx, localCy)
    expect(near(docCenter.x, 135)).toBe(true)
    expect(near(docCenter.y, 85)).toBe(true)
  })

  it('group rotation composes with existing transform via matrix', () => {
    // Group with translate(50, 30)
    // Rotate 90 around doc center (85, 65)
    // New transform = rotate(90, 85, 65) * translate(50, 30)
    // This should be a matrix, not a rotate() string
    const g = addGroup(svg, 'translate(50, 30)')
    // After rotation handler runs, getAttribute('transform') should
    // start with 'matrix(' not 'rotate('
  })
})
```

### 3.6 Scale inverse transform (Bug 4 fix) -- NO tests exist

| Gap | Risk | Priority |
|-----|------|----------|
| Inverse with plain translate | Simplest non-identity case | **High** |
| Inverse with compound translate + rotate | The common case for moved+rotated groups | **High** |
| Inverse with scale transform | Groups may have scale in their transform | Medium |
| Mouse-to-local conversion accuracy | End-to-end: screen point -> local point | Medium |

**Suggested tests:**

```typescript
describe('scale inverse transform (Bug 4)', () => {
  it('inverse-transforms mouse point through translation', () => {
    // Element with transform="translate(100, 50)"
    // Mouse at doc (120, 70) should map to local (20, 20)
    const m = parseTransform('translate(100, 50)')
    const inv = invertMatrix(m)
    const local = applyMatrixToPoint(inv, 120, 70)
    expect(near(local.x, 20)).toBe(true)
    expect(near(local.y, 20)).toBe(true)
  })

  it('inverse-transforms mouse point through translate + rotate', () => {
    // Element with translate(50, 50) rotate(90)
    // Composed matrix maps local (10, 0) to doc (50, 60)
    // Inverse should map doc (50, 60) back to local (10, 0)
    const m = multiplyMatrix(translateMatrix(50, 50), rotateMatrix(90))
    const inv = invertMatrix(m)
    const fwd = applyMatrixToPoint(m, 10, 0)
    const back = applyMatrixToPoint(inv, fwd.x, fwd.y)
    expect(near(back.x, 10)).toBe(true)
    expect(near(back.y, 0)).toBe(true)
  })

  it('inverse-transforms through compound matrix() transform', () => {
    // A matrix that includes translate + rotate + scale
    const m = multiplyMatrix(
      multiplyMatrix(translateMatrix(100, 200), rotateMatrix(30)),
      scaleMatrix(2, 1.5)
    )
    const inv = invertMatrix(m)
    const fwd = applyMatrixToPoint(m, 25, 25)
    const back = applyMatrixToPoint(inv, fwd.x, fwd.y)
    expect(near(back.x, 25)).toBe(true)
    expect(near(back.y, 25)).toBe(true)
  })
})
```

### 3.7 Integration / lifecycle tests

| Gap | Risk | Priority |
|-----|------|----------|
| Move then scale a group | Operations compose correctly in sequence | **High** |
| Scale then rotate a group | Transform accumulation across operations | **High** |
| Full lifecycle: create group, move, rotate, scale, undo all | End-to-end regression | Medium |
| Move group, undo, move again | Undo restores original transform correctly | Medium |

**Suggested tests:**

```typescript
describe('group transform lifecycle', () => {
  it('move then scale: transform composes correctly', () => {
    // Start: group at identity
    // Move by (20, 10) -> transform = matrix(1,0,0,1,20,10)
    // Scale by (2, 2) around anchor -> transform = matrix(1,0,0,1,20,10) * scale_around(...)
    // Verify child elements are at expected doc-space positions
  })

  it('scale then rotate: transform composes correctly', () => {
    // Start: group at identity
    // Scale by (2, 1) -> transform = matrix with scale
    // Rotate by 45 -> should compose rotation with existing scale
    // Verify via decomposeMatrix that both scale and rotation are present
  })

  it('move group and undo restores original transform', () => {
    const g = addGroup(svg, 'translate(10, 20)')
    // Move the group
    // Verify transform changed
    // Undo
    // Verify transform is back to 'translate(10, 20)'
  })
})
```

---

## 4. Risk Assessment

### Critical gaps (tests should be written)

1. **No selectTool tests for group elements at all.** All 4 bug fixes (move, scale, rotate, inverse) operate on `<g>` elements, but `selectTool.test.ts` only tests `<rect>` elements. A regression in any of the 4 fixes would go undetected.

2. **No integration test for the scale handler's inverse transform path.** The old code used a regex for rotation-only inverse; the new code uses `invertMatrix(parseTransform(...))`. A test that constructs an element with a non-rotation transform and verifies the scale handler produces correct scale factors would catch regressions in this critical path.

3. **No test for `matrixToString` -> `parseTransform` round-trip with all transform types.** The existing round-trip test uses translate + rotate. A test with scale, skew, or negative values would verify the serialization is robust.

### Moderate gaps (nice to have)

4. `invertMatrix` with non-uniform scale, negative scale, and skew.
5. Move accumulation across multiple drag operations (the core of Bug 1).
6. Scale handle axis filtering for edge handles (N/S/E/W) on groups.

### Low priority gaps

7. `matrixToString` negative zero handling.
8. `invertMatrix` with large values (1e6+ translations).
9. Double inversion numerical stability.

---

## 5. Recommended Test Implementation Plan

### Phase 1: Unit tests for matrix.ts (can be done immediately)

Add to `src/model/matrix.test.ts`. These are pure functions with no DOM dependencies.

- 6 new `invertMatrix` edge case tests (Section 3.1)
- 2 new `matrixToString` precision tests (Section 3.2)
- 3 new scale inverse transform tests (Section 3.6 -- these are pure matrix math)

**Estimated effort:** ~30 minutes. **Coverage gain:** High for Bug 4.

### Phase 2: selectTool group helpers (requires test infrastructure)

Requires adding an `addGroup` helper to `selectTool.test.ts` (similar to the existing `addRect` helper) and mocking `hitTest` to return group elements.

- 3 group move tests (Section 3.3)
- 2 group scale tests (Section 3.4)
- 2 group rotation tests (Section 3.5)

**Estimated effort:** ~1-2 hours (infrastructure + tests). **Coverage gain:** High for Bugs 1, 2, 3.

### Phase 3: Integration / lifecycle tests (higher effort)

These require simulating full drag cycles with proper mouseDown/mouseMove/mouseUp sequences on group elements.

- 3 lifecycle tests (Section 3.7)

**Estimated effort:** ~1-2 hours. **Coverage gain:** Moderate (catches interaction bugs between operations).

---

## 6. Test File Locations

| File | What to add |
|------|------------|
| `src/model/matrix.test.ts` | Phase 1: invertMatrix edge cases, matrixToString precision, inverse transform math |
| `src/tools/selectTool.test.ts` | Phase 2-3: addGroup helper, group move/scale/rotate tests, lifecycle tests |
