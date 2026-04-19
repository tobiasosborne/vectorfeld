# PDF Round-Trip Experiment — Findings

_Date: 2026-04-19_
_Beads: vectorfeld-tha_

## Question

Does MuPDF's SVG output produce **editable** SVG (semantic `<text>` and `<image>` elements) or **hostile** SVG (every glyph as an outlined `<path>`) when given a typical Word-style PDF? The answer determines whether the casual-PDF-edit pivot is viable on the existing pipeline or needs a different PDF parser.

## Method

Wrote `experiments/pdf-roundtrip/dump-svg.mjs` that mirrors `pdfImport.ts:renderPageToSvg()` and dumps the raw + post-processed SVG to disk with element-count stats.

Tested against three PDFs:

1. `sample-pandoc.pdf` — pandoc-generated, 1 page, text only with bold/italic/headings/list
2. `sample-with-image.pdf` — pandoc-generated, text + embedded PNG (raster image)
3. `pigeon_defence_guide.pdf` — real 14-page text-heavy report

Each PDF rendered through MuPDF's `DocumentWriter('svg', ...)` with two option strings:
- `''` — default mode (current `pdfImport.ts` behaviour)
- `'text=text'` — alternative, undocumented in the existing code

## Results

### Default mode (`text=path`)

| PDF | `<text>` | `<path>` | `<use>` | `<image>` | Size |
|-----|---------|---------|---------|-----------|------|
| sample-pandoc.pdf | **0** | 69 | 389 | 0 | 97.8 KB |
| sample-with-image.pdf | **0** | 43 | 188 | 1 | 83.4 KB |
| pigeon (page 1) | **0** | 159 | 1731 | 0 | 315.4 KB |

Text is rendered as a `<defs>` of glyph-outline `<path>` elements, with each character placed via `<use href="#font_N_M" x=... y=...>`. Characters are individually addressable but the text content is not stored as a string anywhere — you cannot read or edit "what does this paragraph say" from the SVG.

### `text=text` mode

| PDF | `<text>` | `<path>` | `<use>` | `<image>` | Size |
|-----|---------|---------|---------|-----------|------|
| sample-pandoc.pdf | **18** | 0 | 0 | 0 | 7.0 KB |
| sample-with-image.pdf | **6** | 0 | 0 | 1 | 31.2 KB |
| pigeon (page 1) | **85** | 0 | 0 | 0 | 30.4 KB |

Text emerges as real `<text>` elements with `<tspan>` children. Font metadata is preserved: `font-family="LMRoman10"`, `font-size="9.9626"`, `font-weight="bold"`, `font-style="italic"`. Bold and italic runs become separate `<text>` elements automatically. Images survive as `<image xlink:href="data:image/png;base64,...">` — fully addressable.

**SVG is 5–14× smaller in text mode.**

### Visual fidelity

Both modes render visually equivalent at the pixel level (Chromium renders, screenshots in `experiments/pdf-roundtrip/render-*.png`). The pandoc PDF rendered identically in `text=text` and default mode; the image-bearing PDF rendered text + raster correctly.

## Caveats

1. **Spaces are encoded as x-gaps, not as actual space characters.** The `<tspan>` text content is `"ASampleDocument"` while the visible rendering is `"A Sample Document"` — the spaces are encoded by gaps in the per-character `x` attribute list. To recover word-level text content you need a post-process: detect a gap larger than the average inter-character advance and reinsert a space. This is straightforward but not yet implemented.

2. **Per-character `x` positioning means text-content edits don't reflow.** Changing "hello" to "world" works (same character count), but changing "hello" to "hi" leaves the trailing characters in their original positions — there's no automatic re-layout because PDF text was never laid out by a flow engine in the first place. For the casual-PDF-edit use case this is acceptable: the user wants to *correct* or *reposition* text, not re-flow paragraphs.

3. **PDF export round-trip not yet tested.** Whether jsPDF + svg2pdf preserves these `<text>` elements with embedded fonts is a separate experiment. A partial workaround if it fails: keep the original PDF's font subset embedded.

## Decision

**Switch `pdfImport.ts` to `text=text` mode.** This is the make-or-break finding for the casual-PDF-edit pivot:

- Real `<text>` elements → vectorfeld's existing text editing tool, properties panel font controls, and copy/paste already work on them.
- Images preserved as `<image>` elements → existing `placeImage()` and selection logic already handle these.
- 5–14× smaller SVG → faster rendering, smaller memory footprint, smaller exported files.
- One-line code change in `pdfImport.ts:renderPageToSvg()`.

## Changes made

- `src/model/pdfImport.ts` — switched `DocumentWriter` option from `''` to `'text=text'`. Removed the now-unnecessary `<style>`-stripping pass in `postProcessPdfSvg`.
- `src/model/pdfImport.test.ts` — replaced the obsolete "strips font-face" test with a new test asserting `<text>` and font-family attributes survive postprocessing.

## Build state after change

- `npm run build` — green
- `npm test -- --run` — 472/472 passing across 40 files

## Live in-app verification (done 2026-04-19)

Ran `experiments/pdf-roundtrip/verify-import.mjs` — a headed Chromium script
using playwright from `qvls-sturm/viz/node_modules`. Steps: load the dev server,
click `File → Open PDF…`, inject `sample-with-image.pdf` via the file chooser,
inspect the imported DOM, click a text element, drag it, inspect PropertiesPanel.

**Result: 7/7 checks pass.**

- Canvas SVG located, viewBox `0.00 0.00 215.90 279.40` (mm, US Letter)
- Imported DOM: 6 `<text>`, 6 `<tspan>`, 1 `<image>`, 0 `<path>`, 0 `<use>` — text=text confirmed live
- Click on text element selects it (overlay renders 13 handles)
- Drag translates the element (ΔX = 80px = ~15mm)
- PropertiesPanel populated with Position, Transform, Style, Fill, Dash, Cap, Join, Opacity

### Bugs surfaced by the live test

1. **pt→mm scale mismatch (FIXED):** MuPDF emits content coordinates in points,
   but `postProcessPdfSvg` was converting only the viewBox to mm — content
   rendered ~2.8× too large and positioned partway down the page. Fix: in
   `applyParsedSvg`, wrap each imported layer's children in a `<g transform="scale(PT_TO_MM)">`
   group so content space matches viewBox units. Was latent in path mode too
   but less visible (all glyphs equally wrong).

2. **Vite dev server doesn't serve mupdf's .wasm (FIXED):** dev server returned
   `index.html` for `mupdf-wasm.wasm` requests, triggering "expected magic word
   00 61 73 6d, found 3c 21 64 6f" (that's `<!do` — the HTML doctype). Fix:
   `optimizeDeps.exclude: ['mupdf']` + `assetsInclude: ['**/*.wasm']` in
   vite.config.ts. Production build was already correct.

3. **Click-selects-whole-page (KNOWN, not fixed):** MuPDF's output has all text
   and images wrapped in a single top-level `<g>`. Clicking a character selects
   the entire group rather than the text element. Workarounds: Alt+click to
   cycle down the stack; or ungroup after import; or double-click-into-group.
   Usability issue, not a blocker for "open, move text around, save".

## Remaining next experiments (not done in this pass)

1. **Word-text recovery from x-gaps** — implement a small post-process that walks each `<tspan>`'s `x` array and inserts space chars where gap > char-width × 1.5.
2. **PDF export round-trip** — import a PDF, immediately re-export to PDF, diff the rendered pages. Establishes whether text font information survives the jsPDF + svg2pdf path.
3. **Multi-page support** — current `importPdf` only loads page 0. Extend to all pages as separate artboards (also unblocks the "Multiple artboards" PRD gap).
4. **Cross-document clipboard** — load PDF A, load PDF B in a second tab, copy from B and paste into A. Requires architectural addition; currently `clipboard.ts` is single-document.
5. **Ungroup-on-import or single-click-in-group** — fix the click-selects-whole-page usability issue from bug #3 above.
