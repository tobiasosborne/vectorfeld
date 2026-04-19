# Reviews Synthesis — vectorfeld codebase stocktake

**Date:** 2026-04-19
**Sources read:** architecture.md, code-bugs.md, code-bugs-2.md, code-bugs-3.md, code-smells.md,
knuth.md, torvalds.md, test-coverage.md, lessons.md, AGENTS.md, README.md (11 documents)
**Review date range covered:** 2026-03-17 (single-session review burst)

> **IMPORTANT CONTEXT:** The AGENTS.md handoff log records that ALL bugs listed in these review
> documents were fixed in the 2026-03-17 session (same day the reviews were written) and all 43
> issues were closed. Section 6 (Staleness Assessment) documents what the spot-grep confirms.

---

## 1. Architecture Overview

### Stack

Vectorfeld is a TypeScript/React single-page app (Tauri shell present but unused in the primary
workflow). The document *is* the SVG — there is no separate data model; all state lives in a
managed `<svg>` DOM element accessed via React refs.

### Layers

```
┌─────────────────────────────────────────────────┐
│  React UI (ControlBar, MenuBar, PropertiesPanel, │
│            ToolStrip, LayersPanel, SwatchPanel)   │
├─────────────────────────────────────────────────┤
│  EditorContext (React context, thin coordinator) │
│  Extracted modules: clipboard.ts, nudge.ts,      │
│                     zOrder.ts, activeLayer.ts     │
├─────────────────────────────────────────────────┤
│  Tool layer (selectTool, penTool, directSelect,  │
│  freeTransformTool, knifeTool, lassoTool, …)     │
├─────────────────────────────────────────────────┤
│  Model layer                                     │
│  ├── matrix.ts      (affine math)                │
│  ├── geometry.ts    (hit test, AABB, translate)  │
│  ├── pathOps.ts     (path parse/split/join)      │
│  ├── commands.ts    (undo/redo command objects)   │
│  ├── document.ts    (element CRUD)               │
│  ├── gradients.ts   (linear/radial gradient mgmt)│
│  ├── align.ts       (align/distribute)           │
│  ├── reflect.ts     (flip H/V)                   │
│  ├── shapeToPath.ts (shape → path conversion)    │
│  ├── pathBooleans.ts (Paper.js booleans, lazy)   │
│  └── … (clipping, markers, textPath, …)          │
├─────────────────────────────────────────────────┤
│  SVG DOM  (the document = the display)           │
└─────────────────────────────────────────────────┘
```

### Data Flow

1. User event → Tool handler (`onMouseDown/Move/Up`, `onKeyDown`)
2. Tool mutates SVG DOM attributes directly (for live preview during drag)
3. On commit (`onMouseUp`), tool creates `Command` objects (e.g., `ModifyAttributeCommand`,
   `CompoundCommand`) and executes them via `history.execute(cmd)`
4. `CommandHistory` maintains undo/redo stacks (capped at 200 entries)
5. React UI reads element attributes directly from the DOM on render; `history.subscribe` drives
   overlay and panel re-renders

### Key Abstractions

- **Matrix** (`matrix.ts`): 6-element tuple `[a,b,c,d,e,f]` matching SVG column-major convention.
  Full pipeline: `parseTransform → multiplyMatrix / invertMatrix → matrixToString`. Verified
  mathematically correct by the Knuth-style review (all 11 operations correct).
- **Command pattern** (`commands.ts`): `ModifyAttributeCommand`, `AddElementCommand`,
  `RemoveElementCommand`, `ReorderElementCommand`, `CompoundCommand`, `GroupCommand`,
  `UngroupCommand`. All tool commits must go through this.
- **Dual-path transform architecture** (`selectTool.ts`): Groups use full matrix composition;
  primitives (rect, ellipse, etc.) modify position attributes (x, y, cx, cy) and use string
  manipulation for their `transform` attribute. This split is architecturally justified by SVG
  semantics but is the primary source of complexity and past bugs.
- **`computeTranslateAttrs`** (`geometry.ts`): The canonical translation dispatcher for nudge,
  paste, and align. Routes to position-attribute deltas for primitives and matrix composition for
  groups, paths, polygon, polyline.
- **Overlay pattern**: Tool overlays (selection handles, anchor points, guides, grid) are appended
  as SVG `<g data-role="...">` elements and must be stripped in all export paths.

### Architectural Risk Areas

1. **Regex path in `computeTranslateAttrs` for paths** (lines 69–95): Still uses regex for
   extracting `rotate()`/`translate()` from path transforms. Has been hardened but retains
   fragility for edge-case compound transforms.
2. **Shotgun surgery across element types**: `getAllGeomAttrs`, `getPositionAttrs`, `moveElement`,
   `scaleElement` in selectTool all require parallel updates when a new element type is added.
3. **Two commit mechanisms in selectTool**: move/scale use `commitChanges()`; rotation inlines
   its own commit. This asymmetry is noted but tolerated.
4. **SVG DOM as the data model**: No separate in-memory representation. Undo/redo relies entirely
   on capturing and restoring DOM attribute strings, which means complex nodes (text content,
   gradient stop trees) are harder to round-trip cleanly.

---

## 2. Known Bugs

All bugs below were **reported on 2026-03-17**. Per AGENTS.md, all were fixed the same day.
Staleness is assessed in Section 6. Severity reflects the original report.

### HIGH severity

| ID | File(s) | Line(s) | Description |
|----|---------|---------|-------------|
| B-01 | `selectTool.ts` | 665–673 | Dead zone in scale/rotate leaves dirty DOM without undo: drag then return mouse near start — attributes mutated by `onMouseMove` are never restored, undo stack has no entry |
| B-02 | `geometry.ts` | 96–106 | `computeTranslateAttrs` group path: regex for `translate()` fails when group transform is `matrix(...)`, prepends spurious translate instead of composing |
| B-03 | `clipboard.ts` | 43–64 | Paste/duplicate drops all children of `<g>`: `AddElementCommand` only sets attributes, never transfers child nodes |
| B-04 | `freeTransformTool.ts` | 221–244 | freeTransform undo broken when transform is newly added: `oldValue` captured as the new value (never restored before capture), so undo is a no-op |
| B-05 | `directSelectTool.ts` | 20,28,35,109 | Relative path commands (lowercase `m`, `l`, `c`) matched by regex but silently dropped — no branches handle them; paths with relative coords show missing anchors |
| B-06 | `directSelectTool.ts` | 393–405 | Dragging a Bezier anchor does not move associated control handles; curve distorts incorrectly |
| B-07 | `App.tsx` | 114–131 | Context menu "Bring to Front"/"Send to Back" used raw `appendChild`/`insertBefore` bypassing `ReorderElementCommand` — not undoable |
| B-08 | `PropertiesPanel.tsx` + `gradients.ts` | 485–498 / 116–129 | Gradient color changes call `setAttribute` directly, bypassing undo history |

### MEDIUM severity

| ID | File(s) | Line(s) | Description |
|----|---------|---------|-------------|
| B-09 | `selectTool.ts` | 217–226 | Wrong conjugation math (`T * M * T⁻¹`) for non-group elements with non-rotate transforms; should be `T(dx,dy) * M` |
| B-10 | `ControlBar.tsx` | 48–52 | `getRotation` returns `'0'` for `matrix()` transforms — does not fall back to `decomposeMatrix` |
| B-11 | `ControlBar.tsx` | 176–184 | `onRot` replaces entire transform with `rotate(angle, cx, cy)` — destroys existing skew/scale components |
| B-12 | `ControlBar.tsx` | 54–79 | `getBBox` returns local-space coords ignoring transform — groups show X:0 Y:0 after being moved |
| B-13 | `ControlBar.tsx` | 126–165 | `onX`/`onY` handlers have no `g` branch — position inputs are no-ops for groups |
| B-14 | `freeTransformTool.ts` | 196–201 | Rotation clobbers existing rotation on non-group elements (uses delta angle instead of `baseAngle + delta`) |
| B-15 | `freeTransformTool.ts` | 296 | Group scale anchor in wrong coordinate space (doc-space anchor used in local-space matrix composition) |
| B-16 | `freeTransformTool.ts` | 268–287 | Scale on rotated non-group primitives mixes coordinate spaces (same anchor-space mismatch) |
| B-17 | `geometry.ts` | 69–95 | Nudging a path with `matrix()` transform moves in wrong direction (local coords not screen coords) |
| B-18 | `PropertiesPanel.tsx` | 198–217 | No position/size controls rendered for `<path>`, `<g>`, `<image>`, `<polyline>`, `<polygon>`, `<circle>` |
| B-19 | `MenuBar.tsx` | 52–58 | No `disabled` support on menu items — selection-dependent operations always clickable |
| B-20 | `directSelectTool.ts` | 310–314 | No `onDeactivate` — anchor/handle visuals leaked on tool switch |
| B-21 | `penTool.ts` | 359–365 | Escape commits path instead of canceling it |
| B-22 | `PropertiesPanel.tsx` | 431–579 | Style controls apply directly to `<g>` elements — cascades to children, overrides their fills |
| B-23 | `pathOps.ts` | 17 | Scientific notation broken by `replace(/-/g, ' -')` — `1.5e-3` becomes `1.5e -3` |
| B-24 | `freeTransformTool.ts` | line ~285 | `applyScale` has no `g` case — scaling a group via freeTransformTool is silently ignored |
| B-25 | `selectTool.ts` | 52–179 | `<image>` tag missing from `getAllGeomAttrs`, `getPositionAttrs`, `moveElement`, `scaleElement` |

### LOW severity

| ID | File(s) | Description |
|----|---------|-------------|
| B-26 | `PropertiesPanel.tsx` | `stroke-width` field blank when attribute absent (missing `'1'` fallback) |
| B-27 | `penTool.ts` | Rubber-band line frozen during Bezier handle drag |
| B-28 | `pathOps.ts` | No implicit repeat command handling (SVG spec: extra pairs repeat command, M→L) |
| B-29 | `PropertiesPanel.tsx` | No validation on numeric inputs — `width="abc"` can be committed |
| B-30 | `geometry.ts` | Path nudge absorbs `translate()` into d-attribute, rewriting coordinate system |
| B-31 | `selectTool.ts` | `polygon`/`polyline` missing from `scaleElement` (silent no-op) |
| B-32 | `geometry.ts` | `computeTranslateAttrs` for groups/polygon/polyline will break if transform is `matrix()` (pre-fix) |

**Total distinct bugs: 32** (deduplicated across all three bug reports and the architecture review)

---

## 3. Code Smells & Tech Debt

### HIGH priority structural issues

**Dual-path transform architecture** (`selectTool.ts`, `freeTransformTool.ts`, `geometry.ts`)
Both Torvalds and the code-smells review flag this independently. Groups go through full matrix
composition; primitives use regex string surgery on `rotate()/skewX()/skewY()` components. This
"works for the common case, silently breaks for edge cases" — specifically, any element with a
`matrix()` or `translate()` or `scale()` in its transform attribute (common for imported SVGs)
will have those components silently dropped. The recommended fix is to unify all element types on
the matrix path and keep per-type logic only for geometry attributes (x/y/cx/cy/etc.).

**Shotgun surgery across element-type switch statements** (`selectTool.ts`)
Five functions (`getAllGeomAttrs`, `getPositionAttrs`, `moveElement`, `scaleElement`, rotate
handler) contain parallel per-tag-name switch/if-else chains. Adding a new element type requires
updating all five in lockstep. The `<image>` gap (Bug B-25) was caused exactly by this pattern.
Recommended fix: a per-element-type strategy/registration table.

### MEDIUM priority

- **Feature envy in selectTool**: 8 imports from `matrix.ts`; manually assembles multi-step
  matrix pipelines like `T(a) * S * T(-a)`. After the fix session, `scaleAroundMatrix` was
  extracted to `matrix.ts`, partially addressing this.
- **Primitive obsession — transforms re-parsed per frame**: `parseTransform(origTransform)` called
  on every `onMouseMove` (~60 Hz) for every selected element. Should parse once at drag-start
  and store in `dragState.origMatrices`.
- **Long methods**: `onMouseDown` (140 lines), `onMouseMove` (118 lines). Mode-specific bodies
  could be extracted as `handleScaleMove()`, `handleRotateMove()`.
- **DRY violations**:
  - Skew preservation regex (`orig.match(/skewX\([^)]+\)/)`) duplicated in `moveElement`,
    rotate handler, `geometry.ts`, and `ControlBar.tsx`.
  - `computeAnchor(handle, bbox)` called twice to get `.x` and `.y` separately (creates
    throwaway object; should destructure one call).
- **`parseSkew`/`setSkew`** in `matrix.ts`: use regex on strings rather than operating on the
  Matrix type. Pragmatic but noted as tech debt.

### LOW priority

- **Dead code**: `decomposeMatrix` was originally "exported and tested but never called by any
  production code" per the code-smells review. Status has changed — it is now used by
  `freeTransformTool.ts` and `ControlBar.tsx` (see Section 6).
- **Magic numbers**: `1e-10` (singularity threshold), `0.001` (min bbox dim), `0.1` (min scale
  size), `0.5` (marquee threshold), `0.01` (dead zone), `15` (rotation snap degrees), `16`
  (default font-size), `2` (smart guide tolerance px). Most were extracted as named constants in
  the fix session.
- **Type safety**: `as HandlePosition` cast on `getAttribute` return (no `default` branch in
  `computeAnchor`); unguarded `getBBox()` calls via `as SVGGraphicsElement` on lines 362 and 397.
  `computeAnchor` default branch was added in fix session.
- **`matrixToString` float formatting**: `Number.toString()` can produce scientific notation
  (`1e-7`) for very small values; some SVG consumers may not accept this. The fix session added
  `toFixed(6)` per Knuth's and Torvalds's recommendation.
- **Two commit mechanisms in selectTool**: move/scale use `commitChanges()`; rotation inlines its
  own commit. Low risk but increases divergence cost for future changes.

---

## 4. Test Coverage Gaps

### Well-tested areas

- `matrix.ts`: `invertMatrix` (identity, translation, rotation, compound, singular), 
  `matrixToString` round-trip, `multiplyMatrix`, `rotateMatrix`, `scaleAroundMatrix`,
  `decomposeMatrix`, `parseSkew`/`setSkew`. 8 new tests added in fix session (472 total).
- `pathOps.ts`: `parsePathD` (M/L/C/Z, H/V/S/Q/T/A conversion, implicit repeats),
  `nearestSegment`, `splitPathAt`, `splitPathAtT`, `intersectLineWithPath`, `translatePathD`.
- `geometry.ts` / `smartGuides.ts` / `shapeToPath.ts` / `fileio.ts`: covered in Sprint J.
- `selectTool.ts`: click-select, shift-click toggle, locked layer, marquee, rect drag-move, undo.

### Significant gaps (from test-coverage.md)

| Gap | Risk | Phase |
|-----|------|-------|
| No group move/scale/rotate tests in selectTool | High — all 4 bug fixes operate on `<g>` elements; regression goes undetected | Phase 2 |
| No scale-handler inverse transform integration test | High — old regex-only path vs new `invertMatrix` path | Phase 2 |
| `invertMatrix` with non-uniform scale, negative scale (mirror), near-singular | Medium | Phase 1 |
| `matrixToString` with rotation values producing float imprecision | Low | Phase 1 |
| Group lifecycle: create → move → rotate → scale → undo all | Medium | Phase 3 |
| freeTransformTool: group scale, rotation center, undo of new transforms | High | Phase 2 |
| directSelectTool: relative-command parsing, handle drag with movement | High | Phase 2 |
| PropertiesPanel: gradient undo, numeric input validation | Medium | — |
| clipboard.ts: paste group preserves children | High (was P0 bug) | Phase 2 |

The test-coverage review recommends a three-phase plan:
- Phase 1: Pure matrix edge cases (~30 min, no DOM)
- Phase 2: selectTool group helpers with `addGroup()` mock (~1–2 hrs)
- Phase 3: Full drag-cycle lifecycle integration (~1–2 hrs)

---

## 5. Conflicting / Contradictory Recommendations

### A. Unify matrix path vs. keep dual-path

**Torvalds** and **code-smells** both recommend unifying ALL element types on the matrix
composition path, treating `rotate(angle, cx, cy)` strings as tech debt.

**Architecture review** and **Knuth** explicitly recommend **keeping the dual-path design** for
now: "The split is architecturally justified by how SVG works. Migrating elements to
transform-only positioning would break the properties panel, SVG export readability, and several
downstream consumers." Knuth notes: "Converting any transform to `matrix()` loses the symbolic
decomposition... acceptable tradeoff for correctness."

**Resolution**: These are not truly contradictory — Torvalds/smells are calling for an eventual
refactor; Architecture/Knuth endorse the current state as pragmatically correct. The practical
outcome (fix session) kept the dual path for primitives, fixed only the matrix path for groups,
and added matrix fallbacks for edge cases. This aligns with the architecture review's
"Priority 1" fix list.

### B. `computeAnchor` called twice

**Code-smells review** flags `computeAnchor(handle, bbox).x` + `computeAnchor(handle, bbox).y`
as a DRY violation. This is a micro-issue with an obvious fix (destructure once). No reviewer
disagreed; it is simply uncontested tech debt.

### C. `decomposeMatrix` — dead code vs. needed

**Code-smells review** (2026-03-17): "`decomposeMatrix` is exported and tested but never called
by any production code."

**AGENTS.md** (2026-03-17 fix session): `decomposeMatrix` was wired into `freeTransformTool.ts`
(line 199) and `ControlBar.tsx` (fix for B-10, B-11) during the same session. The code-smells
finding was accurate at the time of the review snapshot but stale by end of day.

### D. Scale composition order (`origM * scaleAround` vs `scaleAround * origM`)

**Torvalds** flags the inconsistency: move uses `T * origM` (doc-space), scale uses
`origM * scaleAround` (local-space), rotate uses `R * origM` (doc-space). Calls for a test that
moves a group then scales it.

**Knuth** accepts the same code as "CORRECT (for single-group selection; latent concern for
multi-group selection)."

Both agree the single-group case is correct; they differ on how urgently to address the
multi-group edge case. The architecture review also identifies this as a latent geometric
inconsistency worth documenting.

---

## 6. Staleness Assessment

The reviews were all written on **2026-03-17** and the AGENTS.md handoff confirms fixes were
applied the same day. The following spot-greps confirm current state:

| Bug/Smell | Review claim | Current source | Status |
|-----------|-------------|----------------|--------|
| B-02: `computeTranslateAttrs` regex for groups | Bugs with `matrix()` transforms | `geometry.ts:96–103` now uses `parseTransform` + `multiplyMatrix` + `matrixToString` for `g`, `polygon`, `polyline` | **FIXED** |
| B-07: Context menu z-order bypasses undo | `appendChild` direct call | `App.tsx:124,134` now calls `history.execute(new ReorderElementCommand(...))` | **FIXED** |
| B-08: Gradient color bypass undo | Direct `setAttribute` on stops | `gradients.ts:126–127` still calls `setAttribute` directly — **see note below** | **AMBIGUOUS** |
| B-20: directSelectTool no `onDeactivate` | Visuals leak on tool switch | `directSelectTool.ts:351–354` now has `onDeactivate() { clearVisuals() ... }` | **FIXED** |
| B-21: Pen tool Escape commits | `finish()` on Escape | `penTool.ts:377–380` now calls `cleanup()` on Escape | **FIXED** |
| B-10: `getRotation` returns 0 for matrix | Regex only | `ControlBar.tsx:57–59` now falls back to `decomposeMatrix` | **FIXED** |
| SM-6: `decomposeMatrix` dead code | Never called in production | `freeTransformTool.ts:199`, `ControlBar.tsx:58` now call it | **FIXED / STALE FINDING** |
| B-28: No implicit repeat commands | Silent drop | `pathOps.ts:18–44` comment + `while(isNumericToken)` loop handles implicit repeats | **FIXED** |
| B-23: Scientific notation in pathOps | `replace(/-/g, ' -')` | `pathOps.ts:24` now uses `replace(/(?<![eE])-/g, ' -')` with lookbehind | **FIXED** |
| `computeTranslateAttrs` path regex | Still regex for `rotate()` on paths | `geometry.ts:79–94` still uses regex for rotate/skew on path elements — this is intentional (paths bake translation into d) | **KNOWN REMAINING DEBT** |

**Note on B-08 (gradient undo):** `gradients.ts:updateGradientColors` still calls `setAttribute`
directly on stop elements. AGENTS.md says this was fixed ("now uses `ModifyAttributeCommand`"),
but the current source at lines 126–127 does not show that wrapping. Either the fix is in the
call site in `PropertiesPanel.tsx` (not checked here), or this is a regression. Warrants
verification.

---

## 7. Lessons Learned

From `docs/lessons.md` — patterns the agent must internalize:

### Mouse events
- `playwright-cli mousedown/mouseup` default to `button: 'undefined'` — always pass `left`
  argument explicitly.
- Canvas has offset from viewport edge (toolstrip + layers panel) — coordinates must be within
  container bounds.

### Test infrastructure
- Tests using `createDocumentModel(svg)` need a `<g data-layer-name="...">` layer in the SVG.
  Without it, `getActiveLayer()` returns null and `addElement()` crashes.
- Always include a `makeSvg()` helper that adds the default layer.

### Export cleanliness
- Every new overlay group needs a `data-role` attribute and must be stripped in ALL export
  functions (SVG, PDF, PNG).
- Current strip selector: `[data-role="overlay"], [data-role="preview"], [data-role="grid-overlay"],
  [data-role="guides-overlay"], [data-role="user-guides-overlay"], [data-role="wireframe"]`.
- When adding a new overlay type, update the strip selector in `exportSvg`, `exportPdf`, and
  `exportPng`.

### New element type checklist
When adding a new SVG element type, update ALL of:
1. `geometry.ts` — `computeTranslateAttrs` (add to appropriate branch)
2. `EditorContext.tsx` / `nudge.ts` / `clipboard.ts` — nudge + paste handlers
3. `selectTool.ts` — hit test, `getAllGeomAttrs`, `getPositionAttrs`, `moveElement`, `scaleElement`
4. `freeTransformTool.ts` — `applyScale` (add element case or fall through to transform path)
5. `reflect.ts` — position attribute handling for flip operations
6. `PropertiesPanel.tsx` — Position and Size sections

The `<image>` tag omission from selectTool (Bug B-25) was caused by incomplete propagation.
`lessons.md` line 19 now explicitly documents this checklist.

### Transform model
- `geometry.ts:transformedAABB()` uses full affine matrix — handles translate, scale, rotate,
  skewX, skewY, matrix, and chained transforms. The old regex-only approach silently returned
  wrong AABB for non-rotate transforms.
- For rotated single elements, use LOCAL `getBBox()` (not `transformedAABB`) for:
  - Rotation center computation (always local bbox center, then transform to doc space)
  - Scale anchor computation (anchor must be in same coordinate space as element attributes)
- During scale of rotated elements, inverse-transform the mouse point to local space before
  computing scale factors.

### Underscore-prefixed parameters
- `_paramName` means intentionally unused.
- If you add code that uses the parameter, remove the underscore.
- The chaos monkey found `_getDoc` → `getDoc` bug in `directSelectTool.ts` via this pattern.

### Beads issue tracking
- `bd` requires Dolt server running: `ps aux | grep dolt`
- `bd v0.58+` auto-starts Dolt if installed at `~/.local/bin/dolt`
- Use `/home/tobias/.local/bin/bd` (not bare `bd`) if PATH has old version

---

## Appendix: Document inventory

| Document | Approx lines | Focus |
|----------|-------------|-------|
| architecture.md | 200 | Group transform dual-path analysis; image/polygon gaps |
| code-bugs.md | 189 | 9 bugs: selectTool dead zone, computeTranslateAttrs, ControlBar, pathOps |
| code-bugs-2.md | 180 | 7 bugs: clipboard paste, freeTransformTool undo/rotation/scale, geometry nudge |
| code-bugs-3.md | 216 | 12 bugs: PropertiesPanel, MenuBar, context menu, directSelect, penTool |
| code-smells.md | 205 | 10 smells: dual-path, shotgun surgery, feature envy, dead code, type safety |
| knuth.md | 352 | Mathematical verification of all 11 matrix operations — all CORRECT |
| torvalds.md | 259 | Fix-by-fix review: 3 GOOD + 1 OK; structural critique of dual-path |
| test-coverage.md | 462 | Gaps + suggested test scaffolding for matrix and selectTool group ops |
| lessons.md | 54 | Operational lessons from previous sessions |
| AGENTS.md | 611 | Handoff context; confirms all 43 bugs fixed 2026-03-17 |
| README.md | 71 | Project overview and stack |
