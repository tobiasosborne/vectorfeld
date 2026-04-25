# 2026-04-20 — TDD round-trip session

Closed both P1 PDF round-trip beads (`vectorfeld-9s9` export, `vectorfeld-cd2` import) plus two follow-on bugs surfaced during real-user verification (`vectorfeld-ape` WinAnsi crash, `vectorfeld-dns` real-PDF transforms+tspans). Built a vitest-based golden-fixture harness from scratch (`vectorfeld-5cu`) as the TDD scaffold. **461 → 509 tests green (+48 new).**

## Strategy

User asked for "best of Illustrator + Acrobat" — keep authoring power, add Acrobat-style PDF fidelity. Picked the load-bearing P1s (PDF round-trip) over feature work because the pivot's promise (open PDF → edit → export PDF without losing text) was visibly broken on 2026-04-20. User insisted on **red-green TDD discipline**, no CI workflows.

## Beads closed this session (5)

| ID | Title | What shipped |
|----|-------|--------------|
| `vectorfeld-5cu` | PDF round-trip golden-fixture test harness | `test/roundtrip/{fixtures,golden,helpers}/` scaffold; `normalizeSvg.ts` (10 tests, semantic SVG diff with id-strip + 2dp coord rounding + alphabetical attr sort); `renderPdf.ts` (4 tests, pdfjs-dist + node-canvas raster); `pdfPipeline.ts` (3 tests, MuPDF without the Worker hop). Extracted `renderPdfPageToSvg` from `pdfRender.worker.ts` into shared `src/model/pdfRender.ts` so tests can import without Worker shim. Installed pdfjs-dist + pixelmatch + pngjs + @types/pngjs. |
| `vectorfeld-9s9` | PDF export font fidelity | Built new pdf-lib-based engine in `src/model/pdfExport.ts` from scratch (text → path → rect/line/ellipse/circle/image → g+transform with full matrix composition via `matrix.ts`). Replaced production `exportPdf` end-to-end. Removed `jspdf` + `svg2pdf.js` from production import path (still installed; ah8 will clean). Added pdfjs-dist text-extraction helper (`extractPdfTextItems`) for position-aware test assertions. |
| `vectorfeld-cd2` | MuPDF outline-fallback warning | **Reframed after empirical spike**: pdfjs-dist returns the same 15 chars as MuPDF on the yellow-BG flyer — text was outlined-to-paths AT SOURCE PDF GENERATION (designer outlined fonts pre-delivery), not in MuPDF's interpreter. Not recoverable as text by any engine without OCR. Shipped: `analyzeImportedSvg` heuristic (path-to-text-char ratio with thresholds calibrated on real fixtures), `tagLayerWithImportAnalysis` hook in `pdfImport.ts` setting `data-mostly-outlined` + `data-text-chars` + `data-path-count` + console.warn, ⚠ badge + tooltip in `LayersPanel.tsx`. |
| `vectorfeld-ape` | pdf-lib export crashes on non-WinAnsi chars | Discovered via composite-via-playwright. The noheader flyer contains U+25CA (◊) bullets; pdf-lib's StandardFonts.Helvetica can't encode them and `pdf.save()` throws. `safeEncode` wrapper catches encoding failures and drops chars per char with structured console.warn naming each codepoint. Composite now exports without crashing; ◊ silently dropped pending Unicode TTF embed (`vectorfeld-85m`). |
| `vectorfeld-dns` | Real-PDF export bugs missed by synthetic tests | Two structural bugs that bit every real PDF import but were invisible to the synthetic test suite: (1) `walk()` ignored `transform=` on leaf elements (text/path/etc.) — MuPDF's flatten step puts `transform="scale(pt→mm)"` directly on each leaf, so all imported content rendered ~3× too large at wrong positions; (2) `drawText` only read x/y from `<text>` itself, ignoring `<tspan>` positions — but MuPDF emits text positioning ON the tspan, so every imported text collapsed to (0, 0) → bottom-left of export. Both fixed; 4 new tests; **lesson added to `docs/lessons.md` ("synthetic-test fixtures must include the emission shape of every upstream tool you intend to consume")**. Detection method that worked: composite-via-playwright + headed Chromium screenshot of the exported PDF. |

## Beads filed this session (5, all open)

- `vectorfeld-pr9` (P3) — Hybrid pdfjs-dist text overlay for Type 3 charproc PDFs (would recover text MuPDF rasterizes; deferred until a Type 3 fixture is in hand)
- `vectorfeld-ah8` (P3) — Remove unused `jspdf` + `svg2pdf.js` from production bundle (no longer imported by any `src/` file post-9s9)
- `vectorfeld-85m` (P2) — Embed Unicode TTF (DejaVu / Noto) so ◊ etc. survive export
- `vectorfeld-dns` (P1, closed above) — created and closed in same session
- `vectorfeld-dcx` (P1, **OPEN, top of next session**) — Real-PDF export still has text kerning / per-char positioning issues. After dns the layout is right (headline at top, body in middle, QR + flag at bottom) but words still run together because MuPDF emits multi-char tspans with PER-CHARACTER x-arrays (`x="100 108 116 124"` for "abcd"); we currently honour only the first x value and let pdf-lib lay out the rest with default Helvetica metrics that don't match the source font's spacing.

## Commits pushed this session (`main` branch)

```
bf2bbef Fix real-PDF export bugs: leaf transforms + tspan positioning (vectorfeld-dns)
ebc4654 Sanitize non-WinAnsi chars in pdf-lib drawText (vectorfeld-ape)
e31022b Detect mostly-outlined PDFs on import + warn user (vectorfeld-cd2)
7d1e3e9 bd: capture interactions for vectorfeld-9s9 close + ah8 file
f2793ed Wire production exportPdf to pdf-lib engine; add g+transform support (vectorfeld-9s9)
771d78e Extend pdf-lib engine to path/rect/line/ellipse/circle/image (vectorfeld-9s9)
ff49d70 Add pdf-lib SVG→PDF engine (text only) + failing-then-green round-trip test
00b319b Add PDF round-trip golden-fixture test harness (vectorfeld-5cu)
```

Plus a final worklog/sync commit at session close.

## End-of-session verification

Real-user composite via headed Chromium playwright (`test/dogfood/composite.mjs`):

1. `File > Open PDF…` → `Flyer ... noheader.pdf` (foreground; 112 elements; 817 text chars; no warning)
2. `File > Open PDF as Background Layer…` → `Flyer ... yellow BG.pdf` (background; 218 elements; 15 text chars; **cd2 ⚠ badge fires correctly** — "216 paths vs only 15 editable text chars")
3. `File > Export PDF` → `temp/composite.pdf` (231 KB)
4. Open exported PDF in Chromium → screenshot

Result: **layout structurally correct** (headline at top, body in middle, QR + flag at bottom; matches both the canvas and the source flyer) but **per-character spacing visibly wrong** ("Ich entlastedurch mein Lektoral…"). Captured as `vectorfeld-dcx`. Compare to the pre-9s9 baseline composite: 1.2 MB with completely garbled body text — current state is structurally right and only kerning is off.

## Tests

461 (start) → 478 (after 5cu harness) → 483 (after 9s9 text-only) → 490 (after 9s9 primitives) → 491 (after 9s9 g+transform + production wire) → 503 (after cd2) → 505 (after ape) → **509 (final)**.

## Bundle

881 KB main + 89 KB MuPDF JS + 10 MB MuPDF WASM. +57 KB from pdf-lib. `jspdf` + `svg2pdf.js` still bundled (unused — `ah8` follow-up).

## Next work — top of next session

**Top of `bd ready` (P1):**
1. `vectorfeld-dcx` — kerning / per-char positioning. The export is structurally right after dns; only character spacing is off.

**P2 cluster:**
- `vectorfeld-85m` — embed Unicode TTF
- `vectorfeld-6z0` — yellow-BG composite white margin / clipping on export
- `vectorfeld-4w7` — multi-doc UI tabs
- `vectorfeld-2ss` — Paste in Place (Ctrl+Shift+V)
- 4 deferred pen-tool / properties-polish bugs from before the pivot

**P3:**
- `vectorfeld-ah8` — bundle cleanup
- `vectorfeld-pr9` — hybrid pdfjs-dist for Type 3

## Key files to know

- `src/model/pdfExport.ts` — the new pdf-lib engine. Where dcx fix lands.
- `src/model/pdfRender.ts` — extracted MuPDF call path. Used by both worker (browser) and tests (Node).
- `src/model/importAnalysis.ts` — cd2 heuristic.
- `test/roundtrip/` — golden-fixture harness. `helpers/{normalizeSvg,renderPdf,pdfPipeline,pdfText}.ts` + `svgToPdfRoundtrip.test.ts` (19 tests).
- `test/dogfood/composite.mjs` — the end-to-end driver.
- `docs/lessons.md` — the synthetic-test-blindspot lesson.
