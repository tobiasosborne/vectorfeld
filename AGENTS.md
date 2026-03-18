# Agent Instructions

**START HERE:** Read **[docs/API.md](docs/API.md)** before writing any code. It is the comprehensive agent-first API reference covering every function, class, component, keybinding, and testing pattern in the project.

This project uses **bd** (beads) for issue tracking. Run `bd onboard` to get started.

## Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work atomically
bd close <id>         # Complete work
bd sync               # Sync with git
```

## Non-Interactive Shell Commands

**ALWAYS use non-interactive flags** with file operations to avoid hanging on confirmation prompts.

Shell commands like `cp`, `mv`, and `rm` may be aliased to include `-i` (interactive) mode on some systems, causing the agent to hang indefinitely waiting for y/n input.

**Use these forms instead:**
```bash
# Force overwrite without prompting
cp -f source dest           # NOT: cp source dest
mv -f source dest           # NOT: mv source dest
rm -f file                  # NOT: rm file

# For recursive operations
rm -rf directory            # NOT: rm -r directory
cp -rf source dest          # NOT: cp -r source dest
```

**Other commands that may prompt:**
- `scp` - use `-o BatchMode=yes` for non-interactive
- `ssh` - use `-o BatchMode=yes` to fail instead of prompting
- `apt-get` - use `-y` flag
- `brew` - use `HOMEBREW_NO_AUTO_UPDATE=1` env var

<!-- BEGIN BEADS INTEGRATION -->
## Issue Tracking with bd (beads)

**IMPORTANT**: This project uses **bd (beads)** for ALL issue tracking. Do NOT use markdown TODOs, task lists, or other tracking methods.

### Why bd?

- Dependency-aware: Track blockers and relationships between issues
- Git-friendly: Auto-syncs to JSONL for version control
- Agent-optimized: JSON output, ready work detection, discovered-from links
- Prevents duplicate tracking systems and confusion

### Quick Start

**Check for ready work:**

```bash
bd ready --json
```

**Create new issues:**

```bash
bd create "Issue title" --description="Detailed context" -t bug|feature|task -p 0-4 --json
bd create "Issue title" --description="What this issue is about" -p 1 --deps discovered-from:bd-123 --json
```

**Claim and update:**

```bash
bd update <id> --claim --json
bd update bd-42 --priority 1 --json
```

**Complete work:**

```bash
bd close bd-42 --reason "Completed" --json
```

### Issue Types

- `bug` - Something broken
- `feature` - New functionality
- `task` - Work item (tests, docs, refactoring)
- `epic` - Large feature with subtasks
- `chore` - Maintenance (dependencies, tooling)

### Priorities

- `0` - Critical (security, data loss, broken builds)
- `1` - High (major features, important bugs)
- `2` - Medium (default, nice-to-have)
- `3` - Low (polish, optimization)
- `4` - Backlog (future ideas)

### Workflow for AI Agents

1. **Check ready work**: `bd ready` shows unblocked issues
2. **Claim your task atomically**: `bd update <id> --claim`
3. **Work on it**: Implement, test, document
4. **Discover new work?** Create linked issue:
   - `bd create "Found bug" --description="Details about what was found" -p 1 --deps discovered-from:<parent-id>`
5. **Complete**: `bd close <id> --reason "Done"`

### Auto-Sync

bd automatically syncs with git:

- Exports to `.beads/issues.jsonl` after changes (5s debounce)
- Imports from JSONL when newer (e.g., after `git pull`)
- No manual export/import needed!

### Important Rules

- ✅ Use bd for ALL task tracking
- ✅ Always use `--json` flag for programmatic use
- ✅ Link discovered work with `discovered-from` dependencies
- ✅ Check `bd ready` before asking "what should I work on?"
- ❌ Do NOT create markdown TODO lists
- ❌ Do NOT use external issue trackers
- ❌ Do NOT duplicate tracking systems

For more details, see README.md and docs/QUICKSTART.md.

<!-- END BEADS INTEGRATION -->

## Testing with playwright-cli

This project uses **playwright-cli** (installed as a Claude Code skill at `.claude/skills/playwright-cli`) for e2e and visual verification testing. Every feature that affects the canvas, tools, or UI must be verified via playwright-cli in addition to Vitest unit tests.

### Workflow

1. **Ensure the dev server is running**: `npm run dev` (serves at `http://localhost:5173`)
2. **Open the browser**: `playwright-cli open http://localhost:5173`
3. **Inspect the page**: `playwright-cli snapshot` (accessibility tree with refs)
4. **Take screenshots**: `playwright-cli screenshot` (saves PNG)
5. **Interact with elements**: `playwright-cli click <ref>`, `playwright-cli fill <ref> <text>`
6. **Run JS assertions**: `playwright-cli eval "document.querySelector('svg')?.getAttribute('viewBox')"`
7. **Mouse interactions**: `playwright-cli mousemove <x> <y>`, `playwright-cli mousewheel <dx> <dy>`
8. **Close when done**: `playwright-cli close`

### When to use playwright-cli

- After implementing any drawing tool — verify elements appear on canvas
- After implementing any UI component — verify layout and interaction
- After implementing zoom/pan — verify coordinate transforms work visually
- After implementing undo/redo — verify state reverts correctly in the browser
- For any bug that involves visual rendering or user interaction

### Testing strategy

- **Vitest**: Pure logic (coordinate math, command history, document model, tool registry)
- **playwright-cli**: Visual correctness, canvas interactions, tool workflows, end-to-end flows

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd sync
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds

## Project Handoff Context

**Current state (updated 2026-03-18):**

### Summary

MVP complete (22/22). **Phase 2 complete: 43/43 features (100%).** **472 tests** passing across **40 test files**. Zero type errors. SVG benchmark redraw protocol established.

### What was done this session (2026-03-18, session 2)

**SVG Benchmark Exact Recreation** — recreated 3 W3C reference SVGs from scratch using vectorfeld's drawing tools via playwright-cli. Exported results as SVG. Compared by **parsing SVG structure** (no PNG/vision). Results:

| Benchmark | Elements | Verdict | Details |
|-----------|----------|---------|---------|
| painting-stroke-01 | 2 rects | **PASS** (17/18) | 1 test-setup error (unscaled stroke-width) |
| shapes-rect-01 | 8 rects | **PASS** (72/72) | All fill/stroke/rx/ry/position checks pass |
| paths-data-01 | 8 bezier paths | **FAIL** (0/10) | Pen tool limitations — see below |

**Pen tool failures (paths-data-01):**
- Cannot produce `S`/`s` (smooth curveto) — only generates `C`
- Cannot create asymmetric bezier handles — click-drag creates symmetric handles (44mm error measured)
- Cannot create multi-subpath elements — each Enter creates a separate `<path>`
- Only emits absolute commands — never relative `c`/`s`/`m`

**8 bugs/features filed (3 new this session):**
- `vectorfeld-9hu` (P2 bug): Pen tool cannot produce S/s (smooth curveto) path commands
- `vectorfeld-t7u` (P2 bug): Pen tool cannot create asymmetric bezier control handles
- `vectorfeld-3t8` (P3 feature): Pen tool cannot create multi-subpath elements
- `vectorfeld-87e` (P4 chore): Pen tool only emits absolute path commands
- `vectorfeld-ptz` (P2 bug): Default style bleeds fill to subsequent drawings
- `vectorfeld-els` (P2 feature): No UI for rx/ry (rounded corners) on rect elements
- `vectorfeld-vj5` (P2 bug): Stroke ColorPicker has `allowNone={false}` — cannot set stroke=none via Properties panel
- `vectorfeld-eke` (P3 bug): Canvas SVG overflows flex container on viewport resize
- `vectorfeld-lb4` (P3 bug): Input focus traps keyboard tool shortcuts

**Benchmark infrastructure:**
- `test-benchmarks/*-VECTORFELD.svg` — vectorfeld recreations exported as SVG
- `test-benchmarks/svg-compare.py` — structural SVG comparison (element-by-element, no vision)
- `test-benchmarks/REPORT.md` — full benchmark report with pass/fail tables
- `test-benchmarks/benchmark-runner.js` — automated operation test script (previous session)

### What was done this session (2026-03-18, session 1)

**P1 Bug Fix (1):**
- **removeChild crash on undo** (`document.ts:70`, `commands.ts:86`): `AddElementCommand.undo()` crashed with `TypeError: Cannot read properties of null` when element's parent was already removed. Added null guards in `removeElement()` and `AddElementCommand.undo/execute`.

### What was done previous session (2026-03-17)

Fixed all 4 group transform bugs identified in handoff + review follow-ups:

**P1 Bug Fixes (4 — selectTool.ts group transform handling):**
- **Move**: Groups now compose `translate(dx,dy) * origTransform` via matrix (was replacing entire transform)
- **Scale**: Added `g` case to `scaleElement()` using `origTransform * scale_around(anchor)` matrix composition
- **Rotation center**: Local bbox center now transformed to doc space via element's transform matrix
- **Scale inverse**: Replaced regex-only `rotate()` inverse with `invertMatrix(parseTransform())` for any transform type

**P2 Bug Fix (1):**
- **`image` tag**: Added to `getAllGeomAttrs`, `getPositionAttrs`, `moveElement`, `scaleElement` (same model as rect)

**New in matrix.ts:**
- `invertMatrix()` — standard 2x3 affine inverse with singularity guard
- `matrixToString()` — serializes to SVG `matrix()` with `toFixed(6)` precision

**Tests:** 23 new tests (472 total): invertMatrix edge cases, matrixToString round-trip, scaleAroundMatrix, group move (4 tests), group transform math (3 tests)

**5-agent code review** (Torvalds, Knuth, Architecture, Test Coverage, Code Smells):
- All math rated CORRECT by Knuth (11/11 operations verified)
- Torvalds rates 3 GOOD + 1 OK (scale composition order intentionally different)
- Architecture confirmed `computeTranslateAttrs` works correctly with `matrix()` transforms
- Reports in `docs/reviews/`

**Review follow-up fixes:**
- Extracted `scaleAroundMatrix(sx, sy, cx, cy)` to matrix.ts (shared by selectTool + freeTransformTool)
- freeTransformTool: added group scale (matrix composition), path scale, rotation center fix (local→doc space), rotation matrix composition for groups
- selectTool: added fallback for non-standard transforms (imported SVGs with `matrix()` on primitives) in both move and rotation handlers — uses matrix conjugation/composition instead of silently dropping transforms
- Removed 3 thin wrapper functions in selectTool (hitTest, hitTestAll, transformedAABB → direct imports)

**Code quality fixes (from 5-agent review):**
- Extracted 5 named constants (MIN_BBOX_DIM, MIN_SCALE_SIZE, ROTATION_SNAP_DEG, MARQUEE_THRESHOLD, MOVE_DEAD_ZONE)
- Added `default` branch to `computeAnchor` switch
- Added `polygon`/`polyline` to `scaleElement` (same transform-based scaling as groups)
- Fixed target cast inconsistency: `instanceof Element` guard instead of contradictory `as Element` + `?.`

**Stress test + 3 code-analysis agents found 26 more bugs — all fixed:**

P0 Critical (2):
- Dead zone in scale/rotate leaves dirty DOM without undo — now restores all attributes on dead zone
- Paste/Duplicate loses all children of group elements — now clones child nodes

P1 High (7):
- `computeTranslateAttrs` breaks for groups with `matrix()` — now uses matrix composition
- `moveElement` conjugation math wrong — changed to simple `T(dx,dy) * M` pre-multiplication
- DirectSelect: relative path commands (lowercase m/l/c) silently dropped — case-insensitive checks
- DirectSelect: moving Bezier anchor doesn't move control handles — now offsets adjacent C1/C2
- freeTransformTool undo broken when transform newly added — removes attr before capturing oldValue
- Context menu z-order operations not undoable — now uses ReorderElementCommand
- Gradient color changes bypass undo history — now uses ModifyAttributeCommand

P2 Medium (12):
- ControlBar: getRotation returns 0 for `matrix()` — falls back to decomposeMatrix
- ControlBar: onRot destroys existing skew/scale — now preserves non-rotation components
- ControlBar: X/Y position wrong for groups — uses transformedAABB for doc-space coords
- ControlBar: X/Y input no-op for groups — added `g` branch using computeTranslateAttrs
- freeTransformTool: rotation clobbers existing rotation — adds baseAngle + delta
- freeTransformTool: group scale anchor wrong space — inverse-transforms to local space
- Ctrl+A Select All implemented — selects all visible unlocked layer children
- Pen tool Escape commits instead of canceling — now discards in-progress path
- DirectSelect no onDeactivate cleanup — clears anchor/handle visuals on switch
- Style controls cascade wrongly on groups — now applies to each child element
- parsePathD breaks scientific notation — lookbehind for e/E before minus
- Pen tool rubber-band freezes during Bezier drag — updates preview during handle drag

P3 Low (5):
- PropertiesPanel missing Position fields for path/group/image — shows AABB or attribute-based
- Menu items always enabled without selection — disabled field + grayed styling
- parsePathD no implicit repeat command — handles SVG spec repeat + M→L
- No validation on numeric inputs — parseFloat/NaN guard
- stroke-width blank without attribute — fallback to '1'

All 43 session issues closed. 0 open.

### What was done previous session (2026-03-05)

Fixed all 16 issues from chaos monkey testing + code analysis:

**P1 Bug Fixes (3):**
- CommandHistory capped at 200 entries (prevents unbounded memory)
- Eraser + DirectSelect + Eyedropper hit tests now transform-aware (shared `hitTestElement` in geometry.ts)
- Eraser undo now restores elements to their original parent/position (not active layer)

**P2 Bug Fixes (4):**
- Drawing tools (rect, ellipse, line, pen, pencil) check `data-locked` before creating elements
- PDF/SVG import inserts layers before overlay groups (correct z-order)
- FreeTransform rotate preserves base angle from existing rotation
- Knife tool multi-split processes segments in descending order (correct indices)

**P2 Performance (3):**
- Extracted shared `hitTestElement`/`hitTestAll` to geometry.ts (eliminated 4-way duplication)
- Selection overlay `refreshOverlay()` uses RAF coalescing (batch DOM rebuilds)
- Canvas mousemove tool dispatch RAF-throttled (at most once per frame)

**P3 Bug Fixes (2):**
- Pencil tool auto-switches to select after drawing
- TextPath startOffset uses command history (undoable)

**P3 Optimizations (3):**
- Smart guides pre-split candidates by axis (skip inner-loop filter)
- selectTool double-move: documented as inherent to smart guide snap (not a bug)
- PropertiesPanel caches `detectFillType` result (4 calls → 1)

**P4:**
- detectFillType caching (above)

### Known bugs

None. All 43 issues from this session are closed (4 initial transform bugs + 7 review follow-ups + 26 stress test bugs + 6 code quality).

### What was built this session (2026-03-04 session 2)

**Sprint I — Path Booleans & Compound Paths (4 issues):**
- Paper.js path booleans wrapper with lazy loading (`pathBooleans.ts`)
- Unite/Subtract/Intersect/Exclude/Divide in Object menu
- Compound path make/release (`compoundPath.ts`) with Object menu items
- Canvas-based rulers with adaptive ticks, cursor tracking (`Ruler.tsx`)

**Sprint L — Knife Tool & Shear/Skew (2 issues):**
- Knife tool (K): draw cut line to split paths at intersections (`knifeTool.ts`)
- Line-path intersection math: line-line (closed form) + line-cubic (recursive subdivision)
- Shear/skew transform: SkewX/SkewY in PropertiesPanel, parseSkew/setSkew in matrix.ts

**Sprint K — Text on Path (1 issue):**
- Text-on-path via SVG `<textPath>` (`textPath.ts`)
- Place/Release Text on Path in Object menu
- startOffset property in PropertiesPanel

**Sprint J — Test Coverage (3 issues):**
- smartGuides.test.ts (10 tests) + shapeToPath.test.ts (8 tests)
- fileio.test.ts (14 tests) + refactored fileio.ts (extracted parseSvgString/exportSvgString)
- matrix.test.ts additions (11 new tests for decompose/skew)

### What was built previous session (2026-03-03 → 2026-03-04 session 1)

**Sprint A — Critical Bug Fixes (5):**
- Eraser selection artifact: `removeFromSelection()` on erase (`eraserTool.ts`)
- Stale dragState: unconditional cleanup in onMouseUp/onDeactivate (`selectTool.ts`)
- Rotation center: uses local `getBBox()` center, not AABB (`selectTool.ts`)
- Resize after rotation: local-space anchor + inverse-rotate mouse point (`selectTool.ts`)
- Path scaling: new `scalePathD()` in pathOps.ts, path case in selectTool

**Sprint B — UI Layout (4):**
- Selection handles 8→10px (`selection.ts`)
- Auto-select after drawing: all tools switch to select mode
- Layers panel moved to bottom-right under Properties (`App.tsx`)
- Fill/stroke widget at toolbar bottom (`FillStrokeWidget.tsx`)

**Sprint C — UX Polish (4):**
- Custom SVG rotation cursors on corner hover zones (`selection.ts`)
- Redesigned all 12 tool icons, 20x20 viewBox (`icons.tsx`)
- Eyedropper hidden from toolbar (shortcut I still works)
- Position/transform control bar below menu (X, Y, W, H, R) (`ControlBar.tsx`)

**Sprint D-G — New Features (7):**
- Alt center-draw rect, Ctrl corner-draw ellipse (`rectTool.ts`, `ellipseTool.ts`)
- More dash patterns: 8 presets + custom input + SVG preview (`PropertiesPanel.tsx`)
- Line endpoint snapping with magenta indicator (`smartGuides.ts`, `lineTool.ts`)
- Alt+click cycle through stacked selection (`selectTool.ts`)
- Shape-to-path conversion: direct-select auto-converts, Object > Convert to Path (`shapeToPath.ts`, `directSelectTool.ts`)
- Path joining: Object > Join Paths with auto-orient (`pathOps.ts`)
- Right-click context menu: Delete, Bring to Front/Back, Flip H/V (`ContextMenu.tsx`)

**Sprint H — Tech Debt (4):**
- Full SVG transform model: `matrix.ts` handles translate/scale/rotate/skew/matrix (was rotate-only)
- EditorContext refactored: 293→148 lines. Extracted `clipboard.ts`, `nudge.ts`, `zOrder.ts`
- Layers panel: replaced 500ms polling with `history.subscribe` + `subscribeSelection`
- Overlay debounce: documented approach, deferred (not a current bottleneck)

**Infrastructure:**
- Playwright-cli installed (`@playwright/cli` v1.59.0, chromium v1212)
- Dolt installed (v1.83.1) for beads issue tracking
- bd updated to v0.58.0
- 20-phase chaos monkey: zero console errors, app survived all phases

### What was built previously (2026-03-02)

**Sprint 17 — Transform & View (4 features):**
- Reflect/Mirror: Flip H/V via Object menu (`src/model/reflect.ts`)
- Outline/Wireframe View: Toggle via View menu, injects CSS style (`src/model/wireframe.ts`)
- Placement Guides: H/V guide lines with smart guide snap integration (`src/model/guides.ts`)
- Guide rendering in Canvas.tsx overlay group, cyan dashed lines

**Sprint 18 — New Tools (3 features):**
- Pencil Tool (N): Freehand drawing with Ramer-Douglas-Peucker simplification (`src/tools/pencilTool.ts`, `src/model/pathSimplify.ts`)
- Measure Tool (M): Click-drag shows distance in mm as transient overlay (`src/tools/measureTool.ts`)
- Scissors Tool (C): Click on path to split into two paths with De Casteljau subdivision (`src/tools/scissorsTool.ts`, `src/model/pathOps.ts`)

**Sprint 19 — Export & Import (3 features):**
- PNG Export: SVG-to-canvas rendering at 96 DPI (`fileio.ts:exportPng`)
- Raster Image Embedding: Place PNG/JPG via file picker as `<image>` elements (`fileio.ts:placeImage`)
- TikZ Export: SVG-to-TikZ conversion with y-axis inversion, color mapping, path/Bezier support (`src/model/tikzExport.ts`)

**Sprint 20 — Advanced (3 features):**
- Color Swatches: Named color palette with localStorage persistence (`src/model/swatches.ts`, `src/components/SwatchPanel.tsx`)
- Clipping Masks: Object > Make/Release Clipping Mask with SVG `<clipPath>` (`src/model/clipping.ts`)
- Area Text: Word wrapping via `<tspan>` elements (`src/model/areaText.ts`)

**Infrastructure:**
- `image` tag support in geometry.ts, EditorContext.tsx (nudge/paste), and selectTool
- Export functions strip wireframe style and user-guides overlay
- Smart guides now include user placement guides as snap candidates

### What was built previously (2026-03-01 session)

**Sprint 12 — MVP Completion (6 issues):**
- Marquee selection (rubber-band drag on empty canvas)
- Layer reordering (up/down buttons, undoable)
- Arrange commands (Ctrl+]/[, Ctrl+Shift+]/[ for z-order)
- Default style module (last-used stroke/fill/strokeWidth inherited by new elements)
- Line tool shift-snap (45-degree angle constraint)
- Oriented bounding box (scale handles follow element rotation)

**Sprint 13 — Align, Distribute & Grid (5 issues):**
- Align commands (6 operations: left/center-h/right/top/center-v/bottom)
- Distribute commands (horizontal/vertical for 3+ elements)
- Grid display overlay (10mm major, 5mm minor, Ctrl+' toggle)
- Snap-to-grid (all tools snap when enabled, Ctrl+Shift+' toggle)
- Smart guides (magenta alignment lines during drag, 2px tolerance)

**Sprint 14 — Stroke Styles & Arrows (6 issues):**
- SVG `<defs>` infrastructure (auto-created, preserved in export/import)
- Arrow marker definitions (triangle, open, reverse, circle in `<defs>`)
- Arrow marker UI (start/end dropdowns for line/path)
- Stroke dash patterns (solid, dashed, dotted, dash-dot)
- Stroke caps (butt/round/square) and joins (miter/round/bevel)
- Opacity control (0-1)

**Sprint 15 — PDF Export & Gradients (5 issues):**
- PDF export (jsPDF + svg2pdf.js, toolbar button)
- Linear gradient fill (with color pickers, fill-type selector)
- Radial gradient fill (shares gradient infrastructure)
- Eyedropper tool (sample colors into default style, shortcut: I)

**Sprint 16 — UI Overhaul (5 issues):**
- Vertical tool strip (40px left sidebar with SVG icons)
- Menu bar (File/Edit/View dropdowns with shortcuts)
- Collapsible panels (Layers & Properties collapse to thin strips)
- Tool icons (SVG silhouettes for all 12 tools)

### Code review & bug fixes

7-agent code review (test coverage, code smells, line-by-line, architecture, Knuth, Torvalds, Carmack) found 37 issues. All fixed:

**Showstoppers fixed:**
- Group/Ungroup now fully undoable (GroupCommand/UngroupCommand)
- Scale division-by-zero guard for zero-dimension bboxes

**Critical bugs fixed:**
- Nudge + paste update rotation centers in transforms
- Ctrl+Shift+' keybinding (Shift produces `"` not `'`)
- ID counter syncs past imported IDs (syncIdCounter)
- Gradient colors update stops in-place (no orphan defs leak)
- Layer operations use command history (undoable add/delete/reorder)
- Aspect-ratio lock uses CompoundCommand (single undo entry)
- Eyedropper hit test uses transformedAABB for rotated elements
- Path/group elements movable via translate transform
- Scale mode populates origTransforms for proper commit
- Gradient fills disabled for line elements (zero-dim bbox)
- clearSelection() before import (prevents stale DOM refs)
- Active layer model (new activeLayer.ts pub-sub module)
- Tool deactivation hooks (cleanup on switch: caret, preview, marquee)
- PropertyInput commits on blur/Enter (not per-keystroke)
- Grid isMajor uses iteration count (not float modulo)
- Grid line count capped at 500
- Circle scaling from edge handles now shrinks correctly
- Rotation center preserves existing center from transform
- importSvg handles cancel and file errors
- Pan rate fix: uses getScreenCTM() for accurate scale with preserveAspectRatio
- Pan stale-closure fix: isPanningRef prevents event handler gaps

**Architecture improvements:**
- Shared `geometry.ts` (deduplicated transformedAABB from 4 files + computeTranslateAttrs)
- Deleted dead Toolbar.tsx
- Smart guides cache candidates at drag-start (O(1) per frame)

### Playwright testing

- Feature tests: draw rect/line/ellipse, select, undo, marquee, delete, pan — all PASS
- Chaos monkey (200+ random actions): 8 phases all PASS, zero errors, app survived
- 2026-03-04 session 4: Full chaos monkey (6 phases: draw shapes, selection ops, rapid tool switching + zoom, menu operations, grid/wireframe toggle, console error check) — zero errors, app survived all phases with 5 objects rendered correctly, rulers/grid/all 16 tool icons working
- Pan rate verified at 0.0% error after fix
- 2026-03-02: Pencil tool draws freehand path, Measure tool shows distance (160.3 mm), Wireframe mode injects style, all 12 tool icons visible, File/View/Object menus verified with all new items

### Numbers

- **Total issues:** 150 (100 Phase 2 features + 37 code review findings + 13 new Phase 2 features)
- **Issues closed:** 150/150 (100%)
- **Test count:** 277 (24 test files)
- **Type errors:** 0

### Key files added/modified

| File | Purpose |
|------|---------|
| `src/model/defaultStyle.ts` | Last-used style pub-sub |
| `src/model/align.ts` | Align/distribute pure functions |
| `src/model/grid.ts` | Grid display + snap-to-grid |
| `src/model/smartGuides.ts` | Smart alignment guides during drag |
| `src/model/markers.ts` | Arrow marker definitions |
| `src/model/gradients.ts` | Gradient fill management |
| `src/model/geometry.ts` | Shared transformedAABB + computeTranslateAttrs |
| `src/model/activeLayer.ts` | Active layer pub-sub |
| `src/model/reflect.ts` | Flip H/V pure functions |
| `src/model/wireframe.ts` | Outline/wireframe view toggle |
| `src/model/guides.ts` | User placement guides |
| `src/model/pathSimplify.ts` | Ramer-Douglas-Peucker path simplification |
| `src/model/pathOps.ts` | Path parsing, splitting, De Casteljau |
| `src/model/tikzExport.ts` | SVG-to-TikZ conversion |
| `src/model/swatches.ts` | Named color palette with persistence |
| `src/model/clipping.ts` | Clipping mask make/release commands |
| `src/model/areaText.ts` | Word wrapping for area text |
| `src/tools/pencilTool.ts` | Freehand drawing tool |
| `src/tools/measureTool.ts` | Distance measurement tool |
| `src/tools/scissorsTool.ts` | Path splitting tool |
| `src/components/SwatchPanel.tsx` | Swatch grid UI |
| `src/tools/eyedropperTool.ts` | Eyedropper tool |
| `src/components/ToolStrip.tsx` | Vertical tool sidebar |
| `src/components/MenuBar.tsx` | Dropdown menu bar |
| `src/components/icons.tsx` | SVG tool icons |

### Numbers

- **Phase 1 (MVP):** 22/22 features (100%)
- **Phase 2:** 43/43 features (100%)
- **Test count:** 449 (40 test files)
- **Type errors:** 0
- **LOC:** ~24,500 across ~85 source files
- **Beads issues:** 0 open, 16/16 closed (this batch)

### Known limitations / future work

- ~~`transformedAABB` only handles `rotate()` transforms~~ **FIXED** — now uses full affine matrix via `matrix.ts`
- ~~EditorContext.tsx is a god-file~~ **FIXED** — refactored to 148 lines, extracted clipboard/nudge/zOrder
- ~~LayersPanel polls on 500ms interval~~ **FIXED** — now pub-sub via history.subscribe
- Selection overlay rebuilds fully on every call (could add RAF debounce when profiling shows need)
- No collaborative editing support (global mutable singletons)
- Text content not part of command data model (works via DOM node reuse but fragile)
- Tauri shell scaffolded but unused — app runs as pure web app

### Remaining roadmap (filed as beads issues)

| Sprint | Features | Key Items |
|--------|----------|-----------|
| ~~**I**~~ | ~~3~~ | ~~Path booleans, compound paths, rulers~~ **DONE** |
| ~~**J**~~ | ~~4 (tests)~~ | ~~smartGuides, shapeToPath, fileio, matrix, selectTool, PropertiesPanel~~ **DONE** |
| ~~**K**~~ | ~~3~~ | ~~Text-on-path, offset path, PDF import~~ **DONE** |
| ~~**L**~~ | ~~3~~ | ~~Knife, skew, free transform~~ **DONE** |
| ~~**M**~~ | ~~3~~ | ~~Lasso, opacity masks, multiple artboards~~ **DONE** |

Full plan: `.claude/plans/misty-hugging-valiant.md`

### Key files added/modified this session

| File | Purpose |
|------|---------|
| `src/model/pathBooleans.ts` | Paper.js path boolean ops (lazy-loaded) |
| `src/model/compoundPath.ts` | Compound path make/release |
| `src/model/textPath.ts` | Text-on-path via SVG textPath |
| `src/model/offsetPath.ts` | Path offset: sample → normals → fit cubics |
| `src/model/opacityMask.ts` | SVG opacity masks (make/release) |
| `src/model/pathOps.ts` | Added intersectLineWithPath, splitPathAtT |
| `src/model/matrix.ts` | Added decomposeMatrix, parseSkew, setSkew |
| `src/model/fileio.ts` | Refactored: extracted parseSvgString/exportSvgString |
| `src/tools/knifeTool.ts` | Knife tool (K) — cut line splits paths |
| `src/tools/lassoTool.ts` | Lasso selection (J) — freeform polygon PiP |
| `src/tools/freeTransformTool.ts` | Free transform (Q) — scale/rotate/skew in one |
| `src/components/Ruler.tsx` | Canvas-based rulers with adaptive ticks |
| `src/components/icons.tsx` | Added knife, lasso, free-transform icons (16 total) |
| `src/components/PropertiesPanel.tsx` | Added SkewX/SkewY + textPath startOffset |

### Dev environment

- **Dev server:** `npm run dev` → `http://localhost:5173`
- **Build:** `npm run build` (TypeScript + Vite)
- **Tests:** `npx vitest run` (298 tests, 25 files)
- **Type check:** `npx tsc --noEmit`
- **Issue tracking:** `/home/tobias/.local/bin/bd ready` / `bd status` / `bd list` (Dolt server on port 3307)
- **Playwright-cli:** `playwright-cli open http://localhost:5173` for e2e verification
- **Chaos monkey:** `bash /tmp/chaos-monkey.sh` (20-phase stress test)
- **API Reference:** `docs/API.md` — read before writing code
- **Roadmap:** `.claude/plans/misty-hugging-valiant.md`
