# Use-Case Fitness Review: vectorfeld as a PDF Editor

_Reviewer: adversarial product design perspective_
_Date: 2026-04-19_
_Use-case north star: open a Word-exported PDF, move things around, save. Infrequent sessions. One user._

---

## 1. Executive Summary

This is not a PDF editor. It is a vector-authoring tool that recently learned to import PDFs as a side-quest. The full Illustrator 4-panel layout — vertical tool strip with 15 tools, ruler pair, properties inspector, layers panel, control bar, status bar — is built for someone who draws things from scratch all day. The actual user opens this tool three times a year to reposition a logo on a Word-export. Every affordance designed for the authoring use case is cognitive tax for the editing use case, and there is a lot of it. The PDF import pipeline is now technically sound (`text=text` mode, real `<text>` elements, images survive) but the shell it lives inside is wrong for the job. A PDF editor's first affordance should be "open a file." This app's first affordance is "which of these 15 drawing tools do you want?" The pivot is real and partially funded at the model layer, but the shell is still cosplaying as Inkscape.

---

## 2. Tool-by-Tool Verdict

| # | Tool | Key | Verdict | Rationale |
|---|------|-----|---------|-----------|
| 1 | Select | V | **KEEP** | Essential. Move, scale, rotate imported elements. Primary tool for the whole use case. |
| 2 | Direct Select | A | **KEEP** | Useful for adjusting anchor points in imported paths (e.g. fix a border line). Rarely needed but not authoring-only. |
| 3 | Pen | P | **DELETE** | 392 LOC of Bézier authoring. Nobody editing a Word PDF needs to draw new Bézier curves. DEAD. |
| 4 | Pencil | B | **DELETE** | Freehand drawing tool. Belongs to the scientific-diagram use case. DEAD for PDF editing. |
| 5 | Line | L | **HIDE** | Occasionally useful (add a divider line to a PDF). Not prominent. |
| 6 | Rectangle | R | **HIDE** | Occasionally useful (add a highlight box). Not prominent. |
| 7 | Ellipse | E | **HIDE** | Essentially never needed for PDF editing. NOISE. |
| 8 | Text | T | **KEEP** | Adding or correcting a text label. Necessary. |
| 9 | Eraser | X | **KEEP** | Delete unwanted elements from a PDF. High-value for this use case. |
| 10 | Eyedropper | I | **HIDE** | Already hidden from ToolStrip. Leave as is. |
| 11 | Measure | M | **DELETE** | 139 LOC for showing a distance overlay. Scientific-diagram tool. Useless for PDF editing. DEAD. |
| 12 | Scissors | C | **DELETE** | Split a path at a click point. Illustration workflow, not PDF editing. DEAD. |
| 13 | Knife | K | **DELETE** | Drag to cut all intersecting paths. Illustration workflow. DEAD. |
| 14 | Lasso | O | **HIDE** | Freeform marquee selection. Sometimes useful in dense PDFs, but marquee from Select is sufficient. |
| 15 | Free Transform | Q | **HIDE** | Skew handles are authoring-use. The useful part (scale/rotate) is already in Select. |

**Summary:** 4 DELETE (pen, pencil, measure, scissors/knife = ~798 LOC of tools that will never be triggered), 5 HIDE, 6 KEEP. After pruning, the tool strip is: Select, Direct Select, Text, Eraser, and 3–5 hidden drawing tools accessible via keyboard only. That is a PDF editor's tool strip.

---

## 3. Menu and Layout Audit

### File menu

```
Open SVG...        ← fine, secondary
Open PDF...        ← THE primary action. Buried at item 2 of 10.
Place Image...
─────
Export SVG
Export PDF         ← correct primary save action
Export PNG
Export TikZ        ← DEAD. Will never be used for PDF editing.
─────
Document Setup...
```

**Problems:**

- **"Open PDF..." is item 2, not item 1.** For a PDF editor, "Open PDF" should be the first item, bold, with Ctrl+O bound to it — not a secondary choice after "Open SVG." Severity: FRICTION.
- **No "Open Recent."** The user comes back in 3 months and has to navigate the file system from scratch. This is the single highest-friction gap in the File menu. Severity: FRICTION.
- **Export TikZ is dead weight.** It will never be invoked in the PDF editing use case. It signals "this is a LaTeX tool." Severity: NOISE.
- **No "Save" / "Save as."** There is export-SVG and export-PDF, but no concept of saving the working document. The user will spend 45 minutes editing then wonder where the save button is. Severity: WRONG TOOL.

### Object menu

The Object menu is 23 items covering: Flip H/V, Clipping Mask (make/release), Opacity Mask (make/release), Convert to Path, Join Paths, Make/Release Compound Path, Unite/Subtract/Intersect/Exclude/Divide (path booleans, lazy-loaded Paper.js), Place Text on Path, Offset Path, Release Text from Path.

For PDF editing:
- **Flip H/V**: KEEP (occasionally needed).
- **Clipping Mask**: KEEP (unmasking imported groups).
- **Opacity Mask**: NOISE. Never needed for PDF editing.
- **Convert to Path / Join / Compound Path**: edge-case utility, HIDE.
- **Path Booleans (Unite/Subtract/Intersect/Exclude/Divide)**: DEAD for PDF editing. These require authoring paths to operate on. Also currently broken (Paper.js not installed). 80 LOC + 13 MB Paper.js WASM loaded on first use for a feature the user will never trigger.
- **Place Text on Path / Offset Path**: DEAD for PDF editing. Severity: DEAD.

### Missing from menus entirely

- **Open Recent** — critical for infrequent use. Does not exist.
- **Select All** — keyboard shortcut Ctrl+A exists but it is not in the Edit menu (only undocumented).
- **Paste in Place** — useful for cross-document compositing.
- **Find / Find & Replace text** — critical for fixing a typo throughout a Word PDF.
- **Print** — the user may want to print directly.
- **Zoom to Fit** / **Zoom to Page** — no menu items for these; must know keyboard shortcuts.

---

## 4. Missing Workflow Capabilities (Ranked by Impact)

1. **WRONG TOOL — No "Open Recent."** After a 3-month gap the user must locate the file manually. This is the first thing they will miss.

2. **WRONG TOOL — Click selects the whole page, not individual elements.** MuPDF wraps all page content in a single `<g>`. Clicking anywhere on the page selects the entire group. The user's primary edit action (select a text line and move it) does not work on first try. The workaround is Alt+click or manual ungroup — neither is discoverable. Fix: auto-ungroup on import, or double-click-into-group with a visual indicator. Confirmed in live test (06-pdf-roundtrip-experiment.md, bug #3).

3. **WRONG TOOL — Single-page import only.** `importPdf` calls `renderPageToSvg(arrayBuffer, 0)` hardcoded. A 14-page Word document loses all but page 1. The pigeon-defence-guide test PDF is 14 pages. Severity: WRONG TOOL for real documents.

4. **WRONG TOOL — No Save workflow.** The app has Export SVG and Export PDF but no concept of a working file. If the user closes the tab, all edits are lost. There is no autosave, no "would you like to save?" prompt. A Tauri `window.onCloseRequested` guard does not exist.

5. **WRONG TOOL — No cross-document clipboard.** The user's stated use case is "copy paste stuff around from other similar PDFs." `clipboard.ts` is single-document. Opening a second PDF replaces the first (the import wipes all layers). There is no multi-document or tab model.

6. **FRICTION — Spaces stripped from text content.** MuPDF's `text=text` mode encodes spaces as x-gaps, not space characters. `"A Sample Document"` appears in the SVG as `"ASampleDocument"` with spacing encoded in `x` attribute arrays. When the user tries to edit a text element, they will see concatenated words. The word-recovery post-process is documented as not yet implemented (06-pdf-roundtrip-experiment.md, caveat 1).

7. **FRICTION — Font rendering degrades silently.** PDF imports with `font-family="LMRoman10"`. The font dropdown in PropertiesPanel defaults to `sans-serif` for unknown fonts. The page looks correct in the browser (system fallback), but when exported to PDF via jsPDF+svg2pdf, the font will be substituted without warning. Round-trip fidelity is untested (experiment 2 in 06-pdf-roundtrip-experiment.md is listed as "not done").

8. **FRICTION — Text content is not editable at the string level.** Per-character `x` positioning means the text tool's in-place editor can change characters but cannot reflow. Adding or removing characters shifts nothing — the remaining characters stay at their original x positions. This makes correcting a typo possible but visually broken for anything other than same-length substitutions.

9. **NOISE — No image replacement.** Selecting an embedded `<image>` element and replacing its `href` with a new image is not exposed in the UI. The user cannot swap out a logo. There is no "Replace Image..." menu item.

10. **NOISE — Undo after PDF import is untested.** `importPdf` does not wrap the import in a single undoable command. It calls `clearSelection()`, removes all layers, and repopulates — all outside the command history. Ctrl+Z after import does partial undo at best.

---

## 5. PRD Residue — What Can Be Deleted Without Loss

These features exist purely because the original PRD required them. The new use case will never trigger them. Deleting them reduces the cognitive footprint of the codebase and removes misleading affordances from the UI.

| Item | File(s) | LOC | Delete confidence |
|------|---------|-----|-------------------|
| TikZ export | `model/tikzExport.ts`, `model/tikzExport.test.ts`, File menu item | 178 + 119 | **High.** LaTeX export is 100% old-PRD. |
| Pen tool | `tools/penTool.ts`, `tools/penTool.test.ts`, icon, shortcut | 392 + 275 | **High.** Bézier authoring. No PDF editing relevance. |
| Pencil tool | `tools/pencilTool.ts`, `model/pathSimplify.ts`, `model/pathSimplify.test.ts` | 120 + 63 + 83 | **High.** Freehand drawing. DEAD. |
| Measure tool | `tools/measureTool.ts` | 139 | **High.** mm measurement overlay for diagram precision. DEAD. |
| Scissors tool | `tools/scissorsTool.ts` | 89 | **High.** Path-split-at-click. DEAD. |
| Knife tool | `tools/knifeTool.ts` | 168 | **High.** Drag-cut paths. DEAD. |
| Offset Path | `model/offsetPath.ts`, `model/offsetPath.test.ts`, Object menu item | 218 + ~50 | **High.** Illustration effect. DEAD. |
| Path Booleans | `model/pathBooleans.ts`, `model/pathBooleans.test.ts`, Object menu items (5) | 80 + ~50 | **High.** Paper.js WASM dependency, 13 MB, broken env, never used in PDF editing. |
| Text on Path | `model/textPath.ts`, `model/textPath.test.ts`, Object menu items (2) | 114 + 110 | **High.** Typographic effect for diagram authoring. DEAD. |
| Opacity Mask | `model/opacityMask.ts`, `model/opacityMask.test.ts`, Object menu items (2) | 116 + ~60 | **Medium.** Clipping masks are more useful; opacity masks are niche. |
| Free Transform skew | Skew handles in `tools/freeTransformTool.ts` | partial | **Medium.** Scale/rotate handles are useful; skew is authoring-only. |
| SwatchPanel | `components/SwatchPanel.tsx` | 50 | **High.** Orphaned component, not imported anywhere. |
| Smart guides (full) | `model/smartGuides.ts` | 287 | **Low.** Snap is useful during move. Reduce to snap-only, remove guide-line rendering. |
| Measure tool snap | `model/smartGuides.ts:collectPointCandidates` | partial | **Medium.** Point-snap for line tool. Irrelevant without line tool. |

**Total deletable LOC estimate: ~2,400** across ~20 files, before tests.

---

## 6. Font and Text Semantics

### Current state

- MuPDF `text=text` emits `font-family="LMRoman10"` (LaTeX Modern Roman), `"BCDGEE+Helvetica"` (subset-encoded), etc.
- PropertiesPanel has an 11-entry hardcoded `FONT_FAMILIES` dropdown (sans-serif, serif, monospace, Arial, Georgia, Times New Roman, Courier New, Verdana, Trebuchet MS, Impact, Comic Sans MS).
- When an unknown `font-family` is shown, the dropdown renders the first option (`sans-serif`) because there is no match — the original font value is silently discarded when the user opens Properties.
- PDF export via jsPDF + svg2pdf has not been tested for font round-trip fidelity.

### Strategy options

**Option A — Don't touch fonts (read-only fidelity).** For "move things around" use, the font never needs to change. Show the raw `font-family` attribute as a read-only label in PropertiesPanel for `<text>` elements from imports. Do not expose the dropdown unless the user explicitly wants to change the font. Risk: export may substitute fonts anyway (jsPDF limitation).

**Option B — Font substitution map.** When MuPDF font names are detected (`LMRoman*` → `serif`, `BCDGEE+Helvetica` → `sans-serif`), apply a substitution at import time or display time. Preserves rendering, loses font precision. Acceptable for casual editing.

**Option C — Embed font subsets from original PDF.** Extract the embedded font subsets from the PDF (possible with MuPDF) and inject them as `<style>@font-face{...}</style>` in the SVG defs. Highest fidelity but complex. Not needed for "move text around" — needed only for "export back to PDF and have it look right."

**Recommendation:** Option A for now. The worst outcome is not broken fonts — it is the user accidentally changing a font by clicking the dropdown. Remove or lock the font picker for elements that came from a PDF import (detectable by font name not in safe list). Implement Option B substitution map as a 30-line post-process in `postProcessPdfSvg` to reduce visual noise in Properties.

---

## 7. Cold-Pickup Experience

**Score: 3 / 10**

### What the user sees

1. Empty A4 canvas. No content. No hint that the primary action is "open a PDF."
2. Left side: vertical strip with 15 tool icons, no labels. V is pre-selected (select tool — correct). Pen, scissors, knife, measure, and pencil icons are visible but unrecognizable without tooltips.
3. Top: menu bar (File / Edit / View / Object). "Open PDF..." is File > item 2.
4. Right side: "Properties" (says "No selection") stacked above "Layers" (one layer "Layer 1"). Neither is relevant before a PDF is loaded.
5. Rulers along top and left. Mm scale. Useful after import, irrelevant before.
6. Status bar: "0.00 0.00  100%". Not actionable.
7. Control bar: X/Y/W/H/R inputs with no values. Meaningless before selection.

### What's missing

- No splash screen, welcome dialog, or "Open PDF" drop-zone.
- No "Open Recent" — the user who was here 3 months ago must use File > Open PDF and navigate from scratch.
- No tooltips on tool icons (discoverable names).
- No indication that the blank canvas is A4. The artboard white rectangle is present but unlabeled.
- The 15-tool strip communicates "this is a drawing app." The correct communication is "this is a document editor."

### Score rationale

3/10 because: the mechanics work once you know the app; PDF import actually functions; Ctrl+Z works; selection works. But a user returning after 3 months will struggle to find "Open PDF," will not know why clicking the blank area does nothing, will see 15 tools they don't need, and has no cue that this is the right tool for their task. First-session abandonment is high.

---

## 8. Desktop App Story (Tauri Gaps)

The Tauri config (`src-tauri/tauri.conf.json`) is a thin wrapper: one window, no custom permissions, no file-type registration, no menu bar integration, no dock icon protocol, no `window.onCloseRequested` handler.

### What "double-click a .pdf and it opens in vectorfeld" needs

| Gap | Severity | Status |
|-----|----------|--------|
| `.pdf` file-type association in `tauri.conf.json` | WRONG TOOL | Missing entirely |
| `tauri-plugin-dialog` native file open (vs. `<input type=file>`) | FRICTION | Not configured; app uses DOM file picker which works in Tauri but loses native dialog styling |
| `window.onCloseRequested` / unsaved-changes guard | WRONG TOOL | Missing; close silently discards all edits |
| Native OS menu bar (macOS/Linux) | NOISE | Not configured; menus are in-webview only |
| Pass CLI argument (file path) to renderer | WRONG TOOL | Not implemented; no `tauri::command` for opening a file path |
| `tauri-plugin-fs` for read/write to local disk | WRONG TOOL | Not configured; export uses `<a download>` browser trick |
| Auto-updater | NOISE | Not configured |
| Single-instance guard | FRICTION | Not configured; opening a second PDF would launch a second window |

**The Tauri shell is a development scaffold, not a finished desktop app.** The `.pdf` file-type association alone would transform the cold-pickup experience: the user double-clicks a PDF in their file manager and it opens in vectorfeld. Without it, they must remember to launch the app and then navigate to the file.

**Minimum viable desktop story (4 changes):**
1. Register `.pdf` MIME type association in `tauri.conf.json`.
2. Implement `on_file_open` Tauri command that passes the file path to the frontend at startup.
3. Add `window.onCloseRequested` with "unsaved changes?" dialog.
4. Use `tauri-plugin-dialog` for native Save As dialog (jsPDF currently triggers a browser download).

---

## 9. Redesign Sketch

The shell should become a single-document, file-forward editor: when you launch it, the dominant affordance is a centred "Open PDF..." button (or drag-and-drop zone) on a neutral background, with an "Open Recent" list beneath it. Once a document is loaded, the layout collapses to three elements: a thin toolbar at the top (just Select, Text, Eraser, and a "more tools" expander for the rare cases), the canvas in the centre, and a slim floating properties popover that appears only when something is selected — not a permanent right-side panel. The layers panel disappears entirely for single-layer PDFs (the common case) and is accessible behind a View menu if needed. The File menu leads with Open PDF (Ctrl+O), Save (Ctrl+S), Save As, and Open Recent. The Object menu shrinks to Flip, Ungroup, and Arrange. Everything else is behind "Advanced" — present for power use, invisible by default. The experience should read as "Preview.app with a move tool," not "Inkscape with a PDF importer bolted on."

---

## 10. Top 10 Changes Ranked by Use-Case Fitness Improvement

| Rank | Change | Severity addressed | Effort |
|------|--------|--------------------|--------|
| 1 | **Auto-ungroup on PDF import** (or double-click-into-group). Click → select element is the core interaction. Currently broken. | WRONG TOOL | Medium (~1 day) |
| 2 | **Multi-page import.** Loop `renderPageToSvg` for all pages; create one artboard per page. Without this, 90% of real Word PDFs lose content. | WRONG TOOL | Medium (~1 day) |
| 3 | **Add "Open Recent."** `localStorage`-backed list of last 5 files (name + path). Show in File menu and on blank-canvas welcome state. | FRICTION | Small (~0.5 day) |
| 4 | **Space-recovery post-process in `postProcessPdfSvg`.** Walk each `<tspan>`'s `x` array, insert space chars where gap > 1.5× average advance. Makes text editable as words. | FRICTION | Small (~0.5 day) |
| 5 | **Register `.pdf` file-type in Tauri and implement `on_file_open` command.** Enables double-click-to-open. | WRONG TOOL | Medium (~1 day) |
| 6 | **Delete pen, pencil, scissors, knife, measure tools + TikZ export.** Remove ~800 LOC of authoring tools from the tool strip and menus. Strip visible tool count from 14 to 4 (select, direct-select, text, eraser). | NOISE + DEAD | Small |
| 7 | **Add unsaved-changes guard.** Track dirty state; show "Save before closing?" on Tauri `window.onCloseRequested`. Add Ctrl+S → Export PDF as "Save." | WRONG TOOL | Small |
| 8 | **Font substitution map in `postProcessPdfSvg`** (`LMRoman*` → serif, `Helvetica*` → sans-serif, etc.) + lock font picker for imported elements. Prevents silent font-change on Properties open. | FRICTION | Small |
| 9 | **Welcome state on blank canvas.** When no document is loaded, show a centred "Open PDF..." button and "Open Recent" list instead of empty artboard + 15 tool icons. Cold-pickup score goes from 3 to 6 with this alone. | FRICTION | Small |
| 10 | **Delete path booleans + opacity masks + text-on-path + offset-path.** Remove Paper.js WASM dependency (13 MB), clean Object menu from 23 items to 7. Removes dead-weight from load path and UI. | NOISE + DEAD | Small |

---

_End of review._
