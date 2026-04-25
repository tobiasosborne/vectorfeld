# 2026-04-22 — Kerning → font embed → graft-architecture pivot

Three commits to prod + spike-proven architecture for a rewrite. Started from `846f024` (TDD round-trip session end), ended at `7448eee` (de-risk spikes pass).

## Arc

User asked to tackle `vectorfeld-dcx` (residual PDF-export kerning). What was meant to be a one-bead fix turned into two major correctness fixes and a strategic-architecture decision:

1. **`vectorfeld-dcx` kerning**: per-char `x`-array in MuPDF tspans was only honouring the first value. Fixed `drawText` in `src/model/pdfExport.ts` to iterate per code point when `x` is space-separated. Committed as `1d6dbf9`. 3 new tests, 509→512 green.

2. **Double-Y-flip path bug** (`09e0bde`): user ran the composite and called it "BAD". Investigation revealed `drawPath` was pre-flipping coordinates (`pageHeightPt - y`) then pdf-lib's `drawSvgPath` applied its own internal Y-flip on top — every path rendered above the page (negative Y, invisible). All 216 paths (blue border frame + swift bird logo) were missing from every export without anyone noticing, because existing synthetic tests only checked "a path element exists". Fixed + added position-on-page test.

3. **Font embedding** (`a8d2fe6`, closes `vectorfeld-85m`): swapped bundled `StandardFonts.Helvetica` for Carlito (Calibri clone) + Liberation Serif (Playfair Display substitute) via `@pdf-lib/fontkit`. ◊ characters preserved. "swift LinguistiK" logo in italic serif. 1MB bundle cost. Went from pdf-lib Helvetica → pixel-close to source for body text.

4. **User challenge**: "why do you need the fonts? Would acrobat need the fonts to do the same job?" — correctly identified that the Carlito bundle is a workaround for losing source font subsets at the SVG-intermediate step. Research agent surveyed Acrobat / Preview / pdf-lib / Illustrator / PDF spec / MuPDF to propose a scalable alternative.

5. **Architectural decision**: switch from "PDF→SVG→pdf-lib→PDF" to **"graft source PDF byte-for-byte, overlay edits via appended content streams"**. Spike-proven (see below). Untouched regions preserved at the PDF object-graph level — including embedded font subsets, kerning, ligatures, hinting, colour spaces — via `PDFDocument.graftPage()`. New content composited via additional content streams in the same page's `/Contents` array. This is Acrobat's model adapted for a personal editor.

## De-risk spikes (all 3 PASS)

Epic: `vectorfeld-ccl`. Spikes closed: `u9d`, `kgz`, `jew`. Scripts live at `scripts/spike/*.mjs` and are re-runnable.

- **Spike 1 (`u9d`)** — `mupdf.PDFDocument.graftPage()` clone verbatim. Loaded the yellow-BG flyer, grafted page 0 into an empty PDFDocument, saved. pdftoppm@150dpi rendered output and source to PNG; pixelmatch against each other: **0 / 2,176,714 pixels differ (0.0000%)**. All 10 source font subsets preserved with original 6-letter Adobe prefixes (NQVAEI+/VKURMS+/BAAAAA+/CAAAAA+ = Calibri + Playfair Display variants). File shrinks from 2.6 MB → 1.6 MB because graft drops unused cross-page objects.

- **Spike 2 (`kgz`)** — graftPage + append overlay content stream. Two patterns validated: (a) reference the grafted source Calibri font — works, but subsetted sources lack glyphs we didn't use (e.g. no capital K in the regular-Calibri subset); (b) embed Carlito into the grafted doc via `PDFDocument.addSimpleFont(font, 'Latin')` + register under `/VfCarlito` in the page's `/Resources/Font` dict + reference from a new content stream — renders full text overlay without touching source bytes. Pattern (b) is production.

- **Spike 3 (`jew`)** — content-stream operator tokenizer in 120 LOC of TypeScript. PDF §7.8.2 literal-string + hex-string + name + number + operator tokens. 13ms on a 16 KB stream. Source emits 106 `TJ` ops (array form, per-char positioning) and 0 `Tj` (plain). To locate a specific source text run by its content we'll need to decode the per-font ToUnicode CMap (additional ~100 LOC) since CID Identity-H fonts encode as 2-byte glyph indices, not characters.

## Beads filed & gate

Full epic plan registered in bd, 14 beads total, dependencies wired. See `bd show vectorfeld-ccl` for the tree.

- Phase 1 (de-risk spikes): all 3 closed ✓
- Phase 2 (impl: live mupdf handle `byq`, src-tag `8v3`, command classification `5gk`, graft engine `wjj`, wire `u7r`, byte-diff test `6d0`): ~670 LOC, ready to start
- Phase 3 (typography polish: fontkit layout `yyj`, in-place source-font edit `eb0`): ~500 LOC
- Cleanup (`hc7`, `7mj`): -300 LOC, -1 MB bundle

Gate verdict: **GO**.

## Lessons captured (`docs/lessons.md`)

- **pdf-lib drawSvgPath double-Y-flip**: the API takes SVG coords and flips internally; other pdf-lib drawing methods (`drawRectangle`/`drawText`/`drawLine`/`drawEllipse`) take PDF coords already flipped. Pre-flipping paths = double-flip = invisible output. Synthetic tests must assert on-page position, not just "a path element exists".
- **Vite dev-server staleness during headed-Chromium dogfood**: burned ~15 min chasing a "Carlito rendering bug" that was actually stale cached code served by a dead vite process. Rule: before diagnosing, `curl -I localhost:5173` + `ps aux | grep vite`. Cross-verify with `pdftoppm` (CLI, no Vite in the loop).

## Commits on `main` this session

```
7448eee  Graft-architecture de-risk spikes: all 3 PASS
99f77ce  Capture pdf-lib Y-flip + Vite staleness lessons
a8d2fe6  Embed Carlito + Liberation Serif so PDF export fonts match source (vectorfeld-85m)
09e0bde  Fix PDF export double-Y-flip that hid all imported vector paths
1d6dbf9  Fix PDF export per-character kerning for MuPDF imports (vectorfeld-dcx)
```

Plus this worklog + bd export refresh.

## Beads closed this session

`vectorfeld-dcx` (P1 kerning), `vectorfeld-85m` (P2 Unicode TTF / font embed), `vectorfeld-u9d` + `-kgz` + `-jew` (three graft spikes).

## Beads filed this session

Epic `vectorfeld-ccl` + 12 sub-beads in the Phase 2 / Phase 3 / cleanup tracks (see bd list). Plus `vectorfeld-sqr` (P3 follow-up to subset fonts for bundle size — becomes moot once Phase 2 lands).

## Next work — top of next session

`vectorfeld-byq`: live `mupdf.PDFDocument` handle in `DocumentState`. Unblocks everything in Phase 2. Start by modifying `src/model/pdfImport.ts` (stop calling `.destroy()` on the mupdf Document after SVG extraction; thread the handle through to `documentState.ts`). ~150 LOC.

## Key files to know (update)

- `scripts/spike/*.mjs` — re-runnable spike scripts. Gate for any graft-architecture regression.
- `docs/spikes/spike-01-verdict.md` / `spike-02-verdict.md` / `spike-03-findings.md` — spike findings. Read these before touching `graftExport.ts`.
- `node_modules/mupdf/dist/mupdf.d.ts` — authoritative mupdf.js API surface. Key entries: `PDFDocument.graftPage`, `addSimpleFont`, `addStream`, `PDFObject.readStream/writeStream/get/put/push`, `findPage`.
- `src/fonts/` — bundled Carlito (Calibri-metric clone) + Liberation Serif. Shrink after `vectorfeld-hc7` ships.
