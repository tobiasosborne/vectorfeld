# Vectorfeld — Major Adversarial Review (2026-06-21)

> Commissioned because the owner, frustrated with bugs from earlier-model work,
> was ready to dump the project and start over. Mandate: scrutinise every part
> of the app and every line of code, primarily by **experiencing** it through a
> real browser, and report what is good, bad, and saveable.

## TL;DR verdict — **SAVE IT. Do not rewrite.**

The architecture is sound and the genuinely *hard* parts are done well. The pain
the owner feels is real — **8 critical and 46 high-severity bugs ship today**,
most of them exactly the "interlock / chained-failure" class they flagged — but
those 175 findings collapse to **~6 shared root causes**, each a focused fix.
A rewrite would throw away the correct, expensive-to-rebuild core (the graft PDF
engine, the matrix/AABB geometry layer, the command/undo spine) and re-enter the
same PDF/coordinate minefield this codebase has already navigated. The right move
is a **disciplined 3–4 week remediation campaign**, not a green-field restart.

The one honest exception is the **product's headline use case** — *edit text in a
Word-generated PDF* — which is currently **non-functional via the UI** and needs a
deliberate design pass (see §6). That's a product/feature gap, not a foundation
problem: the PDF *plumbing* underneath it (import fidelity, export fidelity,
font preservation) is good.

---

## 1. How the review was done

Two adversarial multi-agent workflows plus hands-on headed reproduction:

| Pass | Scope | Agents | Method |
|---|---|---|---|
| **Static audit** | 12 subsystem clusters, ~80 source files, every line | 38 | Hostile line-by-line read; each high/critical finding re-checked by a skeptic instructed to *refute* it |
| **Experiential** | 14 user journeys | 42 | Each agent drove the **real app in a real browser**, screenshotted every step, read the screenshots to reason visually, drilled into anomalies, exported+rendered PDFs to compare; high/critical findings verified against screenshots + source |
| **Owner-thread headed repro** | Core journeys + 3 headline bugs | — | I personally drove headed Chromium: shape editing, PDF import/edit/export, compositing, and reproduced the top data-loss interlocks with my own eyes |

Total: **80 agents, ~3M tokens, 175 findings, 51 high/critical confirmed by an
independent skeptic.** Evidence (scenario scripts, screenshots, exported PDFs,
raw findings JSON) is under `test/review/` and `test/review/out/`.

A toolchain note up front: **the headed-test browser was missing** on this machine
(`~/.cache/ms-playwright` had been cleared), so `npm run golden` / `dogfood` would
currently fail to launch. I reinstalled Chromium; the suites work again.

---

## 2. What's GOOD (the load-bearing, correct core)

These are the parts a rewrite would have to rebuild from scratch — and they're
already right:

- **Graft PDF export engine** (`graftExport`, `graftCs`, `graftMupdf`, `graftBbox`,
  `graftClassify`, `graftShape`) — **B / solid.** The hard stuff is correct and
  *documented inline*: redaction-before-font-registration ordering, the Y-flip
  round-trip through redaction, Identity-H TJ shaping with GPOS kerning, font
  subsetting. 12 focused unit-test files. I verified the round-trip myself: an
  imported flyer exports back to a faithful PDF — text, images, QR code, flag,
  footer all preserved (`test/review/shots/pdf-03-exported-render.png`).
- **Geometry / matrix / AABB core** (`matrix`, `geometry`, `smartGuides`, `align`,
  `grid`, `artboard`) — **B / solid.** One affine `Matrix` type, one
  `transformedAABB` used uniformly by hit-test/guides/align/control-bar. No
  double-Y-flip, no leaf-vs-container confusion in the move path. "The healthiest
  part of the app."
- **Selection model** (`selection.ts`) — clean observable store of element refs +
  RAF-coalesced overlay renderer.
- **Command/undo spine** (`commands.ts`, `CommandHistory`) — small, symmetric
  execute/undo, well-factored clipboard/nudge/zOrder modules extracted for
  testability.
- **PDF import** — preserves real `<text>`/`<image>` when MuPDF can; correctly
  flags "mostly-outlined" PDFs; clean cancel-safe Web Worker boundary.
- **Compositing works** — and I confirmed the open bug **`vectorfeld-6z0`
  ("yellow-BG white margin") is a non-bug**: the yellow background exports
  edge-to-edge, no margin, no clipping (`test/dogfood/composite-rendered.png`).
  → recommend closing 6z0.
- **Disciplined patterns throughout**: factory-per-tool with getter injection,
  `data-role="preview"`/overlay stripping on export, deterministic golden-master
  + dogfood headed suites. Boot is clean — zero console errors.

The codebase shows a developer who **learned from past fault-lines**: the
historical focus-stealing/stale-ref bugs the owner remembers do **not** recur in
the selection/transform core; INPUT/TEXTAREA focus is guarded in the main paths.

---

## 3. What's BAD — the 8 criticals (all confirmed)

Every one is data-loss or a dead core feature. Several I reproduced headed myself.

| # | Bug | File | Why it's critical |
|---|---|---|---|
| C1 | **`File > Open PDF…` silently destroys the current document, not undoable** | `pdfImport.ts` | Open a PDF to annotate → all in-progress work gone, no warning, no recovery |
| C2 | **Imported PDF text can't be edited by ANY path** | `geometry.ts` (hit-test) | The product's reason to exist. Can't fix one typo. *(verified by me)* |
| C3 | **Hit-test selects the wrapping `<g>`, never the `<text>`** | `geometry.ts` | Roots C2; blocks every text-specific control (font/size/color) *(verified by me)* |
| C4 | **Ungroup silently discards the group's transform** | `commands.ts` | Every child teleports/de-rotates → document corruption on a normal workflow |
| C5 | **Eraser drag across shapes: undo throws, restores nothing** | `eraserTool.ts` | Destructive op with no undo = permanent loss |
| C6 | **Text-edit Ctrl+Z undoes a *previously committed shape*** | `EditorContext.tsx` | Typing + reflex undo silently destroys prior content *(verified by me)* |
| C7 | **Direct-select uses a 2nd, incompatible path parser** | `directSelectTool.ts` | Node-editing any imported/relative/H-V-S-Q-T-A path mangles geometry |
| C8 | **Free-transform/rotate drops a PDF-imported element's `matrix()`** | `freeTransformTool.ts`, `ControlBar.tsx` | Rotating imported text/paths throws away translate+scale → data loss |

### Honourable-mention highs (the chained failures the owner predicted)
- **Stale selection after undo-to-empty** → escalates to real loss: **Ctrl+D
  resurrects deleted elements**; **Delete on phantoms wipes the redo stack**.
  *(verified by me: 0 elements on canvas, inspector says "3 SELECTED")*
- **Document Setup is a complete no-op** — page size never changes. *(verified by me)*
- **Cross-layer group + undo dumps all elements into one layer** — the other
  layer is silently emptied. *(verified by me)*
- **Layer hide/lock bypass undo** but still affect export → hidden content baked
  into output with no dirty flag.
- **Paste/duplicate a group → duplicate element IDs** → invalid exported SVG.
- **Open SVG / New leave stale `SourcePdfStore.primary`** (~10 MB pinned) and
  stale phantom layer rows.
- **Status-bar +/- zoom buttons are dead**; **plain mouse-wheel always zooms**
  (no scroll-to-pan).
- **Pen tool can't make cusps/asymmetric handles** (Alt ignored) — confirms bead
  `t7u`; **no S/s smooth output** — confirms `9hu`.
- **"Mostly-outlined" badge never fires on the primary `Open PDF…` path** (only on
  background-layer import) — defeats the feature where it matters most.

---

## 4. Root causes — 175 findings → ~6 levers

This is the key insight for the salvage decision. The bugs are not scattered
randomly; they cluster:

1. **Coordinate-frame confusion (local vs doc space).** Transform tools hand-roll
   local↔doc mapping and special-case "single untransformed element," so anything
   with a pre-existing `matrix()` (every PDF-imported element) corrupts. → C8,
   reflect, multi-scale. *Fix: one `toLocalFrame()`/`composeTransform()` helper.*
2. **Mutations that bypass the command/history system.** Gradient `<defs>`, layer
   hide/lock, add-layer z-order, ungroup transform. → undo desync, silent export
   divergence, C4. *Fix: enforce "every document mutation is a Command."*
3. **Selection never reconciled with history.** `undo/redo` don't prune the
   `selected[]` array of detached nodes. → phantom selection, Ctrl+D resurrection,
   redo-stack wipe. *Fix: snapshot/prune selection in CommandHistory.*
4. **Split keyboard ownership.** Three uncoordinated window listeners + one coarse
   `keyboardCaptured` boolean. → C6, shortcuts fire while a `<select>` is focused,
   Ctrl combos leak mid-text-edit. *Fix: a single keyboard dispatcher + one
   "is-editable-target" predicate.*
5. **State that's never torn down + operations that aren't Commands.** SourcePdfStore
   not cleared on Open/New/delete; import isn't undoable. → C1, 10 MB leaks, stale
   panels. *Fix: wire teardown; make import an undoable Command.*
6. **One genuinely wrong module + one hand-rolled subsystem.** The `directSelect`
   path parser (C7 — rebuild on the existing `parsePathD`) and the hand-rolled
   text caret/measurement in `textTool` (the only "rework," not "fix").

Plus dead weight to delete: `areaText.ts`, `iconKeyForTool`, `ToolConfig.icon`,
`theme/atrium.ts` (4 unused palettes), the count-based deletion API, "brush"/"knife"
"coming soon" rail slots, the WIP `console.log` in `pdfExport.ts`.

---

## 5. Per-subsystem scorecard

| Subsystem | Audit grade | Salvage | Journey (experiential) |
|---|---|---|---|
| geometry-core | **B — solid** | keep | — |
| graft-engine | **B — solid** | keep | — |
| tool-infra | B | fix | — |
| fonts | B | fix | — |
| selection / transform | C | fix | transform: works-with-friction |
| draw-tools | C | fix | properties: friction; tool-switch: friction |
| properties-ui | C | fix | works-with-friction |
| app-shell | C | fix | save-open / zoom-pan: partly-broken |
| pdf-io | C | fix | pdf-import: friction |
| commands-state | C | fix | undo-redo: friction; clipboard: friction; align-zorder: partly-broken |
| panels-chrome | C | fix | layers-pages: partly-broken |
| **node-editing** | **D — needs-rework** | rebuild on `parsePathD` | pen-bezier: friction |
| **(text editing)** | (inside draw-tools) | **rework** | **pdf-text-edit: BROKEN** |

No subsystem graded F. Eleven of twelve are "fixable"; one ("node-editing") needs
its path parser rebuilt on machinery that already exists elsewhere in the repo.

---

## 6. The headline-use-case problem (needs a product decision)

The pivot says the tool exists to *edit a Word-generated PDF and be done*. Today:

- Import preserves real, editable text (good) — **but** it arrives fragmented into
  ~one `<text>` run per glyph/word, each wrapped in its own `<g>`.
- **Clicking text selects the wrapping `<g>`** (generic shape props — no font, no
  size, no text-content field). **Double-click does not enter edit mode.**
  Retyping is a no-op. There is **no text-edit affordance at all.**
- Even the gate test-suite can't select text via the UI — it mutates the DOM
  directly (that's what bead `vectorfeld-qj7` is about).

So the export/round-trip half of the use case works; the **edit interaction** half
does not exist yet. This is the one place where "fix vs rework" is a real choice:
it needs a designed text-edit model (select inner text, edit content/font/size,
re-shape via the graft engine that already exists), not a patch. Recommend treating
it as the **#1 product feature**, distinct from the bug backlog.

---

## 7. Recommended path forward

**Phase 0 — stop the bleeding (data-loss criticals), ~3–5 days.**
C1 (warn/guard + make import undoable), C4 (ungroup keep transform), C5 (eraser
undo), C6 (text-edit keyboard capture), the stale-selection trio (#3 root cause).
These are the ones that destroy work; ship them first.

**Phase 1 — root-cause levers, ~1–1.5 weeks.**
Root causes 1–5: the coordinate-frame helper (kills C8 + reflect + multi-scale),
"every mutation is a Command" (gradients, layer hide/lock, add-layer), single
keyboard dispatcher, SourcePdfStore teardown, paste id-uniquification. Rebuild the
directSelect parser on `parsePathD` (C7).

**Phase 2 — the core feature + polish, ~1–1.5 weeks.**
Design and build PDF text editing (§6). Fix Document Setup, zoom buttons,
mostly-outlined-on-main-path, layer-list ordering, pen cusps/S-curves. Delete the
dead code. Wire `window.__vfTest` (`qj7`) so the gate suite stops DOM-poking.

**Throughout:** the failures slipped past **827 green unit tests** because the
tests feed only happy-path shapes (absolute M/L/C paths, untransformed elements).
Add fixtures that mirror real producer output (imported `matrix()` elements,
relative/H-V-S path data, cross-layer selections) and the regressions get pinned.

**Estimated total: 3–4 focused weeks** to go from "ready to dump" to "solid casual
PDF editor." That is dramatically less than a rewrite, and it keeps the correct core.

---

## 8. Artifacts

- `test/review/_driver.mjs` — reusable headed/headless review driver
- `test/review/scenarios/*.mjs` — every scenario script the agents wrote
- `test/review/shots/*.png` — step-by-step screenshots + exported-PDF renders
- `test/review/out/audit-result.json` — full static audit (109 findings)
- `test/review/out/exp-result.json` — full experiential results (66 findings)
- `test/review/out/merged-backlog.json` — ranked master backlog (175 findings)
- `test/review/out/audit-summaries.md` — per-subsystem architecture write-ups
