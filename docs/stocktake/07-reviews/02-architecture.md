# Architecture Review — Vectorfeld (PDF-Edit Pivot)

_Date: 2026-04-19_
_Reviewer: adversarial staff-level architect_
_Codebase: ~17.5k LOC, TypeScript/React/Vite 7/Tauri 2_

---

## 1. Executive Summary

The single most dangerous architectural choice given the casual-PDF-edit pivot is the **ensemble of module-level pub-sub singletons** (`selection.ts`, `artboard.ts`, `activeLayer.ts`, `grid.ts`, `guides.ts`, `defaultStyle.ts`, `smartGuides.ts`, `swatches.ts`, `wireframe.ts`). These are not components with local state — they are global process singletons with no document scope. There is exactly one selection, one active layer, one set of artboards, one grid setting, for the entire process. The moment the product needs two documents open simultaneously (tab A = source PDF, tab B = destination PDF — the canonical copy-paste-between-PDFs workflow that defines the new use case), every one of these singletons becomes a race condition. State from tab A contaminates tab B with zero detection, no error, and no test that would catch it. This is not a forward-looking concern: even the single-page "open PDF, edit, save" loop is broken by this design if the user opens a second PDF via `importPdf`, because `clearSelection()` is called inside `applyParsedSvg` but all other singletons (artboard, activeLayer, grid) are left pointing at the previous document's data.

---

## 2. Singleton Model State

### What the pattern enables

Every module can call `getSelection()` / `subscribeSelection()` without any context threading. Adding a new consumer takes three lines. The `Canvas.tsx` setup logic is clean because it calls `setOverlayGroup` and `setGuideGroup` once on mount. The pattern was the right choice for a single-document desktop editor.

### What it forecloses

**Multi-document** is structurally impossible without a rewrite of all nine singletons plus every call site. The call graph is:

- `selection.ts`: called from `selectTool.ts`, `clipboard.ts`, `fileio.ts`, `pdfImport.ts`, `EditorContext.tsx`, `PropertiesPanel.tsx`, `App.tsx`, `Canvas.tsx`, `LayersPanel.tsx` — approximately 35 distinct call sites.
- `artboard.ts`: called from `Canvas.tsx`, `ArtboardDialog.tsx`, `App.tsx`.
- `activeLayer.ts`: consumed by `document.ts:getActiveLayer()`, which is called from `clipboard.ts`, `fileio.ts`, `pdfImport.ts`.

When the user opens PDF B while PDF A is loaded, `importPdf` calls `applyParsedSvg` which calls `clearSelection()` (correct) but does NOT reset `artboards`, `activeLayerElement`, `grid`, or `guides`. The artboard model still describes PDF A's geometry. `getActiveLayer()` still returns PDF A's layer element, which may or may not still be in the DOM — if it is not, `addElement()` silently calls `svg.appendChild()` on the detached element, doing nothing visible and producing no error (`document.ts:71–75`).

**The hidden data-corruption scenario:** open PDF A, select elements, then open PDF B. The selection array in `selection.ts` still holds live `Element` references to PDF A's SVG nodes. Those nodes have been removed from the DOM by `applyParsedSvg`, but the selection module does not know this. Calling `updateOverlay()` then calls `getBBox()` on disconnected elements — which throws a DOMException in Firefox, returns `{x:0,y:0,width:0,height:0}` in Chrome, and draws zero-size handles. No crash, silent garbage.

**The keyboardCapture singleton** in `registry.ts:23` is particularly dangerous: one document's text tool captures the keyboard and a second document's shortcuts stop working — forever, if the cleanup path misses.

### Verdict

The singleton pattern is a trap door for the pivot. It is not a "fix later" issue because the pivot's primary workflow (copy from PDF A, paste into PDF B) requires two live document contexts simultaneously. The existing clipboard (`clipboard.ts`) serializes to XML strings, so the clipboard data itself is fine — but the destination document resolution (`doc.getActiveLayer()`) goes through the singleton-infected `activeLayer.ts`.

---

## 3. SVG-DOM-as-Model

### Assessment

`DocumentModel` (`document.ts:29–39`) has a seven-method interface over a live `SVGSVGElement`. Every method is a thin shim: `addElement` calls `createElementNS`/`appendChild`, `removeElement` calls `removeChild`, `setAttribute` calls `el.setAttribute`. The "model" is the DOM.

This was a reasonable initial design for an SVG editor — SVG is the serialization format, so the document and the display are the same artifact. But it has compounding costs:

**Undo/redo fragility.** `ModifyAttributeCommand` stores attribute values as strings (`oldValue: string | null`). Text node content, `<tspan>` children, gradient stop trees — none of these are captured. The undo of a text edit via the text tool (`textTool.ts`) only reverts the `textContent` via the DOM directly during drag; it never creates a `ModifyAttributeCommand` for the text string itself. Verify: `textTool.ts` uses `el.textContent = ...` in `onKeyDown` with no command creation. A user typing "Hello" then Ctrl+Z gets... nothing undoable for the text, because the undo stack only knows about the `AddElementCommand` that created the element.

**Multi-document.** A `DocumentModel` holds a hard reference to one `SVGSVGElement`. Switching documents means creating a new model and a new SVG element, which means all nine singletons are out of sync (see §2).

**Testing.** Tests must run in a browser-like environment with a real DOM because every operation touches `SVGSVGElement`. Vitest + jsdom works but `getBBox()` always returns zeros in jsdom, which breaks `hitTestElement`, `unionBBox`, the entire selection overlay, and smart guides. Any test involving spatial logic is either untestable or requires a real browser (Playwright).

**Is `DocumentModel` earning its keep?** Barely. It provides `getLayerElements()` (a `querySelectorAll` wrapper), `getActiveLayer()` (delegates to the `activeLayer.ts` singleton), `getDefs()` (caches a `<defs>` reference), and `serialize()` (calls `XMLSerializer`). The interface exists primarily to make the command classes testable without a full browser — but since `ModifyAttributeCommand` takes a raw `Element`, it accesses the live DOM anyway. The `DocumentModel` abstraction is a veneer, not a wall.

### Consequences

The most concrete consequence for the pivot: `<text>` elements imported from PDF via MuPDF's `text=text` mode contain `<tspan>` children with `x` attribute arrays (`x="10.5 18.2 26.1 ..."`). Moving such a `<text>` via `computeTranslateAttrs` correctly updates `x`/`y` on the `<text>` itself (`geometry.ts:63`), but the `<tspan>` children's absolute `x` positions are not updated. The visual result: moving a text block leaves the characters stranded at their original absolute positions, overriding the parent's translation. This is a direct architectural consequence of treating position as an attribute on one element without walking child state.

### Alternative

A minimal improvement without full replacement: introduce a `DocumentState` interface that wraps a `DocumentModel` plus owns the singleton state that should be document-scoped (`selection`, `activeLayer`, `artboards`, `grid`, `guides`, `defaultStyle`). Inject this via React context rather than module-level singletons. This is a 1–2 day refactor that unblocks multi-document without requiring a new state management library.

---

## 4. Command Pattern Audit

### Does every mutation go through a command?

No. There are at minimum three documented back-doors and one confirmed live back-door:

**Back-door 1: text content editing.** `textTool.ts` modifies `el.textContent` directly in `onKeyDown` with no command. Only the initial `AddElementCommand` is in history. Typing "Hello" cannot be individually undone — Ctrl+Z deletes the whole element.

**Back-door 2: gradient stops.** `PropertiesPanel.tsx:534–542` and `PropertiesPanel.tsx:544–557` contain gradient color change handlers that call `history.execute(new ModifyAttributeCommand(stops[0], 'stop-color', v))` — this is correct. However, `gradients.ts:createLinearGradient` and `createRadialGradient` call `getDefs().appendChild(...)` directly without any command. Creating a gradient is not undoable; only changing its colors after creation is undoable. Switching fill type from solid to gradient (a destructive operation that loses the solid color) is not undoable.

**Back-door 3: wireframe style injection.** `Canvas.tsx:211–220` injects/removes a `<style data-role="wireframe">` element directly via `insertBefore`/`remove`. No command. Toggling wireframe mode cannot be undone.

**Back-door 4: overlay marquee rect.** `selectTool.ts:470–484` appends a marquee `<rect>` directly to the SVG. This is correct (it is a UI element, not document content), but it is removed via `rect.remove()` — if a bug prevents the cleanup path from running, a ghost rect pollutes the document SVG (and would be exported, since it lacks a `data-role` that is in the strip selector — it has `data-role="overlay"` which IS in the strip selector; this one is safe).

**CompoundCommand undo ordering.** `CompoundCommand.undo()` iterates children in reverse (`commands.length - 1` downto `0`) — this is correct. However, there is no exception handling. If `commands[i].undo()` throws (e.g., because the element was removed from the DOM by an earlier sibling's undo in the compound), the remaining undos are skipped silently. For a compound delete of three elements, if the first undo re-inserts element A into a parent that was itself removed by a prior operation, `insertBefore` throws a `HierarchyRequestError` and elements B and C are never re-inserted. The document is left in a half-undone state with no error shown to the user.

**`CommandHistory` cap.** Capped at 200 entries (`commands.ts:9`). For a multi-page PDF with 85 text elements per page (per the roundtrip experiment), a session of bulk edits can exhaust the stack in minutes. The splice at `commands.ts:18` is correct but loses history silently.

---

## 5. Tool System

### Is it genuinely pluggable?

In theory. Each tool is a `ToolConfig` with event handlers, registered via `registerTool`. In practice, adding a tool is easy. Replacing the select tool is easy: call `registerTool({name: 'select', ...})` to overwrite. The registry is a `Map`, so last write wins.

### The real problem: shotgun surgery for new element types

Adding a new element type (e.g., `<foreignObject>` for rich text, or `<video>`, or a PDF annotation type) requires updating 6–8 separate locations in lockstep. The `docs/lessons.md` "new element type checklist" lists them explicitly because the cost has already been paid once (`<image>` was missed and caused bug B-25). The checklist currently has 6 items:

1. `geometry.ts:computeTranslateAttrs` — add a branch
2. `nudge.ts` / `clipboard.ts` — add handling
3. `selectTool.ts` — update `getAllGeomAttrs`, `getPositionAttrs`, `moveElement`, `scaleElement` (four functions)
4. `freeTransformTool.ts:applyScale`
5. `reflect.ts`
6. `PropertiesPanel.tsx`

For the PDF pivot, `<tspan>` is a child element with its own `x` array — it is not in this registry at all. There is no hook for "when a parent text element is moved, also update tspan x positions."

The tool system is pluggable for tools, but not for element types. These are orthogonal concerns but are entangled because tools contain per-element-type logic rather than delegating to element-type strategies.

### Tool-to-selection coupling

Every tool captures `getSelection()` from the module-level singleton. There is no way to have tool A operate on document 1's selection while tool B operates on document 2's selection — back to the singleton problem.

---

## 6. Transform Strategy

### Current state

Two paths coexist:

**Primitive path** (`rect`, `ellipse`, `circle`, `line`, `text`, `image`): position is stored in element-type-specific attributes (`x`/`y`, `cx`/`cy`, etc.). Rotation is stored as a `rotate(angle, cx, cy)` string in the `transform` attribute. Translation updates the position attributes and shifts the rotation center by the same delta. Regex surgery extracts and replaces the `rotate()` component.

**Matrix path** (`g`, `path`, `polygon`, `polyline`): all transforms are composed into a `matrix(a,b,c,d,e,f)` string via `multiplyMatrix` / `matrixToString`. Position has no "home" attribute — it lives entirely in the matrix.

### Coherence verdict

The dual path is coherent for SVG primitives drawn within the editor. It breaks for imported content:

- MuPDF's `text=text` output gives `<text>` elements with `x` and `y` attributes AND an enclosing `<g transform="matrix(...) scale(...)">` wrapping layer (`pdfImport.ts:144–145`). The text element is on the primitive path, but its ancestors are on the matrix path. Moving the `<text>` via `computeTranslateAttrs` updates `x`/`y` on the element (`geometry.ts:63`) but does not modify the parent `<g>`'s matrix, which is correct. However, the bounding box computed by `getElementAABB` uses `el.getBBox()` + `el.getAttribute('transform')` — it ignores ancestor transforms. Hit testing in `geometry.ts:hitTestElement` similarly only checks one level of transform. A text element inside a scale group is hit-tested with incorrect coordinates.

- The `tspan` children with absolute `x` arrays: moving the parent `<text>` by `[dx, dy]` only shifts `text.x` and `text.y`. Each `<tspan>` has its own `x="10.5 18.2 ..."` attribute that anchors each character absolutely. The visual result is that moving a MuPDF-imported text block leaves characters at their original positions — the `<text>` element moves but the `<tspan>` content stays.

### Fragility points

1. `geometry.ts:74–95` — regex to extract `translate()` and `rotate()` from a path's transform. Correct for the common case. Silently wrong if the path was imported with a `matrix()` transform containing both translation and rotation.

2. `selectTool.ts:moveElement` — for non-group elements with a non-rotate transform (e.g., `matrix(1,0,0,1,10,20)`), the fallback at lines 218–223 uses `T(dx,dy) * origM` which is mathematically correct. But the code only reaches this branch if `origTransform !== undefined` AND `orig` is truthy. If the element has no transform attribute, `origTransform` is `null` (set via `el.getAttribute('transform')`), the block at line 196–224 is entered because `origTransform !== undefined` is true (it's null, not undefined), and `if (orig)` at line 202 is false, so no transform is written. Correct behavior by accident.

3. The `PT_TO_MM` scale wrapper in `pdfImport.ts:144` (`<g transform="scale(0.352778)">`) means all content coordinates are in points, not millimeters, from the SVG attribute perspective. `computeTranslateAttrs` operates in millimeter document space. Moving a text element by 5mm via nudge actually moves it by 5pt-equivalents (~1.76mm visually). This is a coordinate-space mismatch that will manifest as "moves too slowly" for PDF-imported content.

---

## 7. Module Boundaries

### Where they are wrong

**`fileio.ts` (338 lines) is doing too much.** It contains: SVG export (`exportSvgString`, `exportSvg`), PDF export (`exportPdf`), PNG export (`exportPng`), TikZ export (`exportTikz`), image import (`placeImage`), SVG import (`importSvg`, `parseSvgString`, `applyParsedSvg`). Seven distinct operations, three of which involve different external libraries (jsPDF+svg2pdf, canvas API, TikZ). The correct split: `export/` directory with `svgExport.ts`, `pdfExport.ts`, `pngExport.ts`, `tikzExport.ts`; `import/` directory with `svgImport.ts`, `imageImport.ts`. `parseSvgString` is already shared across `fileio.ts` and `pdfImport.ts` — the latter importing from the former (`pdfImport.ts:11`). This cross-import means `pdfImport.ts` can never be loaded without also loading jsPDF and svg2pdf, even though PDF export has nothing to do with PDF import.

**`pdfImport.ts:120–156` duplicates `fileio.ts:271–307`.** The `applyParsedSvg` function exists in both files with slightly different implementations. The difference: `pdfImport.ts` wraps imported layers in a `scale(PT_TO_MM)` group; `fileio.ts` does not. This divergence is load-bearing (correct for PDF, wrong for SVG import). But the code is copy-pasted with no shared base. Future bug fixes must be applied twice or they diverge.

**`commands.ts` has no knowledge of selection state** — correct. But `EditorContext.tsx:75–80` creates group elements with `document.createElementNS` and a `generateId()` call directly, bypassing `doc.addElement()`. The group node is created outside the document model, then inserted via `GroupCommand`. This is intentional but means the document model is not the single entry point for element creation.

**`PropertiesPanel.tsx` reaches into `gradients.ts`, `markers.ts`, `align.ts`, `matrix.ts`, `geometry.ts`.** It is the widest importer in the component layer. It also calls `history.execute` directly rather than routing through the editor context's `applyAttr` abstraction. The `applyAttr` helper inside `PropertiesPanel` is local and not exported, making it untestable.

---

## 8. Components

### God components

**`PropertiesPanel.tsx` (684 LOC) is a god component.**

The architectural problem is not its size — it is its role. It simultaneously:
- Reads DOM element attributes to populate form fields (view)
- Dispatches `ModifyAttributeCommand` to mutate the document (controller)
- Computes derived state (rotation angle from transform string, gradient type from fill attribute, skew from transform)
- Owns the `lockAspect` UI state
- Handles align/distribute operations on multi-select (which have nothing to do with single-element properties)
- Calls `setDefaultStyle` (which affects future elements, not current selection)

The correct decomposition: `PositionSection`, `SizeSection`, `TransformSection`, `StyleSection`, `FontSection`, `MarkerSection` as separate components, each consuming a typed element descriptor. The `PropertiesPanel` becomes a router that picks the right sections based on element type. The multi-select align/distribute controls belong in `SelectionPanel`, not `PropertiesPanel`. Each section can be tested independently.

**`App.tsx`** (estimated ~350 LOC based on file structure) is also approaching god-component territory — it wires `MenuBar` commands, context menu items, canvas handlers, artboard dialog, and imports every model operation. This is a coordination problem, not a logic problem, so it is less dangerous.

**`Canvas.tsx` (377 LOC) is right-sized** given its responsibilities: SVG lifecycle, zoom/pan, grid/guides rendering, tool event dispatch. The `getSvgRef()` escape hatch at `Canvas.tsx:378–381` (queries the DOM directly by `data-testid`) is an antipattern but localized.

### Right-sized components

`ColorPicker.tsx`, `FillStrokeWidget.tsx`, `ContextMenu.tsx`, `StatusBar.tsx`, `ToolStrip.tsx`, `Ruler.tsx` — all appropriately scoped.

`LayersPanel.tsx` is borderline; it directly mutates layer attributes via `setAttribute` without going through the command pattern (layer rename, lock, hide). This is a known back-door.

---

## 9. Hostility to the Pivot

The casual-PDF-edit use case requires: open PDF, edit text, move elements, copy-paste between PDFs, save. Ranked by architectural cost:

### 1. Cross-document clipboard (VERY HIGH COST)

Copy from PDF A, paste into PDF B. Currently impossible because `clipboard.ts` serializes selection to XML strings (cheap) but paste resolves `doc.getActiveLayer()` via the `activeLayer.ts` singleton. Opening PDF B overwrites the singleton's state. Opening PDF B also calls `clearSelection()` which wipes the selection that the user was about to copy from PDF A. The clipboard string survives (it is in a React `useRef`) but the target document context is lost.

To fix: document-scoped `activeLayer` and `selection`. Requires the `DocumentState` refactor from §2.

### 2. Multi-page PDF (HIGH COST)

`pdfImport.ts:renderPageToSvg` hardcodes `pageIndex = 0`. Each page should become an artboard. Artboards are already implemented in `artboard.ts` but are single-document-scoped (singleton). The artboard singleton would need to support multiple artboards-per-document first.

Mechanical cost: `renderPageToSvg` can be called in a loop. The per-page SVG then needs to be merged into the document SVG with artboard-aligned positioning. The `applyParsedSvg` destructive replace pattern must be changed to an additive "append page" pattern. Medium implementation work, high interaction complexity.

### 3. tspan x-position tracking for text moves (HIGH COST)

Moving a MuPDF-imported `<text>` element leaves `<tspan>` children stranded at their absolute `x` positions. `computeTranslateAttrs` in `geometry.ts:63` only updates the parent's `x`/`y`. Fix requires walking `tspan` children and shifting their `x` arrays by `dx`, which requires parsing the space-delimited number list — straightforward but needs to be added to `computeTranslateAttrs` for `text` elements, and also to `selectTool.ts:moveElement` for drag.

### 4. PT_TO_MM coordinate space mismatch (MEDIUM COST)

Content from MuPDF is in points inside a `scale(0.352778)` group. Nudge, clipboard paste offset, and smart guide snapping all operate in document (mm) space without accounting for this transform. Fix: flatten the `scale()` group on import by multiplying all coordinates by `PT_TO_MM`, or make all geometry operations ancestor-transform-aware.

Flattening is simpler and removes the architectural mismatch entirely.

### 5. Font fallback for PDF text (MEDIUM COST)

MuPDF emits `font-family="LMRoman10"` which is not a web-safe font. The browser falls back to serif. Visual fidelity is lost. Fix requires either (a) extracting and embedding the font subset from the PDF (complex, requires font parsing), (b) a font-mapping table from PDF font names to web-safe equivalents (low fidelity but usable for casual editing), or (c) accepting the fallback (acceptable for "casual PDF editor").

### 6. Progressive/multi-page PDF loading (MEDIUM COST)

Loading a 100-page PDF synchronously blocks the main thread. MuPDF WASM is already lazy-loaded (`pdfImport.ts:17`), but `renderPageToSvg` runs the PDF page synchronously in JS. For a 20-page report at 85 text elements per page = 1700 elements in the SVG. SVG at that scale is not jank-free in a single-document, single-SVG model.

### 7. Rendering 100+ text elements (MEDIUM COST)

The `selection.ts:updateOverlay()` function iterates all selected elements to compute `getBBox()` and draw handles. For a marquee-select-all with 100 text elements, this is 100 `getBBox()` calls per pointer event. `getBBox()` is synchronous and forces layout. At 60 fps, this is 6000 layout passes per second. The RAF coalescing in `refreshOverlay()` (`selection.ts:258`) helps for overlay redraws, but the underlying `getBBox()` in hit testing (`geometry.ts:156`) is called raw per `mousemove` event.

### 8. Save back to PDF (MEDIUM COST)

The existing `exportPdf` uses `jsPDF + svg2pdf`. The `text=text` round-trip via this path has not been tested (documented as a remaining experiment in `docs/stocktake/06-pdf-roundtrip-experiment.md`). If `svg2pdf` renders text as paths (likely), the output PDF loses text searchability and editability — acceptable for casual use but worth verifying before the pivot is declared viable.

---

## 10. Recommended Refactors, Ranked by ROI

### 1. Introduce `DocumentState` — scope the singletons (ROI: critical)

Create a `DocumentState` class that owns `selection`, `activeLayer`, `artboards`, `grid`, `guides`, `defaultStyle`. Store it in React context via `EditorContext`. Replace all module-level singleton calls with context-resolved calls. This is the prerequisite for everything else.

Estimated cost: 2–3 days. Touches ~40 files. The mechanical transformation is straightforward (find/replace import + add parameter). The hard part is that `Canvas.tsx` mounts only one SVG and currently implicitly assumes it is the document. After this refactor, Canvas receives a `DocumentState` prop.

### 2. Flatten PT_TO_MM scale transform on PDF import (ROI: high, low cost)

In `pdfImport.ts:applyParsedSvg`, instead of wrapping content in `<g transform="scale(0.352778)">`, walk the imported element tree and multiply all coordinate attributes by `PT_TO_MM`. This eliminates the coordinate-space mismatch that makes nudge/paste/snap incorrect for PDF content. Also fixes the `hitTestElement` ancestor-transform blindspot.

Estimated cost: 1 day. Requires a coordinate-flattening pass (`walk element, for each position attribute multiply by factor`). Already understood in `pdfImport.ts:59` which converts the viewBox.

### 3. Fix tspan absolute-x propagation in text moves (ROI: high for pivot)

In `geometry.ts:computeTranslateAttrs` for `tag === 'text'`, also walk `tspan` children and shift their `x` attribute arrays by `dx`. Same fix needed in `selectTool.ts:moveElement`. This is the blocker for "move text around" in an imported PDF.

Estimated cost: 0.5 days. Well-understood problem. Test by importing a PDF, selecting a text element, and dragging it.

### 4. Split `fileio.ts` by direction and format (ROI: medium, enables isolation)

Separate import from export, and separate formats within export. Specifically: extract `parseSvgString` and `applyParsedSvg` into `import/svgImport.ts`, then have `pdfImport.ts` import from there instead of from `fileio.ts`. This severs the `pdfImport → jsPDF` dependency chain and makes PDF import testable in isolation.

Estimated cost: half a day. Pure refactor with no behavior change.

### 5. Decompose `PropertiesPanel.tsx` by element-type section (ROI: medium)

Extract `PositionSection`, `SizeSection`, `StyleSection`, `FontSection`, `TextPathSection`, `MarkerSection` as separate components. The `PropertiesPanel` becomes a dispatcher. Each section is independently testable and independently extensible — adding PDF annotation properties (a new element type) requires only a new section, not editing a 684-line component.

Estimated cost: 1 day. No behavior change. Highest leverage for maintainability.

---

## Verdict: Hostility to the Pivot

The current design is **moderately hostile** to the casual-PDF-edit use case as a single-document, open-edit-save workflow, and **severely hostile** to the cross-document clipboard workflow that the use case description makes first-class.

The PDF pipeline itself (MuPDF `text=text` → `<text>/<tspan>/<image>`) is a genuine strength — the 06-pdf-roundtrip experiment proves the import is viable. Three tool-layer defects (PT_TO_MM mismatch, tspan x-position propagation, click-selects-whole-page group) are the immediate blockers for usability, and all three are 0.5–1 day fixes.

The existential block is the singleton model. The entire state layer — selection, active layer, artboards, grid, guides, default style — is scoped to the process, not the document. Building cross-document copy-paste on this foundation requires either (a) a complete singleton-to-context refactor (~3 days) or (b) a tab-isolation workaround using `postMessage` between iframes, which is even more work and introduces security surface. There is no clever incremental path. The refactor needs to happen before the cross-document workflow is built, or it will be built twice.
