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

**Current state (updated 2026-03-02, Phase 2 continued):**

### Summary

Phase 2 extended with 13 new features across 4 sprints (17-20). Total: 150/150 issues closed. 277 tests passing across 24 test files. Zero type errors.

### What was built this session (2026-03-02)

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

### Known limitations / future work

- `transformedAABB` only handles `rotate()` transforms (not `translate`/`scale`/`matrix`). Works for editor-generated content but may fail for imported SVGs with complex transforms.
- EditorContext.tsx is a 290-line god-file with all keyboard handlers. Should be extracted to keyboardCommands.ts.
- LayersPanel still polls on 500ms interval instead of pub-sub.
- Selection overlay rebuilds fully on every mousemove (could be incremental).
- No collaborative editing support (global mutable singletons).
- Text content not part of command data model (works via DOM node reuse but fragile).

### Dev environment

- **Dev server:** `npm run dev` → `http://localhost:5173`
- **Build:** `npm run build` (TypeScript + Vite)
- **Tests:** `npx vitest run` (277 tests)
- **Type check:** `npx tsc --noEmit`
- **Issue tracking:** `bd ready` / `bd stats` / `bd list`
- **playwright-cli:** `.claude/skills/playwright-cli` for e2e verification
- **API Reference:** `docs/API.md` — read before writing code
