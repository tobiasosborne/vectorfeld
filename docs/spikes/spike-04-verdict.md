# Spike 04 — applyRedactions content-stream rewrite (vectorfeld-qu1)

**Verdict:** Plan A holds. mupdf-js's `PDFPage.applyRedactions()`
actually rewrites the source content stream — removes the text-show
operators inside the marked rect — and both `mupdf.asText()` and
`pdfjs-dist getTextContent()` confirm the redacted text is no longer
extractable.

## What we tested

`scripts/spike/04-redactions.mjs` against
`test/dogfood/fixtures/Flyer Swift Vortragscoaching 15.04.2026 noheader.pdf`:

1. Open via `mupdf.PDFDocument(bytes)`, walk `toStructuredText()`,
   collect chars at the maximum font size (24.96 pt — the headline
   "Kurzfristige Hilfe bei englischen Vorträgen").
2. Union the headline char quads into a bbox rect (with 0.5pt pad).
3. `page.createAnnotation('Redact')` + `annot.setRect(bbox)`.
4. `page.applyRedactions(false /* black_boxes */, 0 /* IMAGE_NONE */, 0 /* LINE_ART_NONE */, 0 /* TEXT_REMOVE */)`.
5. Save via `saveToBuffer('compress=yes')`.
6. Re-open, walk structured text again, also load via pdfjs and call
   `getPage(1).getTextContent()`.

## Results

| Metric | Pre-redact | Post-redact |
|---|---|---|
| `mupdf.asText()` length | 1029 chars | 981 chars |
| `mupdf.asText()` contains headline | Yes | **No** |
| `pdfjs.getTextContent` joined length | n/a | 802 chars |
| `pdfjs.getTextContent` contains headline | n/a | **No** |
| Content-stream byte length | 16191 | 16379 |
| Saved PDF byte length | 322982 | 326896 |

The content-stream got **larger** by ~188 bytes — counter-intuitive
but expected: mupdf inserts redaction-bookkeeping markers into the
stream alongside removing the text-show ops. Net file size grew by
~3.9 KB because the saved PDF also carries the (no-longer-applied)
Redact annotation object plus a regenerated cross-reference table.
None of this affects what's extractable.

## Cross-tool agreement

The mupdf and pdfjs reads agree: the headline is gone from BOTH
extraction paths. Critical because the golden gate
(`test/golden/canonicalize.mjs`) goes through pdfjs — if mupdf had
said "gone" but pdfjs still saw it, gate 06 would still fail.

## Implications for vectorfeld-enf

- The custom-tokenizer fallback (Plan B per the design doc) is not
  needed.
- The graft engine's existing `emitMaskRectOp` band-aid is
  superseded; deletions become a Redact-annot + applyRedactions step
  on the grafted page.
- Implementation surface is small: ~15 LOC primitive in
  `graftMupdf.ts`, swap one for-loop in `graftExport.ts`.
- The structured-text quad-union approach used here for finding the
  headline bbox is NOT what the engine does at delete time — the
  engine already has the bbox from the snapshot registry
  (`sourceSnapshot.ts:findRemovedElementBboxes`). Spike-time
  bbox-finding is just to drive the spike, not a production
  technique.

## What's next

`vectorfeld-qu1` (this spike) closes. Sub-beads enf-2..enf-8 land
the production change.
