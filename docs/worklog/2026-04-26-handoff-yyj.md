# 2026-04-26 — Handoff: vectorfeld-yyj (graft text shaping)

This is a handoff log. The current session shipped `vectorfeld-enf`
(graft true-delete via `applyRedactions`) and `vectorfeld-249`
(switched the dogfood PDF renderer from pdfjs+node-canvas to
mupdf-js). Main is at `668b106` with **778 unit tests + 10/10 golden
gates + dogfood:composite + dogfood:atrium all green**.

The next agent should read this, then `bd ready` and pick up
**`vectorfeld-yio` (yyj-1, the spike)** as the first move.

## Why yyj is next

After `enf`, the routing gate in `src/model/fileio.ts:shouldUseGraftEngine`
accepts pure-graft AND deletions-only mixed layers. Modifications
and additions still gate to pdf-lib because the graft engine emits
text via `emitText` in `src/model/graftCs.ts` using simple-encoded
WinAnsi `Tj` ops — no GSUB ligatures, no GPOS kerning. Pdf-lib's
text path goes through `embedFont`/fontkit which DOES shape with
GSUB/GPOS, so pdf-lib output for new/edited text looks better.

`vectorfeld-yyj` closes that gap. After yyj, graft's text output is
shaped to professional-grade (full OpenType: kerning, ligatures,
contextual alternates, etc.), and routing relaxes to allow
additions-only mixed layers (and likely modifications too).

The user explicitly chose **full OpenType, no kerning-only Plan B,
no band-aids** during the planning conversation. Carry that
constraint forward.

## Bead chain

The parent `vectorfeld-yyj` was elevated to P1 and its `--design`
field carries the full architecture rationale (read it via
`bd show vectorfeld-yyj`). 9 sub-beads filed:

| Bead | Title | Acceptance signal |
|---|---|---|
| `vectorfeld-yio` (yyj-1) | spike mupdf `addFont` semantics + TJ glyph-index roundtrip | Spike script confirms `addFont` returns Type-0 Identity-H + TJ hex extraction round-trips through mupdf AND pdfjs |
| `vectorfeld-of4` (yyj-2) | fontkit shaping helper | `shape('office', carlito)` produces a ligature glyph; `shape('Ta', carlito)` produces a kerning adjustment |
| `vectorfeld-7t7` (yyj-3) | `registerCidFont` primitive in graftMupdf | Page `/Resources/Font/<key>` resolves to a Type-0 dict in saved bytes |
| `vectorfeld-33a` (yyj-4) | rewrite `emitText` to use shaping + TJ glyph indices | `emitText` for 'office' produces TJ with ligature glyph hex; for 'Ta' produces TJ with numeric inline adjustment |
| `vectorfeld-giz` (yyj-5) | ToUnicode CMap fallback (conditional) | Closed-as-unneeded if yyj-1 finds `addFont` auto-attaches; otherwise hand-build CMap |
| `vectorfeld-87h` (yyj-6) | relax routing for additions/modifications | `fileio.exportPdf.test.ts` MODIFIED + NEW tests assert graft (page sized to source) |
| `vectorfeld-ufg` (yyj-7) | golden gate stories — new shaping/ligature gate + re-master | `npm run golden` green; new gate verifies ligature glyphs present |
| `vectorfeld-clw` (yyj-8) | font subsetting via `subsetFonts` (P3 optimization) | Output PDF size drops >50% on the gate fixture; all yyj-7 assertions still pass |
| `vectorfeld-ahx` (yyj-9) | worklog + lessons + AGENTS.md update | Standard handoff bookkeeping at session close |

Dependency DAG:

```
yio (spike)
 ├── of4 (fontkit helper)
 │    └── 33a (emitText rewrite)
 ├── 7t7 (CID font registration)
 │    └── 33a (emitText rewrite)
 │         └── 87h (routing relax) ← also depends on giz
 │              └── ufg (gates)
 │                   ├── clw (subset, optional)
 │                   └── ahx (worklog)
 └── giz (ToUnicode, conditional) ──── 87h
```

## Riskiest unknown — `addFont` semantics

`mupdf.d.ts:483-485` exposes three font-embedding paths:
- `addSimpleFont(font, encoding)` — what we use today (1-byte WinAnsi)
- `addCJKFont(font, lang, wmode?, serif?)` — Type-0 for CJK
- `addFont(font)` — undocumented in the .d.ts, presumably Type-0 for non-CJK

Plan A bets that `addFont(carlitoFont)` produces a Type-0 / CID-keyed
font with Identity-H encoding AND a `/ToUnicode` CMap suitable for
glyph-index TJ emission. **Spike yyj-1 (`vectorfeld-yio`)
confirms or refutes this in 30-60 minutes.** If `addFont` returns a
SimpleFont or omits ToUnicode, fall to Plan A':
1. Hand-roll the Type-0 CID font dict via `outDoc.newDictionary()` /
   `put` calls. mupdf still helps with the embedded font program
   stream; we just construct the wrapper /Type0 + /CIDFontType2 +
   /Encoding + /CIDSystemInfo dicts ourselves.
2. Build the `/ToUnicode` CMap stream from fontkit's `Font.cmap`
   (or fall to the fallback in yyj-5).

**Plan B (kerning-only via simple-encoded TJ adjustments) is rejected.**
Don't reach for it even under deadline pressure — the user's hard
requirement is full OpenType functionality.

## Where to start

```bash
bd ready                                 # confirm yyj-1 is unblocked
bd update vectorfeld-yio --claim         # claim yyj-1
```

Then write `scripts/spike/05-cid-fonts.mjs`. The skeleton is
documented in the yyj-1 acceptance criteria. Use the existing spike
shape from `scripts/spike/04-redactions.mjs` as a template.

After the spike succeeds (or fails — both are publishable findings),
write `docs/spikes/spike-05-verdict.md`, commit, push, close
`vectorfeld-yio`. Then proceed with `of4` and `7t7` in parallel
(they don't depend on each other).

## Constraints carried forward (from this session)

- **Never silently re-record a golden master.** Inspect the pending
  output for correctness first; if a regression appears, file it as
  a P1 bead and decide explicitly. AGENTS.md is the source of truth.
- **For UI/canvas/PDF changes, dogfood through headed Chromium**
  before claiming done. Do not trust unit tests alone for visual
  fidelity — story 06's defense-in-depth pdfjs check is the model.
- **dogfood:composite is now green** (commit `668b106`) after the
  switch from pdfjs+node-canvas to mupdf-js. Don't reintroduce
  node-canvas; mupdf handles the inline-image rendering path
  cleanly and is already a production dep.
- **Coordinate convention divergence in mupdf:** `Annotation.setRect`
  uses mupdf-display top-down (matches `toStructuredText.walk`
  quads); `PdfRect` is PDF-spec bottom-up. Centralize any flips in
  the primitive that talks to mupdf, not at the call sites. See
  `applyRedactionsToPage` in `src/model/graftMupdf.ts` for the
  pattern.
- **Vendor SDK before custom code.** Read `mupdf.d.ts` thoroughly
  before designing — `addFont`/`addCJKFont`/`subsetFonts` may all
  be load-bearing for yyj. The 250-LOC custom tokenizer averted in
  `enf` came from doing this. (Lesson captured at
  `docs/lessons.md:80-85`.)

## Session stats — what shipped before yyj starts

- `vectorfeld-enf` (P1) closed: graft true-delete via redactions.
- `vectorfeld-qu1` (spike), `quq`, `7la`, `st4`, `193`, `97w` all
  closed (the enf sub-beads).
- `vectorfeld-249` (P2) closed: dogfood renderer migrated.
- 8 commits on main: `5285d3a` checkpoint → `62f29f6` revert →
  `b0cead0` spike → `e7171e9` primitive → `015ad3a` pdfjs helper →
  `c00c50c` engine wire-up → `ccfc241` routing relax + re-master →
  `6a6268c` worklog/lessons → `668b106` dogfood renderer.
- 778/778 unit tests, type-check clean, 10/10 golden gates,
  dogfood:composite + dogfood:atrium green.
- 2 lessons added to `docs/lessons.md`.

## Final reminder

The user's standing constraint for this work track:

> "no hacky shit, no bandaids, no janky shit. always do the right thing."

Hold the line. If the spike falls and the path to full OpenType gets
hairy, file the complication as a bead and pause for a design
checkpoint with the user. Don't shortcut to Plan B without explicit
authorization.
