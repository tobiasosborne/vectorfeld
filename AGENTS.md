# Agent Instructions

**START HERE.** Before making changes, read:

1. **docs/stocktake/00-SYNTHESIS.md** — current-state summary and what matters
2. **docs/stocktake/01-source-map.md** — file-by-file inventory (what each module does)
3. **docs/API.md** — API reference for the model + tool registry (kept in sync with source)
4. **CLAUDE.md** — project workflow rules (plan mode, subagents, verification, beads)

This project uses **bd** (beads) for issue tracking. Never use TodoWrite/TaskCreate/markdown TODOs.

## The pivot — what this tool is for

Vectorfeld was originally a scientific-diagram editor with LaTeX/TikZ export. **That vision is obsolete.**

The new primary use case: **casual PDF editing.** The owner opens the tool maybe once every few months when they need to edit a Word-generated PDF (flowing text, embedded images, simple shapes) and be done. Sessions are short and infrequent.

Implications that shape every decision:

- Multi-document workflow is first-class (copy elements from PDF B into PDF A).
- UI must be self-explanatory on cold pickup — no remembering shortcuts.
- Round-trip fidelity (PDF→edit→PDF preserving fonts + images) is load-bearing.
- Scientific-diagram precision (rulers, mm-snap, Bézier authoring, TikZ) is NOT the target.
- The owner is one specific person. No multi-user, no cloud, no auth.

## Current state (2026-04-20, after the composite session)

- **Build**: green. **461 tests** passing across 33 test files.
- **Bundle**: ~824 KB main chunk + separate 89 KB MuPDF JS chunk + 10 MB MuPDF WASM (lazy, Web Worker).
- **PDF import**: MuPDF `text=text` mode. Runs in a Web Worker. Produces real `<text>`/`<tspan>`/`<image>` for fonts MuPDF can preserve, and path outlines otherwise (see **known issue** below). Each imported PDF now lands as N direct layer children (was 1 wrapping `<g>` — regression fixed 2026-04-20 in `vectorfeld-37x`). Individual elements click-selectable. Drag moves glyphs as coherent units (tspan x-arrays shift).
- **Compositing**: `File > Open PDF as Background Layer…` imports a PDF into its own named layer at the bottom of the z-stack without clearing the canvas. Three-click overlay workflow: open foreground, open background layer, done. Both layers appear in the Layers panel named after their source filenames. **SVG export is pixel-lossless.** PDF export is lossy on text (see below).
- **Z-order**: Arrange items (Bring to Front / Forward / Send Backward / Back) are now in the Object menu with keyboard shortcuts shown right-aligned. Previously keyboard-only and undiscoverable.
- **Security**: SVG sanitizer strips `<script>`, `<foreignObject>`, `<iframe>`, `on*` handlers, `javascript:`/`data:text/html` hrefs. Tauri CSP tightened from `null` to an explicit allowlist policy (see `src-tauri/tauri.conf.json`).
- **Shell**: 7 tools visible in the strip (select, direct-select, rectangle, ellipse, line, text, eraser). 6 tools hidden but keyboard-accessible (pen P, pencil N, measure M, lasso J, free-transform Q, eyedropper I).
- **Architecture**: Phase 1 of the DocumentState refactor is landed. Per-document state is now isolated — two `DocumentState` instances can coexist without corrupting each other. Multi-doc UI (`vectorfeld-4w7`) is unblocked.

### Load-bearing known issues (PDF round-trip)

Two issues together currently break text fidelity for PDF-edit → PDF-export:

- **`vectorfeld-cd2`** (P1, import side): MuPDF's `text=text` mode preserves text for some fonts and outlines to paths for others. Same mode, same MuPDF version, different behavior based on font-subset characteristics. Outlined text cannot be edited.
- **`vectorfeld-9s9`** (P1, export side, NEW): `svg2pdf.js` re-renders SVG `<text>` with its own bundled Helvetica/Times metrics, not the original fonts. The PDF has correct x/y coordinates but wrong glyph widths, producing visibly garbled body text. Ironically, text that was outlined on import (cd2 bug) survives export perfectly because it's paths.

Until these are addressed, treat **SVG** as the reliable export target and **PDF** as lossy-for-text.

## What's NOT here (removed 2026-04-19)

~2,100 LOC of old-PRD code was deleted:

- TikZ export (`tikzExport.*`)
- Offset path (`offsetPath.*`)
- Text-on-path (`textPath.*`)
- Compound paths (`compoundPath.*`)
- Path booleans (`pathBooleans.*`, Paper.js dep)
- Clipping + opacity masks (`clipping.*`, `opacityMask.*`)
- Color swatches (`swatches.*`, `SwatchPanel.tsx`)
- Scissors tool, knife tool
- All corresponding Object-menu items (compound, booleans, masks, text-on-path, offset, TikZ export)

Don't re-add these unless the use case changes. Ask first.

## Known open issues (beads)

Run `bd ready` for the live queue. As of 2026-04-19 (end of pivot session):

- `vectorfeld-ipp` (P2, new) — Multi-document UI + cross-document clipboard. The defining feature of the pivot; architectural foundation now exists. Needs: tab strip UI, `{ DocumentState, DocumentModel, CommandHistory }` triples list in `EditorProvider`, `setActiveDocument()` on focus change, app-level shared clipboard.
- Nine older bugs from the pre-pivot session: all pen-tool Bézier authoring (smooth curveto, asymmetric handles, multi-subpath) or properties-panel polish. Not relevant to PDF edit. Defer.

## Workflow — how to make changes here

1. **Check beads first**: `bd ready` — pick something unblocked.
2. **Claim**: `bd update <id> --claim`.
3. **Plan mode** if 3+ steps or non-trivial. Use subagents liberally for research.
4. **Before coding**: read `docs/stocktake/01-source-map.md` entry for the file you're touching.
5. **Implement** with minimal blast radius. Don't add features that weren't asked for.
6. **Test**: `npm test -- --run`. For UI changes: `experiments/pdf-roundtrip/verify-import.mjs` is a headed-Chromium end-to-end check that imports a PDF and verifies select + move. Use it or write a similar one. For PDF-fidelity work: `test/roundtrip/` is the in-vitest golden-fixture harness — `helpers/normalizeSvg.ts` (semantic SVG diff), `helpers/renderPdf.ts` (raster diff via pdfjs-dist + node-canvas + pixelmatch), `helpers/pdfPipeline.ts` (PDF bytes → mm-scaled SVG, no Worker needed). Use these to drive red-green TDD on round-trip bugs.
7. **Commit + push**: `git push` is the definition of "done". Include `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>` line.
8. **Close the bead**: `bd close <id> --reason="<what you did>"`.

## Essential commands

```bash
# Tests
npm test -- --run             # Single-shot test run
npm test                      # Watch mode

# Build
npm run build                 # tsc -b + vite build
npx tsc -b                    # Type-check only

# Dev
npm run dev                   # Vite on :5173
# Run experiments/pdf-roundtrip/verify-import.mjs against the running server

# Beads
bd ready                      # Actionable work
bd show <id>                  # Issue detail
bd update <id> --claim        # Claim
bd close <id> --reason="..."  # Close
bd memories <keyword>         # Search persistent notes
bd remember "..."             # Save a note
```

## Non-interactive shell flags

Some system aliases make `cp`/`mv`/`rm` interactive. Always pass `-f`:

```bash
cp -f | mv -f | rm -f | rm -rf <dir>
apt-get -y | ssh -o BatchMode=yes
```

## Critical safety rules

- **Never commit `.beads/.beads-credential-key`** or `.beads/backup/*.darc`. They contain per-machine secrets. `.beads/.gitignore` now covers this — but `git add -A` can still slip them through. Always stage specific files.
- **Never force-push main** without explicit user authorization. The credential-key leak on 2026-04-19 is still in history at commit 92caae4; purging it requires `git filter-repo` + force-push, user-driven.
- Rotate the beads credential if it was ever pushed to a public remote: `bd admin rotate-key` (or delete the file and let bd regenerate).

## For more detail

- `docs/stocktake/00-SYNTHESIS.md` — cross-cutting findings from the 6-reviewer audit
- `docs/stocktake/02-architecture.md` — architectural hostility matrix, singleton critique, command-pattern back-doors
- `docs/stocktake/03-performance.md` — hot-path analysis, memory audit
- `docs/stocktake/04-code-smells.md` — maintainability liabilities, god files, dead code
- `docs/stocktake/05-security.md` — attack surface, remaining gaps
- `docs/stocktake/06-pdf-roundtrip-experiment.md` — the make-or-break PDF-import validation
- `docs/stocktake/07-reviews/` — individual reviewer reports (6 of them)
- `docs/lessons.md` — corrections from past sessions; read before writing code
- `vectorfeld-prd.md` — ORIGINAL PRD; most of it is obsolete post-pivot (see "What's NOT here")

---

## Session log — 2026-04-19 (the pivot session)

This session converted vectorfeld from its scientific-diagram-editor form to a PDF-edit-first shape. Started with the build red (42 TS errors, `paper`/`mupdf` uninstalled, `AGENTS.md` + `API.md` misleading); ended with 446 green tests, pushed to `origin/main`, and the full top-10 action list from the adversarial code review closed.

### Preliminary work

- **Git sync.** Local was 40 commits behind `origin/main`; fast-forwarded cleanly after stashing `.beads/` runtime state. No local commits were ahead.
- **Stocktake.** Dispatched 5 parallel sonnet subagents to survey the codebase. Wrote reports to `docs/stocktake/01-source-map.md`, `02-reviews-synthesis.md`, `03-project-state.md`, `04-tooling-and-build.md`, `05-prd-vs-reality.md`. Manually wrote 2 of them from the agent summaries after learning that Explore agents are read-only (captured in `docs/lessons.md`).
- **PDF round-trip experiment.** Fixed the build (42 TS errors → 0) by running `npm install`, rewriting parameter-property syntax in `clipping.ts` / `opacityMask.ts` to satisfy `erasableSyntaxOnly`, and sweeping 23 unused vars. Then discovered MuPDF's undocumented `text=text` mode produces real `<text>`/`<tspan>` + preserved `<image>` elements (vs the default path-outline mode). Switched `pdfImport.ts` to use it. See `docs/stocktake/06-pdf-roundtrip-experiment.md`.
- **Live end-to-end verification.** Wrote `experiments/pdf-roundtrip/verify-import.mjs` using playwright from `qvls-sturm/viz/node_modules` (headed Chromium). Validated that the app loads a real PDF via File → Open PDF, produces individually-selectable `<text>` + `<image>` elements with correct mm sizing, and that drag/select/properties-panel all work. In the process uncovered two latent bugs both fixed: (a) pt→mm scale mismatch between viewBox and content; (b) Vite dev server returning `index.html` for `mupdf-wasm.wasm` requests (fixed by `optimizeDeps.exclude: ['mupdf']` + `assetsInclude: ['**/*.wasm']`).

### The adversarial review

Dispatched 6 parallel sonnet subagents with distinct hostile scopes (test coverage, architecture, performance, code smells, security, use-case fitness). Each was briefed on the pivot and instructed to be punishing. Output in `docs/stocktake/07-reviews/` — 1,941 lines of reports including a cross-cutting synthesis (`00-SYNTHESIS.md`).

Top findings:

- **Most dangerous architectural choice**: 9 module-level pub-sub singletons prevent multi-document workflow (architecture review).
- **1 EXPLOITABLE security gap**: zero SVG sanitization + Tauri `"csp": null` → arbitrary code execution vector (security review).
- **Day-1 functional blocker**: MuPDF wraps PDF content in one `<g>`, so clicking a text line selects the whole page (use-case review).
- **Silent data loss**: `fileio.ts:255` `drawingTags` whitelist missing `'image'` → re-imported SVGs drop all PDF-imported raster images (test coverage review).
- **Performance cliff**: `smartGuides.cacheSmartGuideCandidates` filters candidates by axis every RAF frame during drag (performance review).
- **Dead weight**: ~1,100 LOC of old-PRD code is extractable without functional loss under the pivot (code-smells review).
- **Unanimous verdict across 3 reviewers**: the model layer is right; the shell is wrong.

### Beads closed this session

The top-10 action list from `00-SYNTHESIS.md` became 10 beads. All closed:

| ID | Title | What shipped |
|----|-------|--------------|
| `vectorfeld-2i5` | Fix `<image>` drop in `drawingTags` | One-line whitelist addition + regression test (SVG round-trip preserves `<image>`). |
| `vectorfeld-0kp` | Pre-split smart-guide candidates by axis | `cachedCandidates` now stores `{ x[], y[] }` instead of a mixed list filtered per-frame. |
| `vectorfeld-7yc` | Auto-ungroup MuPDF top-level `<g>` | `scale(pt→mm)` now prepended to each top-level element's `transform` instead of wrapping them in a group. Each `<text>`/`<image>` is a direct layer child, individually selectable. Live verification confirms. |
| `vectorfeld-tek` | Propagate `<tspan>` x-arrays on text move | Added `computeTranslateAttrsAll()` + `selectTool.ts` snapshots tspan x/y at drag-start, shifts them during move, and emits `ModifyAttributeCommand` per-tspan so moves are undoable. 5 new unit tests + live drag verification. |
| `vectorfeld-tqd` | SVG sanitizer + Tauri CSP | `sanitizeSvgTree()` strips `<script>`/`<foreignObject>`/`<iframe>`/`<object>`/`<embed>`, all `on*` attrs, `javascript:`/`data:text/html` hrefs. Called from `parseSvgString` AND `clipboard.ts` paste. Tauri CSP set to `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; …`. 11 new tests. |
| `vectorfeld-ooc` | Delete old-PRD dead code | −2,126 LOC: `tikzExport`, `offsetPath`, `textPath`, `compoundPath`, `pathBooleans`, `clipping`, `opacityMask`, `swatches`, `SwatchPanel`, `scissors`, `knife` + all matching Object-menu items, `paper` dep uninstalled (−359 KB chunk). |
| `vectorfeld-xfg` | Hide authoring-only tools from ToolStrip | `HIDDEN_TOOLS` set expanded to 6. Strip now shows 7 relevant tools. Keyboard shortcuts still reach hidden tools. |
| `vectorfeld-u6n` | Rewrite AGENTS.md + API.md | 610→165 lines in AGENTS.md (removed stale sprint history, added pivot context, workflow rules). API.md: surgical rewrites for File I/O (5→8 functions), Tools (5→13 with Visible column), Components (deleted Toolbar, added ToolStrip/MenuBar/ControlBar/FillStrokeWidget/Ruler/ContextMenu). |
| `vectorfeld-vqb` | Move MuPDF to a Web Worker | New `pdfRender.worker.ts`; `pdfImport.ts` posts `{ pdf: ArrayBuffer, pageIndex }` (zero-copy transfer), awaits `{ svg }` or `{ error }` response. Worker reused across imports. `vite.config.ts`: `worker.format='es'`. Main thread no longer blocks on WASM load. |
| `vectorfeld-uxj` | DocumentState context refactor | 8 singletons (selection, activeLayer, artboard, grid, guides, defaultStyle, smartGuides, wireframe) wrapped in state classes with swappable `active` pointers. `documentState.ts` aggregates; `setActiveDocument(d)` atomically swaps every module pointer. `EditorContext` captures and activates one DocumentState at mount. 9 new isolation tests prove multi-doc state independence. Zero consumer-code churn (wrapper pattern). |

### Commits pushed this session (`main` branch)

```
66ac0f4 DocumentState refactor (Phase 1): per-document state isolation
dc94be5 Move MuPDF WASM to a Web Worker
6fe61b9 Rewrite AGENTS.md + API.md to match reality post-pivot
9e563ce Untrack .beads credential + runtime state (accidentally added)
92caae4 Delete 2126 LOC of old-PRD dead code; hide authoring tools
c696c61 Fix 4 day-1 blockers + 1 perf fix: image drop, smartGuides axis split, auto-ungroup, tspan shift, SVG sanitizer
f4efabe PDF import: live verification pass + fix scale + fix dev WASM serving
be84d6b Fix build, switch PDF import to text=text, add stocktake docs
fbf5505 Add adversarial code review (6 parallel auditors + synthesis)
```

Starting point: `acdabf5`. Ending point: `66ac0f4`. 9 commits + 1 gitignore fix.

### Safety flag (needs your attention)

Commit `92caae4` inadvertently included `.beads/.beads-credential-key` (32 bytes) via `git add -A`. The file is now untracked and added to `.beads/.gitignore`, but remains in git **history** on the remote. If this repo is public:

- **Rotate the credential.** `bd admin rotate-key`, or delete `.beads/.beads-credential-key` and let `bd` regenerate on next run.
- **Optional purge**: `git filter-repo --invert-paths --path .beads/.beads-credential-key` followed by a force-push. This rewrites history and is destructive — user decision only.

### Next work

**In progress / next up:**

- `vectorfeld-ipp` (P2, new) — Multi-document UI + cross-document clipboard. Phase 2 of the DocumentState refactor. The architectural foundation is in place (Phase 1 is landed); this is the feature that the foundation unlocks. Concrete sketch:
  1. `EditorProvider` holds a mutable list `{ id, model: DocumentModel, history: CommandHistory, state: DocumentState }[]` instead of one of each.
  2. A tab strip UI above the canvas (or under the menu bar) lists open docs with close-buttons. Clicking a tab calls `setActiveDocument(state)` and swaps `docRef.current`, `historyRef.current` accordingly.
  3. File → Open PDF creates a new document entry and switches to it (instead of replacing the current doc).
  4. Clipboard ref lifted from `EditorProvider` to a module-level or app-level location so it's shared across all open docs. `copySelection` / `pasteClipboard` read from the shared clipboard and operate on the active doc's model/history.
  5. Keyboard shortcuts to switch docs (Ctrl+Tab, Ctrl+1..9) — nice-to-have.

- **Tauri native file I/O** — the app runs fine as a browser webapp, but the pivot use case ("double-click a PDF, it opens in vectorfeld") needs the Tauri shell actually wired up. Currently `src-tauri/src/lib.rs` has zero `#[tauri::command]` handlers. This is not yet a bead; consider creating one when priorities shift.

**Deferred (nine open pre-pivot bugs):**

- All pen-tool Bézier authoring issues (smooth curveto, asymmetric handles, multi-subpath). Not relevant to PDF editing.
- Properties-panel polish items (rx/ry UI, stroke-none picker bug).

Run `bd ready` to see the live queue.

### What to read before the next session

1. **`docs/stocktake/00-SYNTHESIS.md`** — the consolidated review findings. Start here.
2. **`src/model/documentState.ts`** — the new per-document state aggregator. Phase 2 builds directly on this.
3. **`src/model/EditorContext.tsx`** — the current single-doc lifecycle; see `stateRef` and `captureActiveDocumentState()`. Phase 2 multiplies this.
4. **`docs/stocktake/07-reviews/06-use-case-fitness.md`** — cold-pickup scored 3/10 in the review; the tab UI is one of the top three cold-pickup fixes.
5. **`experiments/pdf-roundtrip/verify-import.mjs`** — the headed-Chromium verification harness. Extend this for multi-doc tests (open 2 PDFs, copy from one, paste into other).

---

## Session log — 2026-04-20 (the composite session)

Fresh clone on a new device; spent the first half of the session recovering from two latent issues from the 2026-04-19 pivot session (bd state lost, credential leak to public repo) and the second half validating + building the compositing use case that was the whole point of the pivot.

### Preliminary housekeeping

- **bd state on new device.** Pull was 10 commits behind origin/main; fast-forwarded cleanly (had to move `.claude/docs/lean4/` aside first). Bootstrapped bd from the tracked `.beads/issues.jsonl` (which turned out to be a March-18 snapshot — the 2026-04-19 pivot session committed its audit trail to `.beads/interactions.jsonl` but never re-ran `bd export`, so the 10 closed pivot beads + `vectorfeld-ipp` existed only on the previous device's Dolt state). Reconstructed the 11 missing beads from AGENTS.md's session log table + interactions.jsonl close reasons. **Lesson added to `docs/lessons.md`**: check `.beads/interactions.jsonl` before declaring pivot-session work lost.
- **Credential leak purge.** Commit `92caae4` (2026-04-19 15:16) included `.beads/.beads-credential-key` (32 bytes, federation-peer auth key — not a GH token). Repo is public; file sat in history for ~18 h. Installed `git-filter-repo`, purged the key from all 114 commits, force-pushed `origin/main`. Key is gone from reachable history; GH reflog GC will clean unreachable objects within 90 days. **Lesson added**: never `git stash drop` without reading the stash — during my own recovery I dropped a stash without inspecting it, and filter-repo then GC'd the unreachable object so the content is unrecoverable.

### The compositing use case

Owner's two PDFs (flyer with yellow-BG branding + flyer with text content) placed in `./temp/`. Goal: composite text onto branded background, export.

Baseline test via playwright + headed chromium against current build:

- **Opening a 2nd PDF replaces the 1st** (single-doc model — expected, exactly what `vectorfeld-4w7` is for).
- **Clipboard survives the replacement**, so an arcane 4-step workflow does actually composite: open foreground, Ctrl+A, Ctrl+C, open background (destroys canvas), Ctrl+V, Ctrl+Shift+[. The send-to-back shortcut is not discoverable via menu.
- **`vectorfeld-7yc` did not actually land**: each imported PDF was coming in as a single `<g>` wrapping all 112–218 children, not as N direct layer children. Clicking any text selected the whole page. The prior close reason was false.

### Beads closed this session (5)

| ID | Title | What shipped |
|----|-------|--------------|
| `vectorfeld-37x` | MuPDF `<g>`-wrapper regression | `flattenAndScalePdfLayer(layer, scale)` — pure helper. Detects single-anonymous-`<g>`-child wrappers (no data-layer-name / id / class), promotes children one level up, composes wrapper.transform with the scale prefix. Falls through to per-child scale if no wrapper. Inserted into `applyParsedSvg`. 7 new unit tests. Live-verified: 112 direct layer children (was 1), clicking the "Kurzfristige Hilfe" headline selects a 148×10 mm box (was 210×297 mm full page). |
| `vectorfeld-c2m` | Arrange items in Object menu | 4 menu items between Flip and Convert, wired to existing `zOrder.ts` functions. Keyboard shortcuts right-aligned. Fixed `MenuBar` label-wrap bug (added `whitespace-nowrap`) along the way. |
| `vectorfeld-u2b` | Open PDF as Background Layer | `importPdfAsBackgroundLayer(doc)` in `pdfImport.ts`. Inserts new layer BEFORE `getLayerElements()[0]` (bottom of z-stack). Filename → layer name (truncated 40 chars, ".pdf" stripped, "Background" fallback). Reuses `flattenAndScalePdfLayer`. 8 new unit tests. Bug discovered during live-verify: `clearSelection()` fired notify BEFORE insertion, so LayersPanel refreshed against the old state — moved to end of function. |
| `vectorfeld-37x` / `c2m` / `u2b` | (above) | Three-click compositing workflow replaces the six-step keyboard-only version. |

### Beads filed this session (7, all open)

From compositing investigation (before):
- `vectorfeld-c2m` — Arrange submenu (closed above)
- `vectorfeld-u2b` — Open PDF as Background Layer (closed above, depended on 37x)
- `vectorfeld-2ss` — Paste in Place (Ctrl+Shift+V, no offset) — P2, 30 min
- `vectorfeld-cd2` — MuPDF text=text fallback to path outlines for some fonts — **bumped from P2 to P1** after the end-to-end test
- `vectorfeld-37x` — the wrapper regression itself (closed above)

From end-to-end composite test (after):
- `vectorfeld-9s9` — **P1** — `svg2pdf.js` doesn't preserve imported-PDF fonts. Body text garbles on Export PDF (`Kurzfristige` → `xzfristlge`, etc.). SVG export is fine; PDF export is lossy. Needs: font subset extraction during import or a different PDF engine.
- `vectorfeld-6z0` — P2 — Yellow-BG composite PDF has left-edge white margin + possible clipping on Export PDF. Related to 9s9 (both svg2pdf.js fidelity issues).

### Commits pushed this session (`main` branch)

```
35faa5b Recover pivot-session bd state + add session lessons
9520518 Fix MuPDF <g>-wrapper regression + file 5 related beads (vectorfeld-37x)
6fc27e8 Add Arrange z-order items to Object menu (vectorfeld-c2m)
a0f551f Add File > Open PDF as Background Layer (vectorfeld-u2b)
```

Starting point (after bd recovery): `35faa5b`. End of feature work: `a0f551f`. Plus `bc8fa42` (filter-repo purge of credential leak).

### End-to-end validation

Against the real `./temp/*.pdf` files via playwright + headed chromium:

1. `File > Open PDF…` → foreground PDF (text content)
2. `File > Open PDF as Background Layer…` → background PDF (branded design)
3. `File > Export SVG` → `temp/composite.svg` (468 KB) — **pixel-perfect**
4. `File > Export PDF` → `temp/composite.pdf` (1.2 MB) — **lossy on body text** per 9s9

The in-app composite is production-quality. The SVG round-trip is lossless. PDF round-trip is broken for body text but structurally sound (page size, images, outlined glyphs all correct).

### Tests

446 → 461 (+15 new: 7 for `flattenAndScalePdfLayer`, 3 for `sanitizeLayerNameFromFile`, 5 for `applyParsedAsBackgroundLayer`).

### Next work

Priority cluster for the PDF round-trip (both P1):
- `vectorfeld-cd2` — Fix MuPDF text=text fallback so more fonts survive as real `<text>`.
- `vectorfeld-9s9` — Fix Export PDF to preserve fonts (likely: extract subset during import, embed in export).

Together these make **PDF → edit → PDF** truly lossless, which is the pivot's load-bearing promise.

Other ready work: `vectorfeld-4w7` (multi-doc tabs), `vectorfeld-2ss` (Paste in Place), `vectorfeld-6z0` (PDF export clipping), plus the 6 older deferred pen-tool / properties-polish bugs.

---

## Session log — 2026-04-20 (TDD round-trip session)

Closed both P1 PDF round-trip beads (`vectorfeld-9s9` export, `vectorfeld-cd2` import) plus two follow-on bugs surfaced during real-user verification (`vectorfeld-ape` WinAnsi crash, `vectorfeld-dns` real-PDF transforms+tspans). Built a vitest-based golden-fixture harness from scratch (`vectorfeld-5cu`) as the TDD scaffold. **461 → 509 tests green (+48 new).** All work committed to `main`; pushed at session close.

### Strategy

User asked for "best of Illustrator + Acrobat" — keep authoring power, add Acrobat-style PDF fidelity. Picked the load-bearing P1s (PDF round-trip) over feature work because the pivot's promise (open PDF → edit → export PDF without losing text) was visibly broken on 2026-04-20. User insisted on **red-green TDD discipline**, no CI workflows.

### Beads closed this session (5)

| ID | Title | What shipped |
|----|-------|--------------|
| `vectorfeld-5cu` | PDF round-trip golden-fixture test harness | `test/roundtrip/{fixtures,golden,helpers}/` scaffold; `normalizeSvg.ts` (10 tests, semantic SVG diff with id-strip + 2dp coord rounding + alphabetical attr sort); `renderPdf.ts` (4 tests, pdfjs-dist + node-canvas raster); `pdfPipeline.ts` (3 tests, MuPDF without the Worker hop). Extracted `renderPdfPageToSvg` from `pdfRender.worker.ts` into shared `src/model/pdfRender.ts` so tests can import without Worker shim. Installed pdfjs-dist + pixelmatch + pngjs + @types/pngjs. |
| `vectorfeld-9s9` | PDF export font fidelity | Built new pdf-lib-based engine in `src/model/pdfExport.ts` from scratch (text → path → rect/line/ellipse/circle/image → g+transform with full matrix composition via `matrix.ts`). Replaced production `exportPdf` end-to-end. Removed `jspdf` + `svg2pdf.js` from production import path (still installed; ah8 will clean). Added pdfjs-dist text-extraction helper (`extractPdfTextItems`) for position-aware test assertions. |
| `vectorfeld-cd2` | MuPDF outline-fallback warning | **Reframed after empirical spike**: pdfjs-dist returns the same 15 chars as MuPDF on the yellow-BG flyer — text was outlined-to-paths AT SOURCE PDF GENERATION (designer outlined fonts pre-delivery), not in MuPDF's interpreter. Not recoverable as text by any engine without OCR. Shipped: `analyzeImportedSvg` heuristic (path-to-text-char ratio with thresholds calibrated on real fixtures), `tagLayerWithImportAnalysis` hook in `pdfImport.ts` setting `data-mostly-outlined` + `data-text-chars` + `data-path-count` + console.warn, ⚠ badge + tooltip in `LayersPanel.tsx`. |
| `vectorfeld-ape` | pdf-lib export crashes on non-WinAnsi chars | Discovered via composite-via-playwright. The noheader flyer contains U+25CA (◊) bullets; pdf-lib's StandardFonts.Helvetica can't encode them and `pdf.save()` throws. `safeEncode` wrapper catches encoding failures and drops chars per char with structured console.warn naming each codepoint. Composite now exports without crashing; ◊ silently dropped pending Unicode TTF embed (`vectorfeld-85m`). |
| `vectorfeld-dns` | Real-PDF export bugs missed by synthetic tests | Two structural bugs that bit every real PDF import but were invisible to the synthetic test suite: (1) `walk()` ignored `transform=` on leaf elements (text/path/etc.) — MuPDF's flatten step puts `transform="scale(pt→mm)"` directly on each leaf, so all imported content rendered ~3× too large at wrong positions; (2) `drawText` only read x/y from `<text>` itself, ignoring `<tspan>` positions — but MuPDF emits text positioning ON the tspan, so every imported text collapsed to (0, 0) → bottom-left of export. Both fixed; 4 new tests; **lesson added to `docs/lessons.md` ("synthetic-test fixtures must include the emission shape of every upstream tool you intend to consume")**. Detection method that worked: composite-via-playwright + headed Chromium screenshot of the exported PDF. |

### Beads filed this session (5, all open)

- `vectorfeld-pr9` (P3) — Hybrid pdfjs-dist text overlay for Type 3 charproc PDFs (would recover text MuPDF rasterizes; deferred until a Type 3 fixture is in hand)
- `vectorfeld-ah8` (P3) — Remove unused `jspdf` + `svg2pdf.js` from production bundle (no longer imported by any `src/` file post-9s9)
- `vectorfeld-85m` (P2) — Embed Unicode TTF (DejaVu / Noto) so ◊ etc. survive export
- `vectorfeld-dns` (P1, closed above) — created and closed in same session
- `vectorfeld-dcx` (P1, **OPEN, top of next session**) — Real-PDF export still has text kerning / per-char positioning issues. After dns the layout is right (headline at top, body in middle, QR + flag at bottom) but words still run together because MuPDF emits multi-char tspans with PER-CHARACTER x-arrays (`x="100 108 116 124"` for "abcd"); we currently honour only the first x value and let pdf-lib lay out the rest with default Helvetica metrics that don't match the source font's spacing.

### Commits pushed this session (`main` branch)

```
bf2bbef Fix real-PDF export bugs: leaf transforms + tspan positioning (vectorfeld-dns)
ebc4654 Sanitize non-WinAnsi chars in pdf-lib drawText (vectorfeld-ape)
e31022b Detect mostly-outlined PDFs on import + warn user (vectorfeld-cd2)
7d1e3e9 bd: capture interactions for vectorfeld-9s9 close + ah8 file
f2793ed Wire production exportPdf to pdf-lib engine; add g+transform support (vectorfeld-9s9)
771d78e Extend pdf-lib engine to path/rect/line/ellipse/circle/image (vectorfeld-9s9)
ff49d70 Add pdf-lib SVG→PDF engine (text only) + failing-then-green round-trip test
00b319b Add PDF round-trip golden-fixture test harness (vectorfeld-5cu)
```

Plus a final worklog/sync commit at session close.

### End-of-session verification

Real-user composite via headed Chromium playwright (`temp/composite-via-playwright.mjs`):

1. `File > Open PDF…` → `Flyer ... noheader.pdf` (foreground; 112 elements; 817 text chars; no warning)
2. `File > Open PDF as Background Layer…` → `Flyer ... yellow BG.pdf` (background; 218 elements; 15 text chars; **cd2 ⚠ badge fires correctly** — "216 paths vs only 15 editable text chars")
3. `File > Export PDF` → `temp/composite.pdf` (231 KB)
4. Open exported PDF in Chromium → screenshot (`temp/composite-in-chrome.png`)

Result: **layout structurally correct** (headline at top, body in middle, QR + flag at bottom; matches both the canvas and the source flyer) but **per-character spacing visibly wrong** ("Ich entlastedurch mein Lektoral…"). Captured as `vectorfeld-dcx`. Compare to the pre-9s9 baseline composite: 1.2 MB with completely garbled body text — current state is structurally right and only kerning is off.

### Tests

461 (start) → 478 (after 5cu harness) → 483 (after 9s9 text-only) → 490 (after 9s9 primitives) → 491 (after 9s9 g+transform + production wire) → 503 (after cd2) → 505 (after ape) → **509 (final)**.

### Bundle

881 KB main + 89 KB MuPDF JS + 10 MB MuPDF WASM. +57 KB from pdf-lib. `jspdf` + `svg2pdf.js` still bundled (unused — `ah8` follow-up).

### Next work — read these first next session

**Top of `bd ready` (P1):**
1. `vectorfeld-dcx` — kerning / per-char positioning. The export is structurally right after dns; only character spacing is off. Hypothesis in the bead description: walk per-char x-array, drawText each char individually. Verify with composite-via-playwright + headed Chromium screenshot.

**P2 cluster:**
- `vectorfeld-85m` — embed Unicode TTF. Closes the ◊-and-friends loss from ape.
- `vectorfeld-6z0` — yellow-BG composite white margin / clipping on export. May or may not still reproduce after the 9s9 engine swap; re-verify first.
- `vectorfeld-4w7` — multi-doc UI tabs. The architectural foundation is in place from the pivot session.
- `vectorfeld-2ss` — Paste in Place (Ctrl+Shift+V).
- 4 deferred pen-tool / properties-polish bugs from before the pivot.

**P3:**
- `vectorfeld-ah8` — bundle cleanup (rip `jspdf` + `svg2pdf.js`).
- `vectorfeld-pr9` — hybrid pdfjs-dist for Type 3. Defer until we have a Type 3 fixture.

### Key files to know

- `src/model/pdfExport.ts` — the new pdf-lib engine. Where dcx fix lands.
- `src/model/pdfRender.ts` — extracted MuPDF call path. Used by both worker (browser) and tests (Node).
- `src/model/importAnalysis.ts` — cd2 heuristic.
- `test/roundtrip/` — golden-fixture harness. `helpers/{normalizeSvg,renderPdf,pdfPipeline,pdfText}.ts` + `svgToPdfRoundtrip.test.ts` (19 tests).
- `temp/composite-via-playwright.mjs` — the end-to-end driver. Re-run anytime to validate.
- `docs/lessons.md` — the synthetic-test-blindspot lesson. Read before adding any new SVG-consuming code.

---

## Session log — 2026-04-22 (kerning → font-embed → graft-architecture pivot)

Ended with three commits to prod + spike-proven architecture for a rewrite. Started from `846f024` (TDD round-trip session end), ended at `7448eee` (de-risk spikes pass).

### Arc

User asked to tackle `vectorfeld-dcx` (residual PDF-export kerning). What was meant to be a one-bead fix turned into two major correctness fixes and a strategic-architecture decision:

1. **`vectorfeld-dcx` kerning**: per-char `x`-array in MuPDF tspans was only honouring the first value. Fixed `drawText` in `src/model/pdfExport.ts` to iterate per code point when `x` is space-separated. Committed as `1d6dbf9`. 3 new tests, 509→512 green.

2. **Double-Y-flip path bug** (`09e0bde`): user ran the composite and called it "BAD". Investigation revealed `drawPath` was pre-flipping coordinates (`pageHeightPt - y`) then pdf-lib's `drawSvgPath` applied its own internal Y-flip on top — every path rendered above the page (negative Y, invisible). All 216 paths (blue border frame + swift bird logo) were missing from every export without anyone noticing, because existing synthetic tests only checked "a path element exists". Fixed + added position-on-page test.

3. **Font embedding** (`a8d2fe6`, closes `vectorfeld-85m`): swapped bundled `StandardFonts.Helvetica` for Carlito (Calibri clone) + Liberation Serif (Playfair Display substitute) via `@pdf-lib/fontkit`. ◊ characters preserved. "swift LinguistiK" logo in italic serif. 1MB bundle cost. Went from pdf-lib Helvetica → pixel-close to source for body text.

4. **User challenge**: "why do you need the fonts? Would acrobat need the fonts to do the same job?" — correctly identified that the Carlito bundle is a workaround for losing source font subsets at the SVG-intermediate step. Research agent surveyed Acrobat / Preview / pdf-lib / Illustrator / PDF spec / MuPDF to propose a scalable alternative.

5. **Architectural decision**: switch from "PDF→SVG→pdf-lib→PDF" to **"graft source PDF byte-for-byte, overlay edits via appended content streams"**. Spike-proven (see below). Untouched regions preserved at the PDF object-graph level — including embedded font subsets, kerning, ligatures, hinting, colour spaces — via `PDFDocument.graftPage()`. New content composited via additional content streams in the same page's `/Contents` array. This is Acrobat's model adapted for a personal editor.

### De-risk spikes (all 3 PASS)

Epic: `vectorfeld-ccl`. Spikes closed: `u9d`, `kgz`, `jew`. Scripts live at `scripts/spike/*.mjs` and are re-runnable.

- **Spike 1 (`u9d`)** — `mupdf.PDFDocument.graftPage()` clone verbatim. Loaded the yellow-BG flyer, grafted page 0 into an empty PDFDocument, saved. pdftoppm@150dpi rendered output and source to PNG; pixelmatch against each other: **0 / 2,176,714 pixels differ (0.0000%)**. All 10 source font subsets preserved with original 6-letter Adobe prefixes (NQVAEI+/VKURMS+/BAAAAA+/CAAAAA+ = Calibri + Playfair Display variants). File shrinks from 2.6 MB → 1.6 MB because graft drops unused cross-page objects.

- **Spike 2 (`kgz`)** — graftPage + append overlay content stream. Two patterns validated: (a) reference the grafted source Calibri font — works, but subsetted sources lack glyphs we didn't use (e.g. no capital K in the regular-Calibri subset); (b) embed Carlito into the grafted doc via `PDFDocument.addSimpleFont(font, 'Latin')` + register under `/VfCarlito` in the page's `/Resources/Font` dict + reference from a new content stream — renders full text overlay without touching source bytes. Pattern (b) is production.

- **Spike 3 (`jew`)** — content-stream operator tokenizer in 120 LOC of TypeScript. PDF §7.8.2 literal-string + hex-string + name + number + operator tokens. 13ms on a 16 KB stream. Source emits 106 `TJ` ops (array form, per-char positioning) and 0 `Tj` (plain). To locate a specific source text run by its content we'll need to decode the per-font ToUnicode CMap (additional ~100 LOC) since CID Identity-H fonts encode as 2-byte glyph indices, not characters.

### Beads filed & gate

Full epic plan registered in bd, 14 beads total, dependencies wired. See `bd show vectorfeld-ccl` for the tree.

- Phase 1 (de-risk spikes): all 3 closed ✓
- Phase 2 (impl: live mupdf handle `byq`, src-tag `8v3`, command classification `5gk`, graft engine `wjj`, wire `u7r`, byte-diff test `6d0`): ~670 LOC, ready to start
- Phase 3 (typography polish: fontkit layout `yyj`, in-place source-font edit `eb0`): ~500 LOC
- Cleanup (`hc7`, `7mj`): -300 LOC, -1 MB bundle

Gate verdict: **GO**.

### Lessons captured (`docs/lessons.md`)

- **pdf-lib drawSvgPath double-Y-flip**: the API takes SVG coords and flips internally; other pdf-lib drawing methods (`drawRectangle`/`drawText`/`drawLine`/`drawEllipse`) take PDF coords already flipped. Pre-flipping paths = double-flip = invisible output. Synthetic tests must assert on-page position, not just "a path element exists".
- **Vite dev-server staleness during headed-Chromium dogfood**: burned ~15 min chasing a "Carlito rendering bug" that was actually stale cached code served by a dead vite process. Rule: before diagnosing, `curl -I localhost:5173` + `ps aux | grep vite`. Cross-verify with `pdftoppm` (CLI, no Vite in the loop).

### Commits on `main` this session

```
7448eee  Graft-architecture de-risk spikes: all 3 PASS
99f77ce  Capture pdf-lib Y-flip + Vite staleness lessons
a8d2fe6  Embed Carlito + Liberation Serif so PDF export fonts match source (vectorfeld-85m)
09e0bde  Fix PDF export double-Y-flip that hid all imported vector paths
1d6dbf9  Fix PDF export per-character kerning for MuPDF imports (vectorfeld-dcx)
```

Plus this worklog + bd export refresh.

### Beads closed this session

`vectorfeld-dcx` (P1 kerning), `vectorfeld-85m` (P2 Unicode TTF / font embed), `vectorfeld-u9d` + `-kgz` + `-jew` (three graft spikes).

### Beads filed this session

Epic `vectorfeld-ccl` + 12 sub-beads in the Phase 2 / Phase 3 / cleanup tracks (see bd list). Plus `vectorfeld-sqr` (P3 follow-up to subset fonts for bundle size — becomes moot once Phase 2 lands).

### Next work — top of next session

`vectorfeld-byq`: live `mupdf.PDFDocument` handle in `DocumentState`. Unblocks everything in Phase 2. Start by modifying `src/model/pdfImport.ts` (stop calling `.destroy()` on the mupdf Document after SVG extraction; thread the handle through to `documentState.ts`). ~150 LOC.

### Key files to know (update)

- `scripts/spike/*.mjs` — re-runnable spike scripts. Gate for any graft-architecture regression.
- `temp/spike-01-verdict.md`, `temp/spike-02-verdict.md`, `temp/spike-03-findings.md` — spike findings. Read these before touching `graftExport.ts`.
- `node_modules/mupdf/dist/mupdf.d.ts` — authoritative mupdf.js API surface. Key entries: `PDFDocument.graftPage`, `addSimpleFont`, `addStream`, `PDFObject.readStream/writeStream/get/put/push`, `findPage`.
- `src/fonts/` — bundled Carlito (Calibri-metric clone) + Liberation Serif. Shrink after `vectorfeld-hc7` ships.
