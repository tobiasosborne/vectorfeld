# Agent Instructions

**START HERE.** Read in this order before changing anything:

1. The **Current state** section below — load-bearing summary of the running app.
2. **CLAUDE.md** — workflow rules.
3. **docs/lessons.md** — corrections from prior sessions. Update after any correction.
4. **docs/API.md** — model + tool registry reference. Read before touching `src/model/` or `src/tools/`.
5. **docs/worklog/README.md** → most recent entry — describes the architectural track currently in flight.

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

## Current state (2026-04-27, late session)

- **Build**: green. **789 tests** across **66 files**. Type check clean.
- **Golden suites**: **11/11 gate stories ✓** (`npm run golden`); 10/10 milestones ✓. Gate 11 (graft-text-shaping) added with `vectorfeld-ufg` — locks GSUB ligature + GPOS kern emission with three-layer assertion (byte-match + pdfjs reads "office"/"Ta"/"WA" via /ToUnicode + at least one shaped showText op carries inline kern adjustments). Gate 10 (PDF text-recolor) re-mastered through graft.
- **Bundle** (`npm run build`): main JS **1,670 KB** (gzip 665 KB) + MuPDF JS **89 KB** + MuPDF WASM **10 MB** + Inter/JetBrainsMono woff2 **422 KB** + Carlito/Liberation Serif TTFs **2.7 MB** (embedded for pdf-lib font fidelity, see `vectorfeld-85m`).
- **UI shell — Atrium** (shipped 2026-04-23): floating Panels over a radial-gradient root. `LeftRail` 9-slot rail + `⋯` overflow for keyboard-only tools, `TopBar` with brand + menu words + tab stub + coral Export PDF, `StatusBar` floating pill, `InspectorPanel` (Frame + Style + merged Layers/Pages tab). Token system in `src/index.css` (oklch) + `src/theme/atrium.ts`.
- **PDF import**: MuPDF `text=text` mode in a Web Worker. Real `<text>`/`<tspan>`/`<image>` when MuPDF can preserve them; outlines otherwise. ⚠ "mostly-outlined" badge surfaces unrecoverable cases (`analyzeImportedSvg`). Each PDF lands as N direct layer children.
- **PDF export — pdf-lib engine** (`src/model/pdfExport.ts`): handles text, path, rect, line, ellipse, circle, image, `<g transform>` with full affine matrix composition. Carlito + Liberation Serif embedded via `@pdf-lib/fontkit`. Per-character kerning honoured from MuPDF tspan `x`-arrays. Used as fallback only — overlay-only docs (no source) and any document with backgrounds.
- **PDF export — graft engine** (`src/model/graftExport.ts`): production path for ALL single-source-PDF documents post-`vectorfeld-yyj`. Grafts the source page byte-for-byte via `mupdf.PDFDocument.graftPage`, applies redactions for deleted/modified source elements (excises text/line-art ops — NOT a visual mask), registers a Type-0 / Identity-H Carlito font on the page, then appends a shaped-TJ overlay content stream. **Order matters: redact BEFORE registerCidFont** — `applyRedactions` prunes /Resources/Font, see lessons.md. Text emission goes through `shape()` (fontkit) → `emitTjArrayItems()` (Identity-H hex + GPOS kern adjustments).
- **Compositing**: `File > Open PDF as Background Layer…` adds a named layer at the bottom of the z-stack without clearing the canvas. Three-click workflow: open foreground, open background layer, done.
- **Z-order**: Arrange + Group/Ungroup + 6 Align items live in the Object menu with keyboard shortcuts right-aligned.
- **Security**: SVG sanitizer strips `<script>`, `<foreignObject>`, `<iframe>`, `<object>`, `<embed>`, `on*` handlers, `javascript:`/`data:text/html` hrefs. Tauri CSP is an explicit allowlist (`src-tauri/tauri.conf.json`).
- **Architecture**: DocumentState Phase 1 landed (per-document state isolation). Multi-doc UI (`vectorfeld-4w7`) is pending. The **graft-architecture rewrite** (epic `vectorfeld-ccl`, P1) is functionally complete — `vectorfeld-yyj` (full-OpenType shaping) shipped 2026-04-27 with all 7 load-bearing sub-beads (`yio`, `of4`, `7t7`, `33a`, `87h`, `ufg`, `giz`-as-unneeded). Routing now sends pure-graft + ALL mixed-layer kinds (deletions / modifications / additions) through graft; only overlay-only-with-no-source and backgrounds gate to pdf-lib. Outstanding: `clw` (font subsetting, P3 optimization) and `eb0` (in-place source-font edits — preserves source font when modifying source elements rather than overlaying Carlito). See `scripts/spike/*.mjs`, `docs/spikes/`, and recent worklogs.

### Round-trip status

- **SVG export**: pixel-lossless against the canvas. Reliable export target.
- **PDF export**: structurally correct; per-char kerning + font subsets close enough that real-flyer composites render cleanly. Residual fidelity gaps close when `vectorfeld-ccl` (graft engine) ships.

## What's NOT here (removed 2026-04-19)

~2,100 LOC of old-PRD code was deleted: TikZ export, offset path, text-on-path, compound paths, path booleans (Paper.js dep), clipping + opacity masks, color swatches + SwatchPanel, scissors tool, knife tool, all corresponding Object-menu items.

Don't re-add these unless the use case changes. Ask first.

## Known open issues (beads)

Run `bd ready` for the live queue. As of 2026-04-27:

**P1 — load-bearing track:**
- `vectorfeld-ccl` (epic) — Graft-based PDF round-trip. After `yyj` shipped (2026-04-27) the engine handles pure-graft + all mixed-layer kinds (deletions, modifications, additions) with shaped Carlito overlays. Remaining gap: `vectorfeld-eb0` — in-place source-font edits (preserve source font when modifying source elements rather than overlaying Carlito) — and `vectorfeld-clw` (font subsetting via mupdf.subsetFonts, currently bundles ~600KB Carlito per export).

**P2 cluster:**
- `vectorfeld-4w7` — Multi-document UI tabs + cross-document clipboard. Lights up the tab stub Atrium left in `TopBar`.
- `vectorfeld-2ss` — Paste in Place (Ctrl+Shift+V), no offset.
- `vectorfeld-6z0` — Yellow-BG composite white-margin / clipping on Export PDF. Re-verify before fixing — may have moved post-9s9 engine swap.
- Pre-pivot pen-tool / properties polish: `9hu`, `t7u`, `els`, `vj5`, `ptz`. Drive-by territory.

**P3:**
- `vectorfeld-clw` (yyj-8) — Font subsetting via `mupdf.subsetFonts()`. Output PDFs currently embed full ~600KB Carlito; subset → expected >50% drop.
- `vectorfeld-qj7` — Expose `window.__vfTest` hook so gate stories 06/10 can use UI selection instead of direct DOM mutation.
- `vectorfeld-ah8` — bundle cleanup (rip unused `jspdf` + `svg2pdf.js`).
- `vectorfeld-pr9` — hybrid pdfjs-dist text overlay for Type 3 charproc PDFs. Defer until a Type 3 fixture exists.
- `vectorfeld-sqr` — subset bundled fonts. Becomes moot once `clw` lands.

## Workflow — how to make changes here

1. **Check beads first**: `bd ready` — pick something unblocked.
2. **Claim**: `bd update <id> --claim`.
3. **Plan mode** if 3+ steps or non-trivial. Use subagents liberally for research.
4. **Before coding**: read `docs/stocktake/01-source-map.md` entry for the file you're touching.
5. **Implement** with minimal blast radius. Don't add features that weren't asked for.
6. **Test**: `npm test -- --run`. For UI changes: `npm run dogfood` (headed-Chromium gates against the live build). For PDF-fidelity: `test/roundtrip/` golden-fixture harness drives red-green TDD.
7. **Verify gates**: `npm run golden` MUST be green before any commit that touches export, tool, or UI code. `npm run golden:milestones` is the scoreboard for tool-combo regressions.
8. **Commit + push**: `git push` is the definition of "done". Include `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`.
9. **Close the bead**: `bd close <id> --reason="<what you did>"`.

## Golden-master suites (`test/golden/`)

Two distinct classes. **Learn the difference before reaching for either.**

### Gates — `npm run golden` (CI BLOCKER)

Headed-Chromium Playwright stories driving the real UI against `localhost:5173`, capturing Export SVG + Export PDF, and **byte-matching** canonicalized output against committed masters. **Red means do not ship.**

```bash
npm run golden                      # verify all stories
npm run golden -- --only NAME       # verify one
npm run golden:record               # regenerate all masters (only with intent)
npm run golden:record NAME          # regenerate one
npm run golden:accept NAME          # promote pending → master after review
```

- Stories in `test/golden/stories/NN-*.mjs`, masters in `test/golden/masters/`.
- `canonicalize.mjs` normalizes SVG (id strip, 2dp coord round, attr sort, transform-arg unification, whitespace collapse) and PDF (pdfjs extract → JSON, docId scrub).
- Determinism fixes live in `src/model/pdfExport.ts` (`CreationDate`/`ModDate`/`Producer`/`Creator` pinned). SVG IDs are counter-based.
- **Failure policy**: each regression becomes a P1 bead. Do not silently re-record a master.

### Milestones — `npm run golden:milestones` (SCOREBOARD, NOT A GATE)

Tool-combination exercises: each milestone pairs a target SVG fixture with a driver that must use a specific tool combo (e.g. `rect + select + Frame X/Y/W/H/R`). `semanticCanonical.mjs` normalizes shape→path, hex colors, app chrome, transform-flatten before match.

```bash
npm run golden:milestones                # run the scoreboard (always exits 0)
npm run golden:milestones -- --only NAME
```

States: ✓ matched · ✗ drift (bug) · — gap (missing feature). Milestones never block merges. Red entries are backlog inputs.

### Dogfood — `npm run dogfood`

Two headed-Chromium gates that exercise the live build against real PDFs. `test/dogfood/composite.mjs` drives the compositing workflow + Export PDF. `test/dogfood/atrium.mjs` exercises Atrium UI surfaces (rail, Inspector, File menu). Run before claiming any UI or export change is done.

### Which to use when

- Touching export code (`fileio.ts`, `pdfExport.ts`) → gates MUST stay green.
- Touching tool UX (toolstrip, Properties panel, Object menu) → run milestones.
- Touching UI chrome → run dogfood.
- Adding a new user-facing feature → add a story (gate) AND a milestone.
- Never copy masters into fixtures or vice versa — the canonicalizers differ.

## Essential commands

```bash
# Tests
npm test -- --run             # Single-shot test run
npm test                      # Watch mode
npm run golden                # Gate suite (CI blocker)
npm run golden:milestones     # Tool-combo scoreboard
npm run dogfood               # Headed-Chromium dogfood gates

# Build
npm run build                 # tsc -b + vite build
npx tsc -b                    # Type-check only

# Dev
npm run dev                   # Vite on :5173

# Beads
bd ready                      # Actionable work
bd show <id>                  # Issue detail
bd update <id> --claim        # Claim
bd close <id> --reason="..."  # Close
bd memories <keyword>         # Search persistent notes
bd remember "..."             # Save a note
```

## Non-interactive shell flags

System aliases make `cp`/`mv`/`rm` interactive on this machine. Always pass `-f`:

```
cp -f | mv -f | rm -f | rm -rf <dir>
apt-get -y | ssh -o BatchMode=yes
```

## Critical safety rules

- **Never commit `.beads/.beads-credential-key`** or `.beads/backup/*.darc`. Per-machine secrets. Stage files specifically — never `git add -A`.
- **Never force-push main** without explicit user authorization.
- Rotate the beads credential if it ever leaks: `bd admin rotate-key` (or delete the file and let bd regenerate).

## Worklog index

Session histories at `docs/worklog/`. Most recent first; load when working on the subsystem the entry describes. The **truth about current state lives in this file**. Worklogs are append-only history.

| Date | Session |
|---|---|
| 2026-04-27 | [yyj-shipped](docs/worklog/2026-04-27-yyj-shipped.md) — vectorfeld-yyj shipped: full-OpenType graft text shaping (7 sub-beads) + critical applyRedactions/Resources-Font fix |
| 2026-04-26 | [handoff-yyj](docs/worklog/2026-04-26-handoff-yyj.md) — handoff: vectorfeld-yyj planned + 9 sub-beads filed; start at yyj-1 spike |
| 2026-04-26 | [graft-true-delete](docs/worklog/2026-04-26-graft-true-delete.md) — vectorfeld-enf shipped; graft engine deletes for real via applyRedactions |
| 2026-04-25 | [gate-stories-6-10](docs/worklog/2026-04-25-gate-stories-6-10.md) — 5 new headed gates (10/10 green) |
| 2026-04-25 | [graft-engine-complete](docs/worklog/2026-04-25-graft-engine-complete.md) — engine end-to-end (4 beads + epic) |
| 2026-04-25 | [handoff](docs/worklog/2026-04-25-handoff.md) — tidy + 8 graft Phase 2 beads |
| 2026-04-24 | [golden-grind](docs/worklog/2026-04-24-golden-grind.md) |
| 2026-04-23 | [atrium](docs/worklog/2026-04-23-atrium.md) |
| 2026-04-22 | [graft-spikes](docs/worklog/2026-04-22-graft-spikes.md) |
| 2026-04-22 | [design-drop](docs/worklog/2026-04-22-design-drop.md) |
| 2026-04-20 | [tdd-roundtrip](docs/worklog/2026-04-20-tdd-roundtrip.md) |
| 2026-04-20 | [composite](docs/worklog/2026-04-20-composite.md) |
| 2026-04-19 | [pivot](docs/worklog/2026-04-19-pivot.md) |
