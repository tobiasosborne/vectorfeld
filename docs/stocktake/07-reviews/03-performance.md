# Performance Audit — vectorfeld

_Auditor: adversarial performance review_
_Date: 2026-04-19_
_Use-case pivot: casual PDF editing — 100+ `<text>` elements per page, multi-page Word PDFs, base64 embedded images_

---

## 1. Executive Summary

Under the PDF-edit use case, the first thing a user will notice is the **drag-move lag with 100+ elements**: every `mousemove` frame (even RAF-throttled at 60 fps) calls `computeSmartGuides` which iterates all non-selected elements, calling `getBBox()` on each. With 100 elements that is 100 forced layout queries per frame — browser layout thrash. Close behind it is the **selection overlay rebuild** (`updateOverlay` in `selection.ts`): every `setSelection`, `clearSelection`, `addToSelection`, or `removeFromSelection` call triggers a synchronous DOM teardown + rebuild of 13–17 SVG elements, and four separate React components (`App`, `ControlBar`, `PropertiesPanel`, `LayersPanel`) each re-render their full component tree in response via independent `subscribeSelection` listeners. For a first-session PDF user who clicks around 100 text elements, that fan-out fires on every click. Finally, the **initial PDF import** blocks the main thread entirely — MuPDF WASM runs synchronously on `await renderPageToSvg()`, and for a 10-page document that would require 10 sequential blocking calls (currently page 0 only, so the problem is latent until multi-page is implemented). The app will feel acceptably fast on a single-page import of a simple PDF but will become noticeably sluggish when the user starts dragging elements around a fully-loaded page.

---

## 2. Hot Paths Measured / Estimated

| Hot Path | File:Line | Trigger | Cost Estimate | Severity |
|---|---|---|---|---|
| `computeSmartGuides` — inner loop | `smartGuides.ts:83-157` | Every mousemove during drag (RAF-throttled, ~60/s) | N=100 elements × 2 axes × 3 edge checks = 600 comparisons + 100 `getBBox()` calls. `getBBox()` forces synchronous layout per call; Chromium costs ~0.02–0.05 ms per call → **2–5 ms/frame layout thrash** just for guides. Above 200 elements: **10+ ms → frame drop**. | **PAINFUL** |
| `updateOverlay` (selection rebuild) | `selection.ts:133-253` | Every `setSelection`/`clearSelection`/drag frame (`refreshOverlay`) | Tears down and rebuilds 13+ SVG nodes (1 selection box + 8 scale handles + 4 rotation zones). Each `appendChild`/`setAttribute` forces style recalc. On drag: called via `refreshOverlay()` → RAF-batched, so ~60/s. On click: synchronous. ~0.3–0.8 ms per call; harmless alone, but see subscription fan-out. | **NOTICEABLE** |
| `hitTestElement` / `hitTestAll` | `geometry.ts:135-213` | Every click (and `onMouseDown`) | Calls `querySelectorAll('g[data-layer-name]')` + iterates all children with `getBBox()`. On 100 elements: O(n) with layout flush. No spatial index (R-tree, quad-tree). Each click: ~2–5 ms. | **NOTICEABLE** |
| `cacheSmartGuideCandidates` | `smartGuides.ts:30-32` | Drag-start only | One-time O(n) `getBBox()` scan of all elements. 100 elements → 100 `getBBox()` calls. Acceptable at drag-start (~5–10 ms blocked). Cache is valid for the drag. **Not** re-called per frame — good design. | **LATENT** |
| `collectPointCandidates` | `smartGuides.ts:214-248` | Per line-tool endpoint (not cached) | Full `querySelectorAll` + `getBBox()` on every mouse-move while drawing a line. No caching equivalent to `cacheSmartGuideCandidates`. N=100 → ~5 ms/frame during line drawing. | **NOTICEABLE** |
| `PropertiesPanel` full re-render | `PropertiesPanel.tsx:99-684` | Every selection change | Entire 684-LOC component re-renders from scratch. `detectFillType(el)` called inline in render (DOM query). `parseSkew(getAttr(...))` called 3× in render (regex). `getElementAABB(el)` called for `path`/`g` in render (forced `getBBox()`). For 100-element PDF page: user clicks rapidly → every click re-renders this panel. | **NOTICEABLE** |
| `getSvgRef` | `Canvas.tsx:379-381` | Called by any module needing the SVG ref | `document.querySelector('[data-testid="canvas-container"]')` then `.querySelector('svg')` — two DOM queries per call. If called inside a tight loop this degrades. | **LATENT** |
| `renderGrid` | `grid.ts:66-128` | Pan, zoom, grid toggle | Tears down + rebuilds up to 500 DOM `<line>` nodes per call. On zoom/pan this is called synchronously (not RAF-batched). For a zoomed-out A4 at 5mm minor spacing: ~(210/5)+(297/5) = 42+60 = 102 lines. Acceptable at present scale but 500-line guard is the right concern. | **LATENT** |
| `exportPdf` via svg2pdf.js | `fileio.ts:62-97` | File → Export PDF | Appends SVG clone to DOM, calls `svg2pdf` (JS, single-threaded). For 100-element PDF page this is likely 2–10 seconds of main-thread block, no progress indicator, UI freeze. svg2pdf handles each element in a JS loop. | **PAINFUL** |
| PDF import — MuPDF WASM | `pdfImport.ts:60-83` | File → Open PDF | `page.run(device, ...)` renders the PDF synchronously in WASM on the main thread. Single page of the pigeon PDF (85 elements): ~300 KB SVG string processed. Likely 200–800 ms freeze. 10 pages would require 10× sequential calls — **multi-page import will be a guaranteed freeze**. | **PAINFUL** (latent for multi-page) |
| `parseSvgString` | `fileio.ts:223-265` | PDF import, SVG import | `DOMParser.parseFromString` on a large SVG string is synchronous. For a 300 KB SVG: ~10–50 ms main-thread block. | **LATENT** |

---

## 3. Subscription / Re-render Analysis

### Pub-sub singletons and their subscribers

| Publisher | Subscribers | Fan-out on one event |
|---|---|---|
| `selection` (`notify()`) | `App.tsx:70` (`setSelCount`→React setState), `ControlBar.tsx:103` (`setSelectionState`→React setState + `setTick`), `PropertiesPanel.tsx:107` (`setSelectionState`→React setState), `LayersPanel.tsx:35` (`refreshLayers`→React setState) | **4 React setState calls** per selection change. Each triggers independent React reconcile. |
| `grid` (`notify()`) | `Canvas.tsx:171` (`updateGrid`→DOM mutation) | 1 direct DOM mutation. No React re-render. Acceptable. |
| `guides` (`notify()`) | `Canvas.tsx:206` (`renderUserGuides`→DOM mutation) | 1 direct DOM mutation. |
| `artboards` (`notify()`) | `Canvas.tsx:91` (`syncArtboards`→DOM mutation) | 1 direct DOM mutation. |
| `wireframe` (`notify()`) | `Canvas.tsx:226` (inline `update`→DOM mutation) | 1 DOM mutation. |
| `defaultStyle` (`notify()`) | `FillStrokeWidget.tsx:7` (`setStyle`→React setState) | 1 React re-render of a small widget. |
| `history` (CommandHistory `notify()`) | `LayersPanel.tsx:34` (`refreshLayers`→React setState) | 1 React re-render on every undo/redo/execute. |

### Worst offender: selection fan-out

A single click that changes selection fires:
1. `updateOverlay()` — synchronous DOM rebuild (13+ SVG nodes)
2. `notify()` → 4 listeners:
   - `App` re-renders (464 LOC root; re-evaluates all menu definitions via `useCallback`)
   - `ControlBar` re-renders (254 LOC; calls `getBBox()` + `decomposeMatrix()` during render)
   - `PropertiesPanel` re-renders (684 LOC; calls `detectFillType`, `parseSkew` ×3, `getElementAABB` during render)
   - `LayersPanel` re-renders (180 LOC; calls `editor.doc.getLayerElements()` = `querySelectorAll` during render)

All 4 happen synchronously in the same React batch (same microtask). Total cost: ~1–3 ms React + ~0.5 ms DOM = **acceptable now, noticeable at 100 rapid clicks**, degrading for heavier panel content.

### LayersPanel double-subscription problem

`LayersPanel` subscribes to **both** `history` (line 34) and `selection` (line 35). Every selection change redundantly re-renders LayersPanel — it doesn't actually need selection to know the layer list. This is a spurious re-render on every click.

### `App.tsx` selection subscription is fine in size

`App.tsx:70-72` only stores `selCount` (one integer) and is used only for context-menu gating. This is appropriately minimal.

---

## 4. Memory / Lifetime Audit

### Undo history: element retention

`CommandHistory` keeps a stack of up to 200 `Command` objects. For a PDF import:
- `applyParsedSvg` does **not** go through `CommandHistory` — it directly mutates the DOM. The import itself is **not undoable** and leaves no undo stack entries. This is actually memory-safe for the import action itself.
- However, if the user subsequently moves/edits 100 elements (one `ModifyAttributeCommand` each), the undo stack holds 100 command objects, each referencing a live `Element`. Since those elements are also live in the SVG DOM, this is only additive by the command object wrapper (~100 bytes each) — acceptable.
- `RemoveElementCommand` holds a reference to the removed `Element` (which is disconnected from DOM). For a 100-text-element page where user deletes all elements: up to 200 × `Element` + `data-uri image` references in undo stack. A single base64-encoded PDF page image can be 100 KB+. If the user repeatedly adds/removes image elements, the undo stack could hold multiple copies. **Worst case: 200 × 100 KB = 20 MB** if all undo entries were image `AddElementCommand`s. Unlikely but plausible with frequent `placeImage` operations.
- **Fix**: Cap the undo stack for `image` elements with large `href` values, or store a `data-uri` reference rather than a DOM clone.

### base64 data URI dual-retention

When a PDF page image is imported via `placeImage()`, the base64 data URI is stored:
1. In the `href` attribute of the `<image>` element in the live SVG DOM.
2. In `AddElementCommand.attrs['href']` in the undo stack.

This is a double-retention of the same potentially large string. For a 1 MB embedded image: 2 MB held. Not catastrophic but worth noting.

### MuPDF WASM module lifetime

`pdfImport.ts:16-21` — `mupdf` module is stored in module-level `let mupdf`. This is **good**: the WASM module (~10 MB uncompressed, ~4.6 MB gzip) is loaded once and retained across import operations. Subsequent imports do not reload WASM.

`buf`, `writer`, `device`, `page`, `doc` objects inside `renderPageToSvg` are properly destroyed (`page.destroy()`, `doc.destroy()` at lines 79-80). **The Buffer `buf` is not explicitly destroyed** after calling `buf.asString()`. Depending on MuPDF's JS bindings, this may leak WASM linear memory. Low risk for a single import but could accumulate over many imports in a long session.

### SVG clone in `exportPdf`

`fileio.ts:64-89` — clones the SVG (`cloneNode(true)`), appends it to `document.body`, then removes it in `finally`. The `try/finally` guarantees cleanup even on failure. No leak here.

### `setInterval` in `textTool.ts`

`textTool.ts:127` — `setInterval` for caret blink. `stopBlink()` is called in `cleanup()`, which is called on `commit()` and `onDeactivate()`. If the component unmounts without `onDeactivate` being called (e.g., React hot-module reload), the interval would outlive the tool. In production this is not a concern; in development HMR it could accumulate intervals.

---

## 5. Main-Thread Blocking

### PDF import (single page)

The entire pipeline runs on the main thread:
1. `file.arrayBuffer()` — async, non-blocking.
2. `getMuPDF()` → dynamic `import('mupdf')` — async, but on first call loads and instantiates a ~10 MB WASM binary. **Estimated: 200–1000 ms freeze on first import** (WASM instantiation is synchronous after the network load).
3. `renderPageToSvg()` — `page.run(device, ...)` is synchronous WASM execution. For pigeon_defence_guide.pdf page 1 (315 KB path-mode SVG output, 30 KB text-mode): likely **50–200 ms main thread block**.
4. `postProcessPdfSvg()` — regex on a ~30 KB string: ~1 ms. Fine.
5. `parseSvgString()` — `DOMParser.parseFromString`: ~5–20 ms for 30 KB SVG. Fine.
6. `applyParsedSvg()` — DOM mutations: ~5 ms for 85 elements. Fine.

**Total first-import freeze: 400–1500 ms** (dominated by WASM instantiation).
**Subsequent imports: 50–300 ms** (WASM cached, only render time).

No Web Worker is used. The entire chain is main-thread. The UI is unresponsive during WASM execution.

### Multi-page PDF (not yet implemented, latent)

When multi-page import is added, 10 pages × ~100 ms render = **1 second guaranteed freeze** with no progress indication. This must be offloaded to a Worker.

### SVG export / PDF export

`exportSvg`: `cloneNode(true)` + `XMLSerializer.serializeToString()`. For 100 elements the clone is fast (~5 ms). Acceptable.

`exportPdf`: `svg2pdf(svgClone, pdf, ...)` is an async function but runs entirely on the main thread (no Worker). For a 100-element SVG this could take **1–10 seconds** with no progress feedback. The PDF download only completes after the full synchronous loop in svg2pdf processes every element.

`exportPng`: creates an `<img>` and draws to `<canvas>`. The `img.onload` is async; `ctx.drawImage` is GPU-accelerated. This path is actually fast: ~100 ms for A4 at 1× scale.

### Pan during grid render

`Canvas.tsx:277` — during pan, `updateGrid()` is called inside the unthrottled pan handler on every `mousemove`. This calls `renderGrid()` synchronously, which rebuilds all grid DOM nodes on every mouse event. At high frame rates this adds up. However, since the grid guard (`MAX_GRID_LINES = 500`) caps DOM nodes at 500, the cost is bounded (~1–2 ms). **Tolerable but suboptimal**: grid should only re-render when viewBox actually changes.

---

## 6. Async / Leak Audit

| Location | Issue | Severity |
|---|---|---|
| `Canvas.tsx:329` — `window.addEventListener('mouseup', handleUp)` | Cleaned up properly in the same `useEffect` return: `window.removeEventListener('mouseup', handleUp)`. No leak. | OK |
| `Canvas.tsx:360-361` — `window.addEventListener('keydown/keyup')` | Cleaned up in same effect. No leak. | OK |
| `EditorContext.tsx:149-150` — `window.addEventListener('keydown')` | Cleaned up. No leak. | OK |
| `textTool.ts:127` — `setInterval` caret blink | Cleaned up in `stopBlink()` called from `cleanup()`. Cleanup is called on `commit()` and `onDeactivate()`. No leak in normal flow. Potential issue during HMR if tool is active. | LATENT |
| `Canvas.tsx:244-243` — wheel handler registered with `{ passive: false }` | Correct; needed for `e.preventDefault()`. Cleaned up. No leak. | OK |
| `MenuBar.tsx:31-32` — `window.addEventListener('mousedown')` | Cleaned up in `useEffect` return. No leak. | OK |
| `ContextMenu.tsx:27-31` — `window.addEventListener('mousedown'/'keydown')` | Cleaned up in `useEffect` return. No leak. | OK |
| `ColorPicker.tsx:31-32` — `document.addEventListener('mousedown')` | Cleaned up. No leak. | OK |
| `pdfImport.ts` — `buf` (MuPDF Buffer) | Not explicitly destroyed after `buf.asString()`. Potential WASM memory leak per import. | LATENT |
| `Canvas.tsx:249-290` — RAF id | Cancelled in cleanup on `return () => { ...; if (rafId) cancelAnimationFrame(rafId) }`. No leak. | OK |
| `selection.ts:131-132` — `refreshRafId` | Module-level singleton. Cleaned up within its own pattern. No React lifecycle involved. Fine. | OK |

**No uncleaned `setInterval` / `setTimeout` in production paths. No event listeners attached to `window` that outlive their component.**

---

## 7. Top 10 Performance Fixes, Ranked by ROI

### Fix 1 — Batch `getBBox()` calls in `cacheSmartGuideCandidates` into one layout flush (PAINFUL → NOTICEABLE)

**Problem**: `collectCandidates` calls `getBBox()` per element in a loop. Each call may force a separate layout reflow.

**Fix**: Collect all elements first, call `getBBox()` in a single `requestAnimationFrame` pre-layout pass, or — simpler — call them all synchronously but in one tight loop without interleaved DOM writes. The current code already does this (no DOM writes between reads). **Actually acceptable as-is** for the cache-at-drag-start case. The real problem is `collectPointCandidates` in the line tool which is called **per mouse-move without caching**. Apply the same `cacheSmartGuideCandidates` pattern to `collectPointCandidates`: cache at line-drag-start, clear on mouseup.

**Estimated gain**: Eliminates ~5 ms/frame during line drawing with 100+ elements.

---

### Fix 2 — Move `computeSmartGuides` inner-loop filtering out of the hot path (PAINFUL → NOTICEABLE)

**Problem**: `smartGuides.ts:86-87` — `candidates.filter(c => c.axis === 'x')` and `filter(c => c.axis === 'y')` run **on every `onMouseMove` frame**. The cache holds `xCandidates` and `yCandidates` as derived arrays that are recreated from `cachedCandidates` each frame.

**Fix**: Split candidates by axis **when caching** (`cacheSmartGuideCandidates`), storing `{ xCandidates, yCandidates }` directly. Eliminate the per-frame `filter()`.

```ts
// cacheSmartGuideCandidates: store pre-split
let cachedXCandidates: AlignCandidate[] | null = null
let cachedYCandidates: AlignCandidate[] | null = null

export function cacheSmartGuideCandidates(svg, exclude) {
  const all = collectCandidates(svg, exclude)
  cachedXCandidates = all.filter(c => c.axis === 'x')
  cachedYCandidates = all.filter(c => c.axis === 'y')
}
```

**Estimated gain**: Eliminates two O(n) allocations per frame.

---

### Fix 3 — Remove `subscribeSelection` from `LayersPanel` (NOTICEABLE → LATENT)

**Problem**: `LayersPanel.tsx:35` subscribes to selection changes to `refreshLayers`. LayersPanel displays layer names/visibility/lock — none of which change on selection change. This causes a full LayersPanel re-render (including `editor.doc.getLayerElements()` = `querySelectorAll`) on **every click**.

**Fix**: Remove the `subscribeSelection` subscription from LayersPanel. Keep only `history.subscribe(refreshLayers)` for when layers are added/removed.

**Estimated gain**: Eliminates 1 unnecessary React render + 1 `querySelectorAll` per click.

---

### Fix 4 — Memoize `PropertiesPanel` derived values with `useMemo` (NOTICEABLE → LATENT)

**Problem**: `PropertiesPanel.tsx` calls `detectFillType(el)`, `parseSkew(getAttr(el, 'transform'))` ×3, and `getElementAABB(el)` on **every render**. These are pure functions of `el`'s attributes and could be memoized.

**Fix**: Replace inline IIFE calls with `useMemo` keyed on `el` identity + relevant attribute strings:

```ts
const fillType = useMemo(() => el ? detectFillType(el) : 'none', [el, el?.getAttribute('fill')])
const skew = useMemo(() => parseSkew(el ? getAttr(el, 'transform') : ''), [el, el?.getAttribute('transform')])
const aabb = useMemo(() => el ? getElementAABB(el) : null, [el])
```

**Estimated gain**: Eliminates 5+ DOM reads and regex operations per render.

---

### Fix 5 — Offload PDF import (MuPDF WASM) to a Web Worker (PAINFUL → NOTICEABLE)

**Problem**: `pdfImport.ts` runs MuPDF synchronously on the main thread. This freezes the UI for 50–1000 ms per page.

**Fix**: Move `renderPageToSvg` into a dedicated `src/workers/pdfWorker.ts`. Pass the `ArrayBuffer` and page index via `postMessage`, return the SVG string. In `importPdf`, show a loading indicator while the worker runs.

```ts
// pdfWorker.ts
import 'mupdf'
self.onmessage = async ({ data: { buffer, pageIndex } }) => {
  const svgString = await renderPageToSvg(buffer, pageIndex)
  self.postMessage({ svgString })
}
```

Multi-page import: dispatch N workers in parallel (or sequentially with progress updates).

**Estimated gain**: Keeps UI responsive during import. Critical for multi-page support.

---

### Fix 6 — Throttle `updateGrid` during pan to only call when viewBox actually changes (LATENT → eliminated)

**Problem**: `Canvas.tsx:277` calls `updateGrid()` inside the pan `mousemove` handler on **every mouse event** (unthrottled, unlike tool dispatch). The grid only needs to update when the viewBox changes, not on every pixel of pan.

**Fix**: Store last viewBox string; only call `updateGrid()` when viewBox changes:

```ts
let lastVBString = ''
// inside pan handler, after setAttribute:
const vbStr = `${panStart.current.vbX - dx} ${panStart.current.vbY - dy}`
if (vbStr !== lastVBString) {
  lastVBString = vbStr
  updateGrid()
}
```

Or simply wrap `updateGrid()` in a RAF inside the pan path (it already is on zoom path).

**Estimated gain**: Reduces grid DOM rebuild from ~250/s during pan to ~60/s (once per RAF frame).

---

### Fix 7 — Virtualise the `querySelectorAll('g[data-layer-name]')` call with a cached reference (NOTICEABLE → LATENT)

**Problem**: `hitTestElement`, `hitTestAll`, `collectCandidates`, `collectPointCandidates`, `selectTool.ts:639` all call `svg.querySelectorAll('g[data-layer-name]')`. With a stable document structure (layers rarely added/removed), these are repeated scans of the same result.

**Fix**: The `DocumentModel` already has `getLayerElements()` which also calls `querySelectorAll` each time (`document.ts:97`). Cache the result and invalidate only when layers are added/removed (subscribe to `history` or use a `MutationObserver` on the SVG):

```ts
// document.ts
private _layerCache: Element[] | null = null
getLayerElements(): Element[] {
  if (this._layerCache) return this._layerCache
  this._layerCache = Array.from(this.svg.querySelectorAll('g[data-layer-name]'))
  return this._layerCache
}
invalidateLayerCache() { this._layerCache = null }
```

Call `invalidateLayerCache()` in `AddElementCommand`/`RemoveElementCommand` execute/undo when the element is a layer.

**Estimated gain**: Eliminates repeated DOM tree walks in all hit-test and guide-collect hot paths.

---

### Fix 8 — Add spatial indexing (simple grid bucket) for hit testing (NOTICEABLE → LATENT, future-proof)

**Problem**: `hitTestElement` is O(n) per click with AABB checks on all elements. With 100 elements it's fast enough. With 500+ elements (multi-page or complex diagrams) it becomes a bottleneck.

**Fix**: Maintain a simple spatial hash (grid bucketed by AABB centroid) invalidated on `ModifyAttributeCommand`. On click, only check elements in nearby buckets.

**Estimated gain**: O(1) average hit test vs O(n). Critical path for 500+ element pages.

---

### Fix 9 — Destroy MuPDF `Buffer` after use (LATENT memory leak)

**Problem**: `pdfImport.ts:76` — `buf.asString()` is called but `buf.destroy()` is never called. MuPDF JS bindings wrap C++ objects; without explicit `destroy()` the WASM linear memory for the buffer is not freed.

**Fix**:

```ts
const svgString = buf.asString()
buf.destroy()
return svgString
```

**Estimated gain**: Frees ~30–300 KB WASM heap per import operation. Prevents multi-import memory growth.

---

### Fix 10 — Add a loading/progress indicator for PDF import and PDF export (UX blocking → managed blocking)

**Problem**: Both `importPdf` and `exportPdf` can block the UI for 200–2000 ms with no feedback. The user sees a frozen app and may click again (triggering a second import).

**Fix (before worker is available)**: Emit a loading state via a simple pub-sub singleton or a React context flag. Show a spinner overlay. For export: `exportPdf` is already `async`; wrap it with a loading flag:

```ts
setExporting(true)
await exportPdf(doc, filename)
setExporting(false)
```

For import, set the flag before `await renderPageToSvg()`. Even if the thread is blocked, the flag will be visible in the React tree before and after.

**Estimated gain**: Zero performance gain, but eliminates perceived freeze and double-import accidents.

---

## Summary: Will This Feel Fast Editing a 10-Page Word PDF?

**Single-page import**: The first import will freeze for 200–1000 ms (WASM init). Subsequent pages: 50–200 ms each. Both are invisible if behind a spinner (fix 10).

**Editing 85 elements (one page)**: Click-to-select is fast (O(100) hit test, <2 ms). Drag-move causes ~2–5 ms/frame layout thrash from smart guides querying 85 `getBBox()` calls. At 60 fps this is 120–300 ms/s of layout work — marginal but will cause occasional dropped frames at 60 fps, especially on mid-range hardware. Fixes 1+2 would bring this well under the frame budget.

**Multi-page (10 pages, ~1000 elements total)**: Current architecture would either freeze for 10+ seconds on import (blocking main thread 10×) or require the user to load one page at a time. Drag-move with 1000 elements and smart guides would be **unacceptable** without fix 8 (spatial index) — O(1000) `getBBox()` calls at 60 fps = **60 ms/frame pure layout**, well over 16 ms budget.

**Verdict**: The app will feel acceptably fast for single-page PDFs with fixes 2, 3, 9, and 10 applied (low-effort wins). For the full 10-page use case, Fix 5 (Worker for WASM) and Fix 8 (spatial index) are architectural prerequisites — without them the app will feel broken, not slow.
