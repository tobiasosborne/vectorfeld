# PRD vs Reality Stocktake — vectorfeld

_Audited: 2026-04-19_
_Sources: `vectorfeld-prd.md`, `docs/API.md`, `AGENTS.md`, codebase at `src/`._

## 1. PRD Summary

**Vision**: Hyper-personal vector-graphics editor for scientific diagram creation, with LaTeX export (SVG/PDF/TikZ). Phase 2 adds surgical PDF editing.

**Phase 1 (MVP) — 22 features across 11 sprints:**

| Group | PRD Features |
|-------|-------------|
| Drawing tools | Line, Rectangle, Ellipse, Pen/Bézier, Eraser |
| Selection & manipulation | Select (click/marquee/shift), Direct select (anchors), Group/Ungroup, Move (drag/nudge/numeric), Scale, Rotate |
| Organisation | Layers panel, Copy/Paste/Duplicate, Arrange (z-order) |
| Styling | Stroke weight, Solid fill/stroke color picker |
| Text | Point text (`<text>`), Font family/size/letter-spacing |
| Infrastructure | Artboard setup, Zoom/Pan, Undo/Redo, SVG export, SVG import |

**Phase 2 (43 prioritised items):** PDF import/export, Align/Distribute, Snap-to-grid, Smart guides, Guides, Grid display, Path booleans, Compound paths, Clipping masks, Gradient fills, Stroke dash/cap/join, Area text, Text on path, Arrow markers, Offset path, Eyedropper, Color swatches, Pencil, Brush (never), Lasso, Magic wand (never), Reflect, Shear/Skew, Free transform, Rulers, Measure, Multiple artboards (never), Outline view, Simplify path, Join/avg anchors (partial), Scissors, Knife, Blend (never), PNG export, Raster embed, Image trace (never), Opacity, Opacity masks, Appearance panel (never), TikZ export, Persistent constraints (never), Natural language input (never).

**North-star principle:** SVG is the internal representation; 1 SVG unit = 1 mm.

## 2. Implemented Per PRD

**All 22 Phase 1 MVP features are present in code.** (Evidence in source map: every PRD item maps to a file in `src/tools/` or `src/model/`.)

**Phase 2 features implemented (~35 of 43):**
PDF export, Align/Distribute, Snap-to-grid, Smart guides, Guides, Grid display, Path booleans, Compound paths, Clipping masks, Linear/radial gradient fill, Stroke dash patterns/caps/joins, Area text, Text on path, Arrow markers, Offset path, Eyedropper, Color swatches, Pencil, Lasso, Reflect/Mirror, Shear/Skew, Free transform, Rulers, Measure, Scissors, Knife, PNG export, Raster image embed, Opacity, Opacity masks, TikZ export, PDF import, Outline/wireframe view, Simplify path.

## 3. Missing Per PRD

| PRD Phase 2 Feature | Status |
|--------------------|--------|
| Brush tool (#11) | No `brushTool.ts` |
| Magic wand (#16) | No `magicWandTool.ts` |
| Multiple artboards (#57) | `artboard.ts` handles single artboard only |
| Image trace (#77) | Not implemented |
| Appearance panel (#81) | No `AppearancePanel` |
| Persistent constraints | No constraint system |
| Natural language command input | No NL parser |
| Join / average anchors (#66) | `joinPaths` joins two path elements, but no anchor-level join in direct-select |
| Blend tool (#69) | No `blendTool.ts` |

**Partial / off-spec:**
- **Font enumeration (R-02):** PRD flags as research issue. Implementation uses hardcoded 11-font safe list in `PropertiesPanel.tsx` rather than Tauri-based system enumeration; decision not documented.

## 4. Beyond PRD — Undocumented Additions

| Feature | Location |
|---------|----------|
| Full affine matrix transform model | `model/matrix.ts` (incl. `invertMatrix`, `decomposeMatrix`, `scaleAroundMatrix`) |
| Shape-to-path conversion (Object > Convert to Path) | `model/shapeToPath.ts` |
| Path join (Object > Join Paths) | `model/pathOps.ts:joinPaths` |
| Right-click context menu | `components/ContextMenu.tsx` |
| Control bar (X/Y/W/H/R numeric inputs) | `components/ControlBar.tsx` |
| Fill/stroke widget | `components/FillStrokeWidget.tsx` |
| Active layer pub-sub | `model/activeLayer.ts` |
| Default style (last-used inheritance) | `model/defaultStyle.ts` |
| SVG defs management | `document.ts:getDefs()`, `gradients.ts`, `markers.ts` |
| Smart guide endpoint snap for line tool | `model/smartGuides.ts` + `tools/lineTool.ts` |
| Alt+click stack cycling | `selectTool.ts` |
| Ctrl+A Select All | `EditorContext.tsx` |
| Menu bar dropdowns | `components/MenuBar.tsx` |
| Vertical tool strip sidebar | `components/ToolStrip.tsx` |
| Canvas-based rulers with ResizeObserver | `Ruler.tsx` |
| W3C SVG benchmark suite | `test-benchmarks/` |

## 5. API.md Drift

`docs/API.md` reflects an early (5-tool) state and has significant drift.

### Undocumented in API.md but present in code

- `ToolConfig.cursor` and `ToolConfig.onDeactivate` (registry.ts)
- `DocumentModel.getDefs()` (critical for gradients/markers)
- `syncIdCounter(svg)`
- `ReorderElementCommand`, `GroupCommand`, `UngroupCommand`
- 10 additional tools: pen, text, directSelect, eyedropper, pencil, measure, scissors, knife, lasso, freeTransform
- ~27 additional `model/` modules (align, gradients, grid, guides, markers, matrix, pathOps, smartGuides, etc.)
- `exportPdf`, `exportPng`, `exportTikz`, `importPdf`, `placeImage`
- 6 extra components: ToolStrip, MenuBar, ControlBar, FillStrokeWidget, ContextMenu, SwatchPanel, Ruler

### Documented in API.md but NOT matching code

| API.md Claim | Reality |
|-------------|---------|
| `Toolbar` at `src/components/Toolbar.tsx` | Does NOT exist (deleted per AGENTS.md). Equivalent is `ToolStrip.tsx`. |
| `LayersPanel` listed on left side | Rendered in right column below PropertiesPanel. |
| `LayersPanel` "refreshes every 500ms" (polling) | Replaced by `history.subscribe` + `subscribeSelection`. |
| `EditorProvider` "manages internal clipboard" | Clipboard extracted to `model/clipboard.ts`. |
| Registered tools table shows 5 | 15 tools registered. |
| `useToolShortcuts` "listens for V/L/R/E/X" | Listens for all 15 shortcuts. |
| Test count: "66 tests across 8 files" | Current: **461 tests / 37 passing files** (3 fail to load). |
| `CanvasProps` no `onContextMenu` | Present and used in `App.tsx`. |

## 6. AGENTS.md Claims vs. Reality

AGENTS.md (updated 2026-03-18) claims **"MVP complete (22/22). Phase 2 complete: 43/43 features (100%). 472 tests passing across 40 test files."**

| Claim | Verdict |
|-------|---------|
| 22/22 MVP features | **ACCURATE** |
| 43/43 Phase 2, 100% | **INFLATED.** Scope is internal sprint plan, not full PRD Phase 2 (8 unimplemented items). |
| 472 tests / 40 files | **STALE.** Now 461 / 37 passing; 3 files fail to load. |
| Zero type errors | **STALE.** `tsc -b` reports 42 errors. |
| "Known bugs: None" | **STALE.** 9 open bugs in beads (see project-state report). |

### Critical: Missing npm packages

`mupdf` and `paper` are in `package.json` dependencies but NOT in `node_modules`. Causes:
- `pdfImport.test.ts`, `pathBooleans.test.ts`, `App.test.tsx` fail to load (0 tests run)
- At runtime, `await import('mupdf')` and `await import('paper')` would fail when PDF import or path booleans are first triggered

**PDF import and path booleans are broken in current environment.** `npm install` is needed.

## 7. Recommended Next-Up Features

### P0 (blocker): `npm install` for `mupdf` + `paper`

Restores PDF import, path booleans, and 3 test files with zero code changes.

### P1: Pen tool correctness (3 P2 bugs)

Pen tool cannot produce `S`/`s` smooth curveto commands, asymmetric handles, or multi-subpath elements (vectorfeld-9hu, t7u, 3t8). The paths-data-01 W3C benchmark scored 0/10. Pen is the primary drawing tool for the core scientific-diagram use case.

### P2: API.md refresh

Currently documents ~5 tools / ~8 files; codebase has 15 tools / ~85 files. Any new agent session starts with a severely incomplete picture.

### P3: Default style fill bleed (vectorfeld-ptz, P2)

Fill bleeds across drawings — direct UX friction.

### P4: Brush tool (#11)

Only useful unimplemented Phase 2 tool (Magic wand is low-priority given clean SVG element boundaries).

## Verdict

**PRD/code alignment is strong for what's implemented, but AGENTS.md overstates completeness.** All 22 MVP features present and working. ~35 of 43 Phase 2 items implemented; 8 quietly dropped without PRD annotation. The "100% Phase 2" claim applies to internal sprint scope only. The most urgent gap is environmental — `mupdf` and `paper` missing from `node_modules` silently disabling PDF import + path booleans and breaking 3 test files. This is a regression from the AGENTS.md claimed state.

## Quick Scorecard

| Metric | Count |
|--------|-------|
| PRD Phase 1 features | 22 |
| Phase 1 implemented | 22 (100%) |
| PRD Phase 2 features (named) | ~43 |
| Phase 2 implemented | ~35 |
| Phase 2 absent | ~8 (Brush, Magic wand, Multi-artboards, Image trace, Appearance panel, Blend, Constraints, NL) |
| Beyond-PRD additions | ~20 significant |
| API.md documented tools | 5 (stale) |
| Actual registered tools | 15 |
| Tests passing | 461 across 37 files |
| Test files failing to load | 3 (mupdf, paper not installed) |
| Open known bugs | 9 (in beads) |

**Top 3 highest-leverage gaps:**
1. `npm install` to restore `mupdf` + `paper`
2. Pen tool Bézier correctness (smooth curveto, asymmetric handles, multi-subpath)
3. API.md refresh
