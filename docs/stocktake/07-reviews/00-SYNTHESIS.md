# Review Synthesis — Cross-Cutting Findings

_Assembled: 2026-04-19 from six adversarial reviews (01–06)._

## The single most important finding

**Cross-document clipboard and multi-document workflow — the defining feature of the PDF-edit pivot — is architecturally impossible on the current singleton model.** Nine module-level pub-sub singletons (`selection`, `activeLayer`, `artboard`, `grid`, `guides`, `defaultStyle`, `smartGuides`, `wireframe`, plus `keyboardCapture` in the tool registry) hold process-scoped state that assumes one document. Opening a second PDF silently corrupts all of them. This is the refactor that gates the pivot. See `02-architecture.md` §1.

## Three things that would break a real session on day 1

1. **Click-selects-whole-page on imported PDFs** (`06-use-case-fitness.md`, `02-architecture.md`). MuPDF wraps content in one `<g>`; clicking any character selects everything. Every downstream edit fails. This alone makes the tool non-viable as a PDF editor until fixed.
2. **`<image>` silently dropped on SVG re-import** (`01-test-coverage.md`, `fileio.ts:255`). Missing from `drawingTags` whitelist in `parseSvgString` flat-SVG path. User exports an imported PDF to SVG, re-opens it, images vanish. Zero tests catch it. One-line fix.
3. **`<tspan>` x-array coordinates not updated on text move** (`02-architecture.md`). `computeTranslateAttrs` updates `text.x`/`text.y` but ignores the absolute per-character `<tspan>` x-arrays produced by MuPDF. Moving imported text leaves characters stranded. High-visibility, currently undetected.

## One EXPLOITABLE security gap

**Zero SVG sanitization + `"csp": null` in Tauri.** `parseSvgString` → `importNode` ingests untrusted SVG with no filtering: `<script>`, `<foreignObject>` with inline HTML, `onclick` attributes, `javascript:` hrefs all pass through. With CSP disabled, any inline handler runs in the Tauri renderer with full privileges. A malicious PDF embedding a crafted SVG image becomes an arbitrary-code-execution vector on import. See `05-security.md` §1. Blocker for any distribution build.

## Counts across reviews

| Review | Findings | Most-severe count |
|---|---|---|
| 01 Test coverage | 37 | 5 BLOCKER |
| 02 Architecture | ~20 (not tallied, ranked) | 1 foundational |
| 03 Performance | ~15 (ranked top-10) | 3 PAINFUL |
| 04 Code smells | ~40 (15 top-ranked) | ~1100 LOC deletable |
| 05 Security | ~15 | 1 EXPLOITABLE |
| 06 Use-case | 10 | 1 WRONG-TOOL |

## Cross-cutting themes

### Theme 1 — The model is right; the shell is wrong
Unanimous across 02, 04, 06. The `src/model/` layer (command pattern, matrix/geometry, path ops, document, selection API) is solid and the casual-PDF-edit use case is technically viable through it. The `src/components/` shell is an Illustrator clone built for the abandoned scientific-diagram PRD. Cold-pickup presents 15 tools, most useless for PDF editing. Menu structure buries "Open PDF" and surfaces path booleans. Font dropdown hides font-family drift by falling back to "sans-serif". The redesign path is the shell, not the model.

### Theme 2 — Claimed state is not real state
From 04 and 05. `AGENTS.md` claims "Phase 2 complete: 100%, 472 tests, zero errors." Reality: 8 PRD items never implemented, tests pass after my recent fixes but had 42 TS errors and 3 broken suites before, "no known bugs" but the beads tracker shows 9 open. `docs/API.md` documents a `Toolbar.tsx` that was deleted, 5 tools when there are 15, polling-based LayersPanel since replaced by subscriptions. A new agent session reads the docs and builds a mental model that is wrong in load-bearing ways.

### Theme 3 — Single-doc assumptions permeate deeper than the singletons
02 singles out the nine singletons, but 01 and 03 also surface single-doc assumptions in unexpected places: `generateId` is process-scoped (ID collisions across docs), `clipboard.ts` serializes to a single in-memory buffer with no multi-doc addressing, `LayersPanel` re-queries the DOM on every selection event assuming there is one canvas. The refactor surface is wider than `DocumentState`.

### Theme 4 — Performance cliffs are predictable at real-document scale
From 03. Everything is O(n) where n = total elements on canvas. `smartGuides.cacheSmartGuideCandidates` calls `getBBox()` on every element (100× forced layout per drag frame at 100 elements). `hit_testAll` has no spatial index. `PropertiesPanel` (684 LOC) has no memoization and re-renders on every selection event. MuPDF WASM runs on the main thread — a 10-page PDF freezes the UI for 1–3 seconds. The current 1–5 element test suite hides all of this; the pivot makes 100–1000 elements the normal case.

### Theme 5 — Old-PRD residue is extractable dead weight
From 04 and 06. ~961 LOC of scientific-diagram-era code (tikzExport 178, offsetPath 218, textPath 114, SwatchPanel+swatches 172, pathBooleans 80, pen-tool Bézier authoring sections, scissors, knife, free-transform skew) is either completely unused or unused for the pivot. Removing it clarifies the codebase AND tightens the bundle. ~1,100 LOC total deletable (~6% of codebase) without functional loss under the new use case.

### Theme 6 — Tests exist but don't test the workflow
From 01. `clipboard.ts` 93 LOC: zero tests. `freeTransformTool.test.ts` 8 tests, 0 real assertions on 313 LOC. `PropertiesPanel.test.tsx` 199 LOC of mocks wrapping 12 smoke assertions. The math layer (matrix, pathOps) is well-tested in isolation, but there is no cross-module integration test. The entire PDF-import → select → move → undo → export round-trip has zero test coverage. First real session will hit three zero-coverage modules.

## Consolidated top-10 action list (ranked by ROI for the pivot)

| # | Action | Source | Effort | Unlocks |
|---|---|---|---|---|
| 1 | Fix `<image>` drop in `fileio.ts:255` drawingTags | 01 | 5 min | PDF→SVG→re-open doesn't lose images |
| 2 | Add SVG sanitizer + enable Tauri CSP | 05 | 2 hr | Safe to ingest untrusted PDFs |
| 3 | Auto-ungroup MuPDF top-level `<g>` on PDF import | 06, 02 | 1 hr | Click-selects-element works |
| 4 | Fix `<tspan>` x-array on text translate (`geometry.ts:computeTranslateAttrs`) | 02 | 0.5 day | Moving PDF text doesn't strand glyphs |
| 5 | Delete dead code (SwatchPanel, tikzExport, offsetPath, textPath, scissors/knife) | 04, 06 | 1 day | -1,100 LOC, less cognitive tax |
| 6 | Hide 8 dead tools from ToolStrip | 06 | 30 min | Cold-pickup sees ~4 relevant tools |
| 7 | Rewrite AGENTS.md + API.md to match reality | 04 | 3 hr | New agent sessions work from accurate map |
| 8 | `DocumentState` context refactor (singletons → per-document) | 02 | 3 days | Multi-doc becomes possible |
| 9 | Move MuPDF WASM to a Web Worker | 03 | 2-3 hr | Multi-page import doesn't freeze UI |
| 10 | Pre-split smart-guide candidates by axis | 03 | 30 min | Drag-move smooth at 100+ elements |

Items 1–7 can be done in a single short session and represent 90% of the cold-pickup experience improvement. Items 8–10 are the architectural and performance work needed for the multi-document, multi-page, large-document reality of real PDFs.

## What the reviews do NOT cover (call-outs)

- No accessibility (keyboard nav, screen-reader) audit — irrelevant for single-user tool.
- No bundler-size deep-dive beyond chunk-size warnings.
- No internationalization — not in scope.
- No cross-platform testing — only WSL/Linux dev environment.

## Where to go deeper

- `01-test-coverage.md` lists specific file:line gaps including the full 37 findings, with reproducer scenarios for the 5 BLOCKER items.
- `02-architecture.md` includes a hostility matrix mapping each pivot capability against the architectural cost.
- `03-performance.md` includes a hot-path table with estimated frame-time costs per scenario.
- `04-code-smells.md` gives per-file decomposition plans for the four god files.
- `05-security.md` provides the exploitable-SVG payload shape for verification.
- `06-use-case-fitness.md` has the tool-by-tool keep/hide/delete matrix and a redesign sketch.
