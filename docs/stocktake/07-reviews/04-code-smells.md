# Code Smells & Maintainability Audit — vectorfeld

**Auditor:** adversarial staff engineer review  
**Date:** 2026-04-19  
**Codebase snapshot:** ~17,570 LOC across 110 source + test files  
**Context:** Use-case pivot from scientific-diagram authoring → casual PDF editing; pivot complete as of 2026-04-19 (see `docs/stocktake/06-pdf-roundtrip-experiment.md`).

Severity scale: **ROT** = active lie that will confuse next session / **SMELL** = ugly but understood / **STYLE** = taste.

---

## 1. Executive Summary

The codebase is impressively functional and structurally sound for its size. The 2026-03-17 fix session resolved the most critical bugs and the 2026-04-19 pivot work was clean. The maintainability debt is **moderate but concentrated**: one dead UI component, two near-identical modules that should share a base, a god-object component (PropertiesPanel), a 736-line tool with five parallel switch chains, and an API.md that is almost entirely wrong. The hottest liability is `docs/API.md` — it documents 5 tools, a deleted `Toolbar.tsx`, a 500ms-polling LayersPanel, and 66 tests across 8 files when the reality is 15 tools, `ToolStrip.tsx`, event-subscription, and 461 tests across 37 files. Any new agent session starts with a map that describes a different city. Second hottest: the `clipping.ts` / `opacityMask.ts` duplication is not a copy-paste smell — it is a copy-paste bomb, because a future bug fix in `ClipMaskCommand` will silently not apply to `MaskCommand`. Third: `SwatchPanel.tsx` is orphaned and pulls `swatches.ts` with it; together they are ~120 LOC that a future agent will burn time trying to wire up before realising it's unreachable.

---

## 2. Dead Code

### 2.1 `SwatchPanel.tsx` — orphaned component  
**Severity: ROT**  
`src/components/SwatchPanel.tsx` (50 LOC) exports `SwatchPanel` but is never imported anywhere. The only inbound references in the entire `src/` tree are within the file itself (the export declaration). `src/model/swatches.ts` (72 LOC) and `src/model/swatches.test.ts` (50 LOC) exist solely to support it. The swatch concept never surfaced in the UI — ColorPicker has its own 18-color preset grid.

**Evidence:** `grep -r SwatchPanel src/` returns only `src/components/SwatchPanel.tsx` itself. No import in `App.tsx`, `PropertiesPanel.tsx`, or `ColorPicker.tsx`.

**Cleanup:** Delete `src/components/SwatchPanel.tsx`, `src/model/swatches.ts`, `src/model/swatches.test.ts`. Estimated savings: **~172 LOC**.

Post-pivot note: the swatch concept is even less relevant now that the use case is PDF editing rather than diagram authoring.

---

### 2.2 `tikzExport.ts` — dead in the pivot context  
**Severity: SMELL** (not ROT — the menu item still renders it)  
`src/model/tikzExport.ts` (178 LOC) + `src/model/tikzExport.test.ts` (119 LOC) implement TikZ export for the original scientific-diagram use case. The feature is still reachable via `File → Export TikZ` in `App.tsx:157`, but the pivot to casual PDF editing means no PDF-editing user will ever want a `.tex` file. The module is kept alive by a single menu item.

This is not dead in the strict sense, but it is **near-dead** and the pivot makes it maintenance tax. The tests pass but test a feature no user needs. 

**Cleanup:** No immediate delete required, but annotate the menu item and module with `// Scientific-diagram legacy feature — not used in PDF-editing workflow` so the next agent doesn't wonder why it's there. If the pivot is final, delete both files (+297 LOC) and remove the `Export TikZ` menu entry and its `exportTikz` import in `fileio.ts`.

---

### 2.3 `offsetPath.ts` — scientific-diagram feature, barely reached  
**Severity: SMELL**  
`src/model/offsetPath.ts` (218 LOC) + test (50 LOC) implement an Offset Path command. Reachable via `Object → Offset Path...` in `App.tsx:336`. For the PDF-editing pivot it is an exotic edge case, not core. The algorithm is custom (sample-normals-fit-cubic) rather than using a library, so it adds future maintenance risk.

**Cleanup:** Same as tikzExport — annotate as `// Scientific-diagram legacy feature` for now. If pivot is firm, delete (+268 LOC).

---

### 2.4 `textPath.ts` — scientific-diagram feature  
**Severity: SMELL**  
`src/model/textPath.ts` (114 LOC) + test (110 LOC) implement text-on-path. Reachable via `Object → Place Text on Path`. Not relevant to casual PDF editing. The `// Oops` comment at line 26 (detailed in §5) is also in this file.

**Cleanup:** Annotate as legacy. Potential delete if pivot is confirmed: +224 LOC.

---

## 3. Duplication

### 3.1 `clipping.ts` vs `opacityMask.ts` — structural copy  
**Severity: SMELL** (verging on ROT for the bug-propagation risk)  
`src/model/clipping.ts` (157 LOC) and `src/model/opacityMask.ts` (116 LOC) are structurally identical. The `opacityMask.ts` file header explicitly says "Mirrors the clipping.ts pattern exactly." The two `Command` classes — `ClipMaskCommand` / `MaskCommand` and `ReleaseClipMaskCommand` / `ReleaseMaskCommand` — differ only in:

- The SVG element tag name (`clipPath` vs `mask`)
- The attribute name (`clip-path` vs `mask`)
- The description string

Every other field, every execution step, every undo step is identical. This is **not** a naming similarity — the constructor body, `execute()`, and `undo()` are character-for-character the same logic.

Bug-propagation risk: if a bug is found in `ReleaseClipMaskCommand.undo()` (e.g., the `appendTo(defs)` pattern fails for nested SVGs), the fix will be applied to one file and silently not to the other.

**Cleanup:** Extract an abstract `DeferredDefCommand` base class or generic factory:

```typescript
// src/model/defsMaskBase.ts (~80 LOC)
export function makeDefsMaskCommands(
  defsTag: 'clipPath' | 'mask',
  attrName: 'clip-path' | 'mask',
  makeDescription: string,
  releaseDescription: string
)
```

`clipping.ts` and `opacityMask.ts` become thin wrappers calling the base. Estimated savings after refactor: **~150 LOC** (eliminate the duplicate body).

---

### 3.2 `commandsNew.test.ts` — misleading filename, real duplication of test target  
**Severity: SMELL**  
`src/model/commandsNew.test.ts` (285 LOC) and `src/model/commands.test.ts` (211 LOC) both test `src/model/commands.ts`. There is no `commandsNew.ts`. The "New" name is historical (added when `ReorderElementCommand`, `GroupCommand`, `UngroupCommand` were added as "new" commands). Now it is permanently confusing — anyone searching for where `GroupCommand` is tested will check `commands.test.ts` first, not find it, and wonder.

**Cleanup:** Rename `commandsNew.test.ts` → `commands-reorder-group.test.ts` (or merge into `commands.test.ts` under a `describe('Reorder/Group commands')` block). Zero LOC saved; pure clarity gain.

---

### 3.3 `snapAngle.test.ts` — duplicates private function from `lineTool.ts`  
**Severity: SMELL**  
`src/tools/snapAngle.test.ts` (156 LOC) opens with a comment: "We duplicate it here for direct unit testing. The implementation must stay in sync with `src/tools/lineTool.ts`." The `snapLineAngle` function body is copy-pasted verbatim. This is a maintenance time-bomb: any change to the angle-snap logic in `lineTool.ts` does not automatically fail these tests — the tests will continue passing against the stale copy.

**Cleanup:** Export `snapLineAngle` from `lineTool.ts` (it is a pure function with no side effects) and import it in `snapAngle.test.ts`. The duplicate body in the test file is then deleted. Net: −37 LOC of duplicate logic, test always reflects production code.

---

### 3.4 `selectTool.ts` vs `freeTransformTool.ts` — scale/rotate logic duplication  
**Severity: SMELL**  
Both tools implement scale-around-anchor and rotate-around-center using identical matrix composition patterns (`T * M * T⁻¹` and `R * M`). The switch/case element-type dispatch in `scaleElement` (selectTool, lines 229–279) is partially duplicated in `freeTransformTool.ts` (~lines 130–200). The source map flagged this. Not a copy-paste — the tools have different UX (8-handle vs 4-corner), so some divergence is appropriate — but the pure math helpers could be consolidated.

**Cleanup:** Already partially addressed by extraction of `scaleAroundMatrix` to `matrix.ts`. Further extraction is optional. Annotate the duplication with a comment linking the two files.

---

### 3.5 Skew regex duplicated across 4 files  
**Severity: SMELL**  
The pattern `orig.match(/skewX\([^)]+\)/)` and `orig.match(/skewY\([^)]+\)/)` appears in:
- `src/tools/selectTool.ts` (lines 206–215)
- `src/model/geometry.ts` (lines 82–84)
- `src/components/PropertiesPanel.tsx` (lines 379–382)
- `src/model/matrix.ts` (`parseSkew`/`setSkew` — but these go through string not through the pattern directly)

The first three operate on the raw string independently rather than calling `parseSkew`/`setSkew` from `matrix.ts`, which already exist for this purpose. `parseSkew` is imported in `PropertiesPanel` but not used in the regex path in `selectTool`.

**Cleanup:** In `selectTool.ts` `moveElement` (lines 212–215), replace the inline `skewXMatch`/`skewYMatch` extraction with `parseSkew(orig)` + `setSkew(...)`. Reduces the duplicate pattern to 2 sites. ~10 LOC change.

---

## 4. God Files

### 4.1 `PropertiesPanel.tsx` — 684 LOC, 7 independent concerns  
**Severity: SMELL**

The file contains:

| Lines | Concern |
|-------|---------|
| 1–97 | `PropertyInput` primitive (reusable input with edit/blur/commit) |
| 99–215 | Multi-selection: align/distribute buttons with command wiring |
| 218–258 | Position section (tag-dependent: rect/ellipse/circle/line/path/g) |
| 259–358 | Size section with aspect-lock (rect/ellipse/image) |
| 362–411 | Transform section (rotation, skewX, skewY) |
| 414–469 | Font section (text elements only) |
| 471–638 | Style section: stroke, fill type switcher, gradient color pickers, dash preset, cap/join, opacity |
| 640–678 | Markers section (line/path elements only) |

None of these sections share state with each other (each reads directly from the element). They are held in one file by historical accretion.

**Cleanup plan:**
1. Extract `src/components/PropertyInput.tsx` (~50 LOC) — already used by ControlBar.tsx in spirit; make it a shared primitive.
2. Extract `src/components/AlignDistributePanel.tsx` (~70 LOC) — multi-selection align/distribute UI.
3. Extract `src/components/GradientEditor.tsx` (~100 LOC) — the fill-type selector + C1/C2 gradient color pickers (lines 471–563).
4. Extract `src/components/MarkersSection.tsx` (~40 LOC) — start/end marker selectors.

`PropertiesPanel.tsx` shrinks from 684 to ~350 LOC and becomes a layout coordinator.

---

### 4.2 `selectTool.ts` — 736 LOC, 5 parallel per-type dispatch chains  
**Severity: SMELL** (also the primary source of shotgun surgery — see §6)

| Lines | Concern |
|-------|---------|
| 1–49 | Constants and type definitions |
| 50–137 | `getAllGeomAttrs`, `computeAnchor`, `handleAxes`, `unionBBox` — pure helpers |
| 139–281 | `createSelectTool` closure: `getPositionAttrs`, `moveElement`, `scaleElement`, `commitChanges` |
| 282–516 | `onMouseDown` (140 lines) — mode dispatch: click-select, handle-click, rotate-click, marquee-start |
| 517–680 | `onMouseMove` (163 lines) — mode dispatch: move, scale, rotate, marquee |
| 681–729 | `onMouseUp`, `onKeyDown`, `onDeactivate`, commit logic |
| 730–736 | `registerSelectTool` |

**Cleanup plan:**
1. Extract `src/tools/selectToolGeom.ts` (~140 LOC): `getAllGeomAttrs`, `getPositionAttrs`, `moveElement`, `scaleElement`, `computeAnchor`, `handleAxes`, `unionBBox`. These are pure functions with no closure state.
2. Split `onMouseDown` into mode handlers: `handleScaleStart`, `handleRotateStart`, `handleMarqueeStart`.
3. Split `onMouseMove` into `handleScaleMove`, `handleRotateMove`, `handleMarqueeMove`.

Result: `selectTool.ts` drops from 736 to ~350 LOC; geometry helpers become independently testable.

---

### 4.3 `App.tsx` — 464 LOC, business logic at component root  
**Severity: SMELL**

Lines 190–363 contain the entire Object menu — 173 lines of operation logic (boolean ops, clipping, compound paths, reflect, text-on-path, offset path) inlined as arrow functions inside a JSX expression. This logic is untestable (it is inside `AppContent` closure) and unlocatable (grep for "Make Clipping Mask" returns only `App.tsx`).

**Cleanup plan:** Extract `src/model/objectOperations.ts` (~150 LOC) with pure functions that take `(doc, history, selection)` and call the underlying model functions. `App.tsx` becomes a thin wiring layer. The operations become unit-testable.

---

### 4.4 `pathOps.ts` — 668 LOC, 4 independent responsibilities  
**Severity: SMELL**

| Lines | Responsibility |
|-------|---------------|
| 1–200 | Parser: `parsePathD`, tokenizer, command normalization |
| 201–300 | Serializer: `commandsToD` |
| 301–500 | Queries: `nearestSegment`, `splitPathAt`, `splitPathAtT`, `intersectLineWithPath` |
| 501–668 | Transforms: `translatePathD`, `scalePathD`, `joinPaths` |

**Cleanup:** Could split into `pathParse.ts`, `pathQuery.ts`, `pathTransform.ts`. This is low-urgency since the file is well-organized within itself — it just makes it hard to understand scope at a glance.

---

## 5. Stale Comments, Lies, and Name Drift

### 5.1 `textPath.ts:26` — "Oops" workaround comment  
**Severity: SMELL**  
`src/model/textPath.ts:26`:
```typescript
// Oops — we don't want a new element, just an id. Set it directly.
```
This comment marks a genuine workaround: the code calls `doc.addElement(...)` to generate an ID, then immediately calls `setAttribute('id', ...)` to override the generated ID, effectively creating a throwaway element. The throwaway element is never cleaned up — it is silently abandoned in the layer.

This is a logic bug, not just a comment issue. The correct fix: call `generateId()` directly (already exported from `document.ts`) and `setAttribute` without creating an element.

**Cleanup:** Replace lines 24–28 with:
```typescript
import { generateId } from './document'
// ...
if (!pathId) {
  pathId = generateId()
  pathEl.setAttribute('id', pathId)
}
```
`~5 LOC` change, eliminates the orphaned element.

---

### 5.2 `commandsNew.test.ts` — name lies about its contents  
**Severity: ROT** (wastes new-agent archaeology time)  
The filename `commandsNew.test.ts` implies either a `commandsNew.ts` source or a "new commands" module. Neither exists. It tests `commands.ts`. The comment in the source map acknowledges this but the file itself has no such explanation.

**Cleanup:** Rename to `commands-group-reorder.test.ts`. One `git mv`.

---

### 5.3 `artboard.ts` — name implies multi-artboard; API is multi, Canvas is single  
**Severity: SMELL**  
`src/model/artboard.ts` has full multi-artboard CRUD (`addArtboard`, `removeArtboard`, `setActiveArtboard`, `artboardAtPoint`, `computeDocumentBounds`). However, `Canvas.tsx:71–72` always creates exactly one artboard and never exposes UI to add more. The PRD explicitly marks "Multiple artboards" as `never`. The module is named and designed for multi, but used as single-artboard-only.

**Cleanup:** The module is not lying — it's ready for multi. The lie is in the usage. Add a comment to `Canvas.tsx:71` and `artboard.ts` module header: `// Multi-artboard API ready; UI currently exposes single artboard only.`

---

### 5.4 `PropertiesPanel.tsx:369–371` — rotation display ignores matrix transforms  
**Severity: SMELL**  
```typescript
const match = transform.match(/rotate\(([-\d.]+)/)
return match ? String(Math.round(parseFloat(match[1]) * 100) / 100) : '0'
```
This reads `rotate()` directly from the transform string. For elements moved via the select tool after bug B-09/B-10 fixes, the transform may be stored as `matrix(...)`. In that case, the regex returns nothing and the rotation display shows `'0'` even if the element is rotated. `ControlBar.tsx` fixed this bug (B-10) by falling back to `decomposeMatrix` — `PropertiesPanel.tsx` did not receive the same fix. The panel lies about the current rotation for matrix-transformed elements.

**Cleanup:** Replace the inline regex in `PropertiesPanel.tsx` lines 367–371 with the same `decomposeMatrix` fallback that `ControlBar.tsx` uses. ~5 LOC change.

---

### 5.5 `Canvas.tsx:139` — suppressed dependency warning  
**Severity: STYLE**  
```typescript
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [])
```
The comment doesn't explain why the deps are intentionally empty — it could mean "this runs once on mount" or "I forgot to add deps." Add a comment: `// Intentional: run once on SVG mount; refs/callbacks are stable via useCallback/useRef`.

---

## 6. Shotgun Surgery / Missing Registries

### 6.1 New element type requires 6 coordinated edits  
**Severity: ROT** (proven to cause bugs: B-25 was `<image>` gap)

`docs/lessons.md:18–22` documents this checklist explicitly, which is good — but the fix is still a checklist in docs rather than a registry. Adding a new SVG element type requires:

1. `src/model/geometry.ts` — `computeTranslateAttrs`: add to the tag dispatch chain (lines 57–115)
2. `src/model/EditorContext.tsx` — clipboard paste/nudge handlers: add to tag dispatch
3. `src/tools/selectTool.ts` — `getAllGeomAttrs`, `getPositionAttrs`, `moveElement`, `scaleElement`: 4 separate switch chains (lines 51–280)
4. `src/tools/freeTransformTool.ts` — `applyScale`: add element case
5. `src/model/reflect.ts` — `computeReflectH`, `computeReflectV`: add position-attribute handling
6. `src/components/PropertiesPanel.tsx` — add position/size section

The `<image>` tag was added to `selectTool.ts` but the lessons checklist reveals it was previously missing from `geometry.ts` too. The bug pattern: each dispatch chain is in a different file; there is no central table to find and update.

**Cleanup (medium effort):** Define an element-type strategy object in `src/model/elementTypes.ts`:

```typescript
export interface ElementTypeStrategy {
  tag: string
  getPositionAttrs: (el: Element) => Record<string, number>
  setPositionAttrs: (el: Element, attrs: Record<string, number>) => void
  getSizeAttrs: (el: Element) => Record<string, number>
  // etc.
}
export const ELEMENT_STRATEGIES: Record<string, ElementTypeStrategy> = { ... }
```

All the per-type dispatch chains in `geometry.ts`, `selectTool.ts`, `reflect.ts`, `PropertiesPanel.tsx` look up their strategy from this registry. Adding a new type means one entry in one table. Estimated effort: 2–3 hours refactor; permanently eliminates the B-25 class of bug.

---

### 6.2 New overlay type requires 3 coordinated strip-selector updates  
**Severity: SMELL**  
Adding an overlay group requires updating the strip selector string in `exportSvg`, `exportPdf`, and `exportPng` in `fileio.ts`. Currently handled by a lesson in `docs/lessons.md:13–16`. The selector is a magic string hardcoded in three export functions.

**Cleanup:** Define `export const OVERLAY_STRIP_SELECTOR` as a named constant in a shared location (e.g., `model/overlayRoles.ts`) and import it in `fileio.ts`. All three export functions use the same constant. One edit instead of three.

---

## 7. Type Escape Hatches

| Location | Pattern | Justified? |
|----------|---------|-----------|
| `src/model/pdfImport.ts:16` | `let mupdf: any = null` | Yes — MuPDF WASM has no TS typings; eslint-disable comment present |
| `src/model/pathBooleans.ts:9,43` | `let paperModule: any = null`, `let result: any` | Yes — Paper.js lazy-load; same rationale |
| `src/tools/selectTool.test.ts:72` | `;(rect as any).getBBox = ...` | Acceptable — jsdom doesn't implement getBBox; this is the standard workaround |
| `src/tools/selectTool.test.ts:414,445` | `;(g as any).getBBox = ...` | Same as above |
| `src/tools/freeTransformTool.test.ts:9,17–64` | `() => ({} as any)` for CommandHistory | Mild concern — a stub type would be cleaner than `any` |
| `src/tools/penTool.test.ts:34,40,42` | `as unknown as DOMMatrix`, `as unknown as SVGPoint` | Acceptable — jsdom mock pattern |
| `src/tools/selectTool.test.ts:40,47,51` | Same `as unknown as` DOMMatrix/SVGPoint | Acceptable |
| `src/model/textPath.test.ts:21`, `opacityMask.test.ts:21` | `makeSvg() as unknown as SVGSVGElement` | Acceptable — jsdom SVG type narrowing |

The `freeTransformTool.test.ts` pattern of passing `() => ({} as any)` for `CommandHistory` is the only non-trivial concern: it silently accepts any shape for the history mock. A named stub type would make it refactor-safe:

```typescript
const stubHistory = { execute: vi.fn(), undo: vi.fn() } satisfies Partial<CommandHistory>
```

No `any` needed. This prevents the test from silently breaking if `CommandHistory` gains a required method.

---

## 8. Docs Drift

### 8.1 `docs/API.md` — ROT  
**Severity: ROT** (confirmed by `05-prd-vs-reality.md` §5 which lists 8 specific lies)

The API.md documents an early-development state. Specific contradictions:

| API.md claim | Reality |
|-------------|---------|
| `Toolbar.tsx` at `src/components/Toolbar.tsx` | File does not exist; replaced by `ToolStrip.tsx` |
| Registered tools table: 5 tools (V/L/R/E/X) | 15 tools registered |
| `useToolShortcuts` listens for "V/L/R/E/X" | Listens for all 15 tool shortcuts |
| `registerAllTools` "registers all 5 tools" | Registers 15 tools |
| `LayersPanel` "refreshes every 500ms" | Uses `history.subscribe` + `subscribeSelection` |
| `EditorProvider` "manages internal clipboard" | Clipboard extracted to `model/clipboard.ts` |
| "66 tests across 8 files" | 461 tests across 37 passing files |
| Canvas `CanvasProps` has no `onContextMenu` | `onContextMenu` prop is present and used |
| Section 6 (`fileio.ts`) only documents `exportSvg` and `importSvg` | Also exports `exportPdf`, `exportPng`, `exportTikz`, `parseSvgString`, `exportSvgString`, `placeImage` |
| No `DocumentModel.getDefs()` | Present and critical for gradients/markers/defs management |

A new agent reading API.md will: look for `Toolbar.tsx` (gone), register 5 tools (wrong), think selection is polled (wrong). Every significant statement is stale.

**Cleanup:** A full API.md rewrite is a 2–3 hour task (already recommended as P2 in `05-prd-vs-reality.md`). At minimum, add a header: `WARNING: This file was last updated during the 5-tool MVP phase. Current codebase has 15 tools and ~85 files. Use docs/stocktake/01-source-map.md as the current reference.`

---

### 8.2 `AGENTS.md` — inflated claims  
**Severity: SMELL** (documented by `05-prd-vs-reality.md` §6)

The "Current state" section claims:
- "Phase 2 complete: 43/43 features (100%)" — **inflated**: 8 PRD Phase 2 features never implemented (Brush, Magic wand, Multi-artboards, Image trace, Appearance panel, Blend, Constraints, NL). The 43/43 counts against an internal sprint scope, not the full PRD.
- "472 tests passing across 40 test files" — **stale**: currently 461 / 37 passing (3 fail to load due to mupdf/paper).
- "Zero type errors" — **unclear**: `tsc -b` returned no output in this audit; the prior review claimed 42 errors. Status is ambiguous.
- "Known bugs: None" — **stale**: 9 open bugs in beads.

The handoff section does not mention the use-case pivot (documented separately in `05-prd-vs-reality.md` and `06-pdf-roundtrip-experiment.md`) or the `text=text` mode change.

**Cleanup:** Update the "Current state" summary section to reflect the pivot and accurate counts. Add a one-sentence pivot summary: "Use case pivoted 2026-04-19 to casual PDF editing; pdfImport.ts switched to text=text mode."

---

### 8.3 `README.md` — stale use-case description  
**Severity: SMELL**  
Lines 5–8: "Create publication-quality vector diagrams for inclusion in LaTeX documents. Diagram types include quantum circuits, geometric constructions, graphs..." This describes the original scientific-diagram use case. The pivot to casual PDF editing is undocumented in README.

**Cleanup:** Update the "What it does" section. Two sentences.

---

### 8.4 `docs/lessons.md` — honest and useful  
**Severity:** No issues. The lessons file is accurate, actionable, and up-to-date. The new-element-type checklist at lines 18–22 correctly lists all 6 touch-points. The playwright-cli section is accurate. This file is doing its job.

---

## 9. Top 15 Cleanups Ranked by ROI

Ranked by (confusion-prevented × ease). "Session" = one 2–4 hour work session.

| # | Cleanup | Severity | Effort | LOC delta | ROI |
|---|---------|----------|--------|-----------|-----|
| 1 | Add warning banner to `docs/API.md` (or full rewrite) | ROT | 30 min (banner) / 3h (rewrite) | +1 / +300 | Highest — unblocks every new agent session |
| 2 | Delete `SwatchPanel.tsx` + `swatches.ts` + `swatches.test.ts` | ROT | 10 min | −172 | Easy delete; stops agents from wiring dead code |
| 3 | Fix `textPath.ts:24–28` — eliminate orphaned element creation via `generateId()` | ROT | 15 min | −3 | Bug fix masquerading as comment; small change |
| 4 | Rename `commandsNew.test.ts` → `commands-group-reorder.test.ts` | ROT | 2 min | 0 | One `git mv`; stops "where is GroupCommand tested?" archaeology |
| 5 | Export `snapLineAngle` from `lineTool.ts` and delete the copy in `snapAngle.test.ts` | SMELL | 15 min | −37 | Test always reflects production; prevents silent divergence |
| 6 | Fix `PropertiesPanel.tsx:367–371` rotation display to use `decomposeMatrix` fallback | SMELL | 15 min | +3 | Matches the ControlBar fix; stops display lie for matrix-transformed elements |
| 7 | Extract `clipping.ts` / `opacityMask.ts` shared base into `defsMaskBase.ts` | SMELL | 1–2h | −150 | Prevents bug-fix-one-not-the-other class of regression |
| 8 | Define `OVERLAY_STRIP_SELECTOR` constant in `model/overlayRoles.ts` | SMELL | 30 min | −10 | One edit instead of three on every new overlay type |
| 9 | Extract `PropertyInput.tsx` from `PropertiesPanel.tsx` | SMELL | 30 min | 0 (move) | Enables reuse; reduces PropertiesPanel surface |
| 10 | Add `// Scientific-diagram legacy` annotation to `tikzExport.ts`, `offsetPath.ts`, `textPath.ts` | SMELL | 10 min | +3 | Orients next agent to pivot context without deletion risk |
| 11 | Add `elementTypes.ts` registry for per-type dispatch (or at minimum extract `selectToolGeom.ts`) | SMELL | 2–3h | −100 | Prevents B-25-class bugs permanently |
| 12 | Replace `() => ({} as any)` in `freeTransformTool.test.ts` with typed stub | SMELL | 20 min | −5 | Refactor-safe test; no runtime risk but saves future confusion |
| 13 | Update `AGENTS.md` current-state section with accurate counts and pivot summary | SMELL | 20 min | +10 | Correct the inflated "100%" claim; adds pivot context |
| 14 | Update `README.md` use-case description to reflect PDF-editing pivot | SMELL | 5 min | +2 | README describes a different product |
| 15 | Add skew preservation to `selectTool.ts:moveElement` via `parseSkew`/`setSkew` instead of inline regex | SMELL | 30 min | −10 | Eliminates one of three regex-skew duplications |
