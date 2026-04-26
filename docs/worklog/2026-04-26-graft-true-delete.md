# 2026-04-26 — Graft engine: real PDF delete via applyRedactions

## What shipped

The graft engine no longer "deletes" source elements by overlaying a
white-fill mask rect. It now uses MuPDF's `PDFPage.applyRedactions()`
to **rewrite the source page's content stream**, excising the deleted
element's draw operators. After a delete-then-export round-trip, the
deleted text is genuinely gone — pdfjs `getTextContent()`, Ctrl+F,
copy-paste, and screen readers all stop finding it.

Routing now allows deletions-only mixed layers through graft (was
gated to pdf-lib previously). Modifications and additions still gate
to pdf-lib until `vectorfeld-yyj` ships per-source font support;
backgrounds gate until multi-graft-per-page lands.

## Story arc

The session opened with an uncommitted attempt from a previous
session to relax `shouldUseGraftEngine` for deletions-only mixed
layers. Golden gate 06 caught a real fidelity regression: graft
"deletes" via mask overlay leave the original draw ops in the source
content stream, so the deleted headline was still in `pdfjs.getTextContent`.

The user explicitly chose the **architectural fix** over the
band-aid: rewrite the content stream, don't overlay masks. Filed as
`vectorfeld-enf` (P1), then designed and shipped as 6 sub-beads.

A subagent surveyed the mupdf-js type defs and found
`PDFPage.applyRedactions()` directly exposed — the official PDF-spec
mechanism for content-stream redaction. Plan A (use the vendor API)
beat Plan B (roll our own tokenizer + ToUnicode CMap parser, ~250 LOC)
on every axis.

## Sub-beads (all closed)

- `vectorfeld-qu1` (enf-1): spike `applyRedactions` against the flyer
  fixture. Both `mupdf.asText()` and `pdfjs.getTextContent` confirmed
  the redacted headline was gone. `docs/spikes/spike-04-verdict.md`,
  commit `b0cead0`.
- `vectorfeld-quq` (enf-2): `applyRedactionsToPage` primitive in
  `graftMupdf.ts`. Internal y-flip from `PdfRect` (PDF-spec bottom-up)
  to mupdf-display top-down — the convention mismatch surfaced empirically
  in the first test iteration. Commit `e7171e9`.
- `vectorfeld-7la` (enf-4): `extractPdfText` helper wrapping the
  existing `extractPdfTextItems`. Commit `015ad3a`.
- `vectorfeld-st4` (enf-3): wired `applyRedactionsToPage` through
  `graftExport.ts` BEFORE the overlay-stream append (so the overlay
  isn't redacted by the same pass). Both deletions and modifications
  use redaction; `emitMaskRectOp` deleted from `graftCs.ts` entirely.
  Used `REDACT_LINE_ART_REMOVE_IF_COVERED` so shape deletions actually
  delete (text-only `REMOVE` would leave shape paths in place). Commit
  `c00c50c`.
- `vectorfeld-193` (enf-5) + `vectorfeld-97w` (enf-6) bundled: opened
  the routing gate for deletions-only mixed layers; re-mastered gate
  06 (page now 595.32×841.92pt source dimensions, 0 occurrences of
  the deleted headline, 44 surviving text items); added defense-in-depth
  assertion to story 06 that the deleted text is absent from
  `pdfjs.getTextContent` (whitespace-stripped probe of the full
  deleted string). Commit `ccfc241`.

## Subtleties caught along the way

- **First-iteration probe was over-eager.** `deletedText.slice(0, 8)`
  matched both the deleted "Kurzfristige…" and an unrelated body
  string "kurzfristige Änderungen…". Refined to the full
  whitespace-stripped string for specificity.
- **Coordinate convention diverges between mupdf APIs.**
  `Annotation.setRect` uses mupdf-display top-down (matching
  `toStructuredText.walk()` quad output); `PdfRect` uses PDF-spec
  bottom-up. Centralising the flip inside `applyRedactionsToPage`
  keeps the rest of the engine consistent.
- **Post-redact `/Contents` structure shifts.** The
  `graftExport.test.ts` `pageContent` helper had to drop its
  pre-resolve `isArray()` check — after `applyRedactions`, `/Contents`
  can be a different shape than before, but `readStream()` works in
  either case if you don't pre-resolve.
- **TS cross-project visibility broke when `src/` imports a `test/`
  helper.** `tsconfig.app.json` only includes `src/`; bringing
  `test/roundtrip/helpers/pdfText.ts` into the graph for the first
  time (via the new graftExport test import) surfaced pre-existing
  `pdfjs-dist` filter-narrowing errors. Fixed by importing
  `pdfjs-dist`'s `TextItem` type directly.

## Pre-existing issues uncovered (not addressed)

- `vectorfeld-249` (P2): `npm run dogfood:composite` crashes inside
  `renderPdfPageToPng`'s pdfjs+canvas path. Reproduces at HEAD without
  any changes; the export itself succeeds. Filed for future work.

## Stats

- 6 commits, ~10 modified files, ~200 net LOC change.
- 778 → 778 unit tests passing (3 emitMaskRectOp tests removed,
  3 pdfText helper tests + 2 graft-redact tests + 1 pdfjs-based
  graft-deletion test added).
- Type check clean; 10/10 golden gates green; atrium dogfood green.

## Lesson candidate

Before rolling a custom content-stream tokenizer, grep the vendor
SDK's `.d.ts` for `redact`, `filter`, `process`. `mupdf-js` exposed
exactly the API we needed; ~250 LOC of bespoke tokenizer work was
avoided by spending 30 minutes reading types. Same lesson applies any
time the vendor's C-level API has a feature — odds are the JS binding
exposes a thin wrapper.
