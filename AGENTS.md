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

## Current state (2026-04-19, after the pivot session)

- **Build**: green. 446 tests passing across 33 test files.
- **Bundle**: ~824 KB main chunk + separate 89 KB MuPDF JS chunk + 10 MB MuPDF WASM (lazy, Web Worker).
- **PDF import**: MuPDF `text=text` mode validated end-to-end. Runs in a Web Worker — the 10 MB WASM load + render no longer block the main thread. Produces real `<text>`/`<tspan>`/`<image>`. Individual elements are click-selectable. Drag moves glyphs as a coherent unit (tspan x-arrays shift). See `docs/stocktake/06-pdf-roundtrip-experiment.md`.
- **Security**: SVG sanitizer strips `<script>`, `<foreignObject>`, `<iframe>`, `on*` handlers, `javascript:`/`data:text/html` hrefs. Tauri CSP tightened from `null` to an explicit allowlist policy (see `src-tauri/tauri.conf.json`).
- **Shell**: 7 tools visible in the strip (select, direct-select, rectangle, ellipse, line, text, eraser). 6 tools hidden but keyboard-accessible (pen P, pencil N, measure M, lasso J, free-transform Q, eyedropper I).
- **Architecture**: Phase 1 of the DocumentState refactor is landed. Per-document state is now isolated — two `DocumentState` instances can coexist without corrupting each other. Multi-doc UI (`vectorfeld-ipp`) is unblocked.

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
6. **Test**: `npm test -- --run`. For UI changes: `experiments/pdf-roundtrip/verify-import.mjs` is a headed-Chromium end-to-end check that imports a PDF and verifies select + move. Use it or write a similar one.
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
