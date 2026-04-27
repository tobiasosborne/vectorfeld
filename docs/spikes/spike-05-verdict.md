# Spike 05 — addFont() Type-0 + TJ glyph-index roundtrip (vectorfeld-yio)

**Verdict:** Plan A holds, fully and cleanly. mupdf-js's
`PDFDocument.addFont(font)` builds the complete Type-0 / CID-keyed
font wrapper we need — `/Subtype /Type0`, `/Encoding /Identity-H`, an
auto-attached `/ToUnicode` CMap, and a `/DescendantFonts[0]`
CIDFontType2 with full `/W` glyph-width array — and a TJ
glyph-index content stream round-trips through BOTH `mupdf.asText()`
and `pdfjs.getTextContent()` to the original source string.

## What we tested

`scripts/spike/05-cid-fonts.mjs`:

1. `out = new mupdf.PDFDocument()` (empty doc).
2. `font = new mupdf.Font('VfCarlito', carlitoBytes)`.
3. `fontRef = out.addFont(font)` — the candidate Type-0 path.
4. Inspect `fontRef.resolve()` — dump dict keys, walk into
   `DescendantFonts[0]`.
5. Compute GIDs via `font.encodeCharacter(codePoint)` for `'Hello'`,
   pack as 2-byte big-endian Identity-H hex.
6. Build a content stream `BT /F1 24 Tf 50 100 Td <hex> Tj ET`,
   register `/F1 → fontRef` in a fresh /Resources/Font dict.
7. `out.addPage([0,0,200,200], 0, resources, contentBuf)` +
   `insertPage(0, ...)`.
8. `saveToBuffer('compress=no')`.
9. Reopen via `mupdf.PDFDocument(savedBytes)`,
   `loadPage(0).toStructuredText('preserve-spans').asText()`.
10. Reopen via `pdfjs-dist getDocument(...).getPage(1).getTextContent()`.
11. Assert both extracted strings contain `"Hello"`.

## Results

`addFont` produces this Type-0 outer dict (verbatim from the saved
PDF, uncompressed):

```
3 0 obj
<</Type/Font/Subtype/Type0/BaseFont/VfCarlito
  /Encoding/Identity-H
  /ToUnicode 4 0 R
  /DescendantFonts[8 0 R]>>
endobj

4 0 obj
<</Length 24825>>
stream
/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
/CIDSystemInfo <</Registry(Adobe)/Ordering(UCS)/Supplement 0>>
…
endstream
```

DescendantFonts[0] (`8 0 obj`) is the CIDFontType2:

```
/Type /Font
/Subtype /CIDFontType2
/CIDSystemInfo <<dict>>
/BaseFont /Carlito-Regular
/FontDescriptor <<dict>>
/W [array len=1510]
```

| Acceptance | Result |
|---|---|
| `/Subtype /Type0` | ✓ |
| `/Encoding /Identity-H` | ✓ |
| `/ToUnicode` attached | ✓ (24,825-byte CMap stream, auto-built by mupdf) |
| `/DescendantFonts[0]` is `/CIDFontType2` | ✓ |
| `/W` glyph-width array present | ✓ (1510 entries — covers the full Carlito glyph set) |
| `font.encodeCharacter('H','e','l','o')` → `[15, 59, 1140, 111]` | ✓ |
| TJ stream `<000f003b04740474006f>` for "Hello" | ✓ |
| `mupdf.asText()` reads "Hello" | ✓ |
| `pdfjs.getTextContent()` reads "Hello" | ✓ |

Saved-PDF size with one 5-glyph word: 664,662 bytes. 99% of that is
the embedded Carlito font program — yyj-8 (`vectorfeld-clw`,
`subsetFonts`) will trim it.

## Implications for vectorfeld-yyj

- **yyj-5 (`vectorfeld-giz`) — close as unneeded.** Its conditional
  was "if `addFont` doesn't auto-attach `/ToUnicode`, hand-build a
  CMap from fontkit's cmap." mupdf attaches a comprehensive
  `/ToUnicode` automatically. No fallback path required.
- **yyj-3 (`vectorfeld-7t7`) `registerCidFont` primitive** is now
  trivial: it's the same shape as `registerOverlayFont` but calls
  `addFont(font)` instead of `addSimpleFont(font, 'Latin')`. The
  page-resources wiring is identical.
- **yyj-4 (`vectorfeld-33a`) `emitText` rewrite** can rely on
  `font.encodeCharacter(codePoint)` for the simple no-shaping case.
  The fontkit shaping helper from yyj-2 (`vectorfeld-of4`) supplies
  the GID stream when we want GSUB ligatures / GPOS adjustments;
  Identity-H emission stays the same regardless.
- **No Plan A' / hand-rolled CID dict needed.** The path planned in
  the worklog handoff (constructing /Type0 + /CIDFontType2 +
  /Encoding + /CIDSystemInfo dicts manually via `newDictionary()`
  / `put`) is averted. The whole thing is a one-liner.
- **Plan B (kerning-only TJ adjustments under simple-encoded fonts)
  is fully rejected** per the user's standing constraint and now
  per the data — we have a clean Type-0 path, full OpenType is
  reachable end-to-end.

## Caveats / next-up risks

- The 1510-entry `/W` array is comprehensive but the TTF program
  itself is the size driver. `subsetFonts()` (yyj-8) addresses this
  for production output. Don't ship without subsetting; the gate-06
  master would balloon by ~600 KB per embedded font otherwise.
- `font.encodeCharacter` returns the cmap GID — this is the
  unshaped lookup. For ligatures (`ﬃ`, `office` → `o-f-f-i-c-e`
  with `ffi`/`ffl` substitutions) we MUST go through fontkit's
  shaper (yyj-2). Don't accidentally ship a path that uses
  `encodeCharacter` for shaped emission — the spike uses it only
  to confirm Identity-H bytes round-trip.
- Carlito's `'l'` encodes to GID 1140, doubled in "Hello". The
  hex `<...04740474...>` looks suspicious to a human reader — it's
  not. Verified by both extractors decoding to "Hello".

## What's next

Close `vectorfeld-yio` and `vectorfeld-giz`. Pick up `vectorfeld-of4`
(fontkit shaping helper) and `vectorfeld-7t7` (registerCidFont
primitive) — they're independent and can land in either order.
Both unblock `vectorfeld-33a` (the emitText rewrite), which is the
big change.
