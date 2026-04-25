# 2026-04-25 — Session: graft engine end-to-end (4 beads + epic close)

The graft Phase 2 chain shipped to its natural milestone: the engine
exists, end-to-end, as a verified module. Four beads landed —
`vectorfeld-uuz`, `ne4`, `e1j`, `hnj` — plus the parent epic `wjj`
closed. Then I paused before `u7r` (production wiring) on a deliberate
scope-mismatch concern; new bead `vectorfeld-1kp` filed to bridge.

End state: **746 unit tests · tsc clean**. Same gate posture as session
start (engine isn't on the production export path yet).

## Beads closed (4)

| Bead | Title | Commit | Tests +/− |
|---|---|---|---|
| `vectorfeld-uuz` (wjj-6) | PDF content-stream emitter — shapes | `0f3b468` | +37 |
| `vectorfeld-ne4` (wjj-8) | Append overlay content stream + register font | `f95b4d2` | +8 |
| `vectorfeld-e1j` (wjj-7) | PDF content-stream emitter — text + tspan | `30ff4cf` | +22 |
| `vectorfeld-hnj` (wjj-9) | exportViaGraft engine entry point | `1cd7f71` | +8 |
| `vectorfeld-wjj` (epic) | New engine: src/model/graftExport.ts | (meta) | — |

## What the engine does now

`src/model/graftExport.ts` exports `exportViaGraft(doc, store, opts)`
that walks document layers and dispatches per `classifyLayer`:

- **graft** layers → `graftSourcePageInto` (byte-for-byte source clone).
- **mixed** layers → graft + per-modified `emitMaskRectOp` + re-render
  via `dispatchLeaf` + per-new-leaf overlay.
- **overlay** layers → `addBlankPage` sized to the document viewBox +
  walk subtree composing ancestor transforms + emit shapes/text via the
  graftCs primitives + flush via `appendContentStream`.

Font handling: `SINGLE_FONT_REGISTRY` registers Carlito on each page
that needs new text (caller supplies `opts.carlito` bytes). Layers
without text never trigger registration; layers WITH text but no font
opt throw a clear actionable error.

Determinism: byte-identical output across two calls with the same
input, verified by an explicit test.

## Architectural decisions captured in code

1. **Per-shape decomposition to PathCommand[]**: rect/line/circle/
   ellipse all decompose to mm-space path commands then transform each
   point individually. Diverges from `pdfExport.ts` (which uses
   pdf-lib's higher-level draw* primitives that axis-align under
   rotated parents) by being CORRECT under rotation. The mask-rect is
   the only `re` emitter — it's inherently axis-aligned in PDF-pt.

2. **Absolute Tm for text positioning**: every text run starts with
   `1 0 0 1 x y Tm` rather than tracking Td deltas. Matches drawText's
   "every call resets position" semantics; trivially correct for the
   per-character x-array case.

3. **State-change suppression** in `emitText`: `Tf` and `rg` only
   re-emit when the run-to-run value actually changes. A 30-character
   per-char-x tspan emits 1 Tf + 1 rg + 30 Tm/Tj pairs, not 30 of
   each.

4. **Determinism via `fmt`**: 3-decimal precision with trailing-zero
   strip applied to every number that goes into the content stream.
   Matters for golden masters once the engine is on the production
   path.

5. **MVP scope: one page per layer**. Documented in `graftExport.ts`
   header. The engine emits a fresh PDF page per processed layer. For
   the canonical "one PDF + zero or one overlay" case this is exactly
   right; for the compositing case (foreground + background PDFs on
   one artboard) it produces a 2-page output instead of 1, which is
   the regression `vectorfeld-1kp` exists to close before u7r wires
   the engine in.

## TDD findings worth keeping

- **`addPage` doesn't insert into `/Pages`** — must follow with
  `out.insertPage(out.countPages(), pageObj)` or `findPage` throws
  "malformed page tree". Found via the multi-layer overlay test in
  hnj. Documented inline in `addBlankPage`.

- **mupdf preserves stream FlateDecode on save** — `compress=no` save
  option doesn't decompress existing streams. To inspect the bytes the
  engine emitted, walk `/Contents` and call `readStream()` on each ref
  via a `pageContent()` helper. Documented in graftExport.test.ts.

- **pdf-lib's exported PDFs use array `/Contents`** — so the
  "wrap-single-ref" branch of `appendContentStream` isn't exercised by
  fixtures generated via `exportSvgStringToPdfBytes`. Tested it via
  `forceSingleContents()` test helper that unwraps the array first;
  real-world PDFs (verified in spike-02 against the flyer) routinely
  have single-ref `/Contents`.

- **Triple-slash `<reference types="node" />`** scopes node types to a
  single test file when `tsconfig.app.json` doesn't include `node` in
  `types`. Avoids polluting the whole app config just to read a font
  fixture from disk in tests.

## Why the chain stopped at hnj (not u7r)

`u7r`'s job is to swap the production `exportPdf` to use the new
engine when source PDFs are present. With the engine's MVP scope of
"one page per layer", swapping NOW would turn a 1-page composite
output into a 2-page PDF — a functional regression for the
foreground-background dogfood case.

Filed `vectorfeld-1kp` (single-page-stacking when layers share
artboard) as a P2 dep on u7r. Once 1kp lands, u7r becomes a clean
swap with no functional regression — only a byte shift on story 05's
golden master, which the gate-discipline cycle handles via re-record
+ dogfood verification.

## Numbers

- **Tests**: 671 → **746** (+75 across 4 new test files: `graftCs.test.ts`,
  `graftMupdf.overlay.test.ts`, `graftCsText.test.ts`,
  `graftExport.test.ts`).
- **New source modules**: 2 (`graftCs.ts`, `graftExport.ts`); +74 LOC
  to existing `graftMupdf.ts`.
- **Lines net**: ≈ +1,800 in src/test, ≈ +130 in docs.
- **Commits on main**: 4 (`0f3b468` uuz, `f95b4d2` ne4, `30ff4cf` e1j,
  `1cd7f71` hnj). Plus one bead-only close commit for `wjj` epic.

## Files to know in the next session

- **`src/model/graftCs.ts`** — pure emitter module: parseColor,
  emitMaskRectOp, emitRect/Line/Circle/Ellipse/Path, FontRegistry,
  emitText. 403 LOC including helpers.
- **`src/model/graftExport.ts`** — engine entry point.
  exportViaGraft + per-layer processors + walkLayer + dispatchLeaf.
  299 LOC.
- **`src/model/graftMupdf.ts`** — extended with appendContentStream
  + registerOverlayFont. Total 138 LOC.
- **`src/model/graftExport.test.ts:11-42`** — `pageContent()` helper
  is the canonical way to inspect what the engine emitted (bypasses
  FlateDecode via direct `readStream()`).

## Open beads (live `bd ready` after this session)

P2 graft chain (in dependency order, NEW dep noted):
- `vectorfeld-1kp` — **NEW**: Single-page-stacking when layers share
  artboard. Blocks u7r. ~150 LOC.
- `vectorfeld-u7r` — Wire graftExport into fileio.ts exportPdf.
  Now depends on 1kp.
- `vectorfeld-6d0` — Real-flyer byte-diff round-trip test (depends on
  u7r).

P2 graft Phase 3 (now reachable; were blocked by wjj):
- `vectorfeld-yyj` — fontkit shaping for new (non-source) text.
- `vectorfeld-eb0` — In-place source text edit via grafted source font.

P2 unrelated to graft:
- `vectorfeld-4w7` — multi-doc UI tabs.
- `vectorfeld-2ss` — Paste in Place (Ctrl+Shift+V).
- `vectorfeld-6z0` — Yellow-BG composite white-margin / clipping.
- Golden gate stories 6–10 still open.

## Recommended next-session pointer

`vectorfeld-1kp` (single-page-stacking) is the natural next step on
the graft critical path. Read `graftExport.ts:71-81` for the per-
layer dispatch loop — that's where the grouping logic lands. The key
change: instead of treating each layer as independent, group by
target output page (consecutive graft/mixed/overlay layers go to the
same page until a layer demands a new one). Once 1kp closes, u7r is a
~30 LOC swap.

Alternatively: `vectorfeld-u7s` (Golden gate story 06: PDF import +
delete one text run + export PDF) is a self-contained story-write
task that doesn't touch the graft chain.
