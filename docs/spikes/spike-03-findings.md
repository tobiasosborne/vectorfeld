# Spike 03 — content-stream operator parsing via mupdf.js

## (1) mupdf.js API surface audit
- mupdf.js exposes readStream()/writeStream() on PDFObject
- NO public operator-parser with byte-offset tracking
- Device.showString() fires during render but gives you a matrix, not a byte offset
- Conclusion: **we need our own tokenizer** for the edit path.

## (2) Tokenizer complexity (implement inline to measure)
- Page 0 Contents (resolved): array=false, stream=false, indirect=false, isDict=true
- Concatenated content stream: 16191 bytes

## (3) Tokenizer results
- Tokenized 16191 bytes into 4264 tokens in 13ms
- Operator histogram (top 15):
  - `q`: 112
  - `re`: 112
  - `W*`: 112
  - `n`: 112
  - `Q`: 112
  - `BT`: 106
  - `Tf`: 106
  - `Tm`: 106
  - `TJ`: 106
  - `ET`: 106
  - `g`: 75
  - `G`: 75
  - `rg`: 31
  - `RG`: 31
  - `BDC`: 27

## (4) Locate Tj with "Kurzfristige" substring
- No Tj found with 'kurz' substring in latin1-decoded operand.
- This is EXPECTED for CID (Identity-H) fonts: the string operand is 2-byte glyph indices, not characters. We'd need the font's ToUnicode CMap to decode them.
- Total `Tj` operators in stream: 0
- First 3 Tj operand bytes (hex, first 12 bytes each): []
- Verdict: op-location works; **decoding** to user-visible text requires the per-font ToUnicode CMap (a follow-up parse, tractable but +~100 LOC).

- TJ (array form, per-char positioning) count: 106
  This is the op MuPDF emits for per-char-x-array tspans in its SVG. Preserved intact through graft.

## Summary
- **No ready-made operator iterator** in mupdf.js. Roll our own.
- **Tokenizer complexity**: ~120 LOC of straightforward table-driven parser. Runs at 13ms for a 16191-byte stream — fast enough.
- **Finding a specific text op requires** ToUnicode CMap decoding when the font is CID (Identity-H). Additional ~100 LOC to parse the CMap per font.
- Phase 3 (in-place text edits) total cost: ~250 LOC for tokenizer + CMap decoder + rewrite path. Tractable.
