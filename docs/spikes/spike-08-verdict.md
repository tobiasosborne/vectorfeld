# Spike 08 — source-font extraction for eb0 (in-place source-font edits)

**Verdict:** PASS. End-to-end feasibility confirmed. Extracting the
embedded `FontFile2` stream from a source PDF, handing the bytes to
fontkit, and re-emitting a shaped TJ stream that round-trips through
both mupdf and pdfjs all work cleanly. eb0 is implementable without
any custom font-program parser or hand-rolled CID-dict construction.

## What we tested

`scripts/spike/08-source-font-extract.mjs` against the flyer fixture
(`test/dogfood/fixtures/Flyer Swift Vortragscoaching 15.04.2026 noheader.pdf`):

1. Open via `mupdf.PDFDocument(srcBytes)`.
2. Walk page 0 `/Resources/Font` — find F1..F5 (4 embedded + 1 std).
3. For each font, descend through `/FontDescriptor/FontFile2` (Type-0 fonts route via DescendantFonts[0] first), `readStream().asUint8Array()` to get the decoded font program bytes.
4. `fontkit.create(bytes)` on every extracted program.
5. Pick the largest font (Calibri-Bold, 7048 glyphs), `font.layout('Vortrag')` for shaped GIDs.
6. Build a new mupdf doc, embed via `out.addFont(extractedFont)`, emit Identity-H TJ with the layout's GIDs, save.
7. Reopen — both `mupdf.toStructuredText.asText()` AND `pdfjs.getTextContent()` decode "Vortrag".

## Results

| Step | Outcome |
|---|---|
| Page-font enumeration | 5 fonts (`/F1`..`/F5`) — F1 is the standard `TimesNewRomanPSMT` (no embedded program), F2..F5 are subsets `BCD{E,F,G,H}EE+Calibri{,-Bold,-BoldItalic}` |
| `FontFile2` extraction | 4/5 — F1 skipped (not embedded), the other four returned 105 KB to 320 KB of TTF program bytes |
| `fontkit.create()` | All 4 accepted. `postscriptName`s: `Calibri`, `Calibri-Bold`, `Calibri-BoldItalic`, `Calibri-Bold` (twice — F2 simple-encoded, F3 Type-0, both reference the same subset) |
| `font.layout('Vortrag')` | 7 glyphs returned, all non-`.notdef` (gid > 0) |
| `mupdf.addFont(extracted)` | Same Type-0 / Identity-H / `/ToUnicode` shape verified in spike-05 |
| `mupdf.asText()` re-read | "Vortrag" ✓ |
| `pdfjs.getTextContent()` re-read | "Vortrag" ✓ |
| Output size with `subsetFonts()` | 14,305 bytes — tiny, including the full Calibri-Bold subset |

## Implications for eb0

- **No custom parser needed.** The mupdf JS binding exposes
  `PDFObject.readStream()` which decodes the FontFile2 stream
  filters automatically. Hand-rolled deflate/Flate decoder averted.
- **No hand-built CID dict needed** for source fonts either.
  `mupdf.addFont(font)` (validated in spike-05) builds the full
  Type-0 wrapper + ToUnicode CMap from any TTF, including
  pre-subsetted source TTFs.
- **Fontkit handles subset programs.** Pre-subsetted fonts (e.g.
  Carlito with only 50 glyphs out of 1500) are valid TTFs and
  fontkit reports the full hmtx + GSUB + GPOS tables for whatever
  is present.
- **Glyph-coverage check is mandatory.** `font.glyphForCodePoint`
  returns the .notdef glyph (gid=0) for chars missing from the
  subset. eb0 must check coverage before emitting and fall back
  to Carlito (or refuse the edit) when a char isn't in the source
  subset. This is the single new failure mode.

## Architecture sketch (sub-bead decomposition)

A 5-bead chain. Total ~300 LOC matching the parent estimate.

1. **eb0-1: source-font extraction primitive.**
   `src/model/sourceFont.ts` — `extractEmbeddedFontBytes(srcDoc,
   srcPageIdx, fontKey)` → `{ bytes: Uint8Array, baseFont: string,
   subtype: 'Type0' | 'TrueType' | 'Type1' } | null`. Tests on
   the flyer fixture for all 5 page-0 font keys.

2. **eb0-2: source-font matching from SVG attributes.**
   `matchSvgFontToSource(textEl, srcDoc, srcPageIdx)` →
   `{ fontKey: string } | null`. Walks the source's page font
   dict, matches by `(BaseFont, font-family, font-weight,
   font-style)`. Returns the source-font key or null when the
   element's font isn't embedded (e.g. TimesNewRomanPSMT) or no
   match found. Falls back to "no source font available, use
   Carlito" semantics.

3. **eb0-3: multi-font registry in graftExport.**
   Generalize `makeSingleFontRegistry` (`src/model/graftExport.ts`)
   to a multi-font registry keyed by source-font key. The
   `FontRegistry.resolveFontKey(family, style, weight)` lookup
   now picks between Carlito (for new content) and the matched
   source font (for modifications). Each unique source font gets
   one `registerCidFont` call.

4. **eb0-4: routing — emit modifications via source font when
   coverage allows.**
   In `emitText` / `emitLayerOverlay`, when the text element is
   classified as modified-source-text:
     - try `matchSvgFontToSource` → get fontKey
     - extract bytes via eb0-1 → register via eb0-3
     - shape via fontkit using the source font
     - check glyph coverage; if any char is .notdef, fall back
       to Carlito for THIS run (don't disable source-font for
       the rest)
   New routing test: modify a source Calibri-Bold headline;
   assert pdfjs reports `fontName` belongs to Calibri-Bold (not
   Carlito).

5. **eb0-5: gates + worklog.**
   Re-master gate 10 once eb0-4 lands (the recolored headline
   now stays in Calibri-Bold instead of switching to Carlito —
   the visible seam closes). Add a new gate that asserts the
   recolored text uses the source font, not Carlito (defense in
   depth via canonical fontName check). Worklog + lessons +
   AGENTS update.

## What's NOT in scope for eb0

- Source-font edit propagation into the GRAFTED page's
  CONTENT stream (replacing the existing TJ ops in place,
  byte-for-byte). Today's design redacts the source ops and
  appends an overlay using the source font. Visually
  indistinguishable from in-place edit when subsetting and
  positioning are correct. True in-place TJ rewriting is a
  separate (much harder) bead — would need the spike-3
  tokenizer and would only matter for downstream tools that
  read content-stream order (e.g., reflow PDFs or extract
  font usage stats by region). Not on the casual-PDF-edit use
  case's critical path.

- Compositing case (multiple source PDFs): wait for the multi-
  graft-per-page work (`vectorfeld-eb0` doesn't unblock that).

## Next steps

File 5 sub-beads under `vectorfeld-eb0`. Start with eb0-1 (the
extraction primitive), then eb0-3 (multi-font registry, low risk),
then eb0-2 (font matching), then eb0-4 (routing + behavior change,
where the gate impact lives), then eb0-5 (gates + bookkeeping).

eb0-1, eb0-2, eb0-3 can land in parallel after this spike (they
have no inter-dependency); eb0-4 depends on all three.
