# Source Map: vectorfeld `src/`

_Audited: 2026-04-19_

## src/ (root) — 3 files

| File | LOC | Responsibility | Main Exports | Notable Internal Deps |
|------|-----|----------------|--------------|----------------------|
| `App.tsx` | 464 | Root application shell: assembles all panels, owns the top-level menu definitions, handles all menu-triggered document operations (booleans, masks, compound paths, offset path, reflect, text-on-path). Wraps content in `EditorProvider`. | `default App` | Virtually every other src/ file |
| `App.test.tsx` | 17 | Smoke test: verifies the app shell renders with the correct panel labels and `#app` element. | — | `./App` |
| `main.tsx` | 10 | Entry point: mounts `<App>` inside React StrictMode. | — | `./App` |

## src/components — 18 files

| File | LOC | Responsibility | Main Exports | Notable Internal Deps |
|------|-----|----------------|--------------|----------------------|
| `ArtboardDialog.tsx` | 111 | Modal dialog for document-setup: lets user enter custom width/height (mm) or pick a preset (A4/A3/Letter/A5/Square). Exports `PRESETS` for tests. | `ArtboardDialog`, `PRESETS` | `./Canvas` (type `DocumentDimensions`) |
| `ArtboardDialog.test.tsx` | ~50 | Tests ArtboardDialog renders, applies dimensions, validates bad input, fires onClose. | — | `./ArtboardDialog` |
| `Canvas.tsx` | 381 | The SVG drawing surface: manages viewBox, zoom/pan, artboard rendering, grid, user guides, wireframe style, smart-guide overlay group, and cursor dispatch to the active tool. Emits `onStateChange` and `onSvgReady` callbacks. | `Canvas`, `DocumentDimensions`, `CanvasState` | `zoom`, `coordinates`, `tools/registry`, `selection`, `grid`, `smartGuides`, `wireframe`, `guides`, `artboard` |
| `Canvas.test.tsx` | ~50 | Tests SVG is rendered inside container, viewBox set to A4 with padding, artboard rect is present. | — | `./Canvas`, `model/artboard` |
| `ColorPicker.tsx` | 100 | Inline colour picker dropdown with a grid of preset swatches, hex input, and "none" option. | `ColorPicker` | — |
| `ContextMenu.tsx` | 58 | Generic right-click context menu: renders a portal-style floating menu, closes on outside click or Escape. | `ContextMenu`, `ContextMenuItem` | — |
| `ControlBar.tsx` | 254 | Top toolbar strip that shows position/size/rotation inputs for the selection and align/distribute buttons. Reads selection via `getSelection()` and dispatches `ModifyAttributeCommand`/`CompoundCommand`. | `ControlBar` | `selection`, `EditorContext`, `commands`, `pathOps`, `matrix`, `geometry` |
| `FillStrokeWidget.tsx` | 75 | Illustrator-style fill/stroke indicator in the tool strip: shows current default fill+stroke squares with swap and reset-to-default controls. | `FillStrokeWidget` | `model/defaultStyle` |
| `icons.tsx` | 150 | Static SVG icon definitions for every tool (select, direct-select, pen, pencil, line, rect, ellipse, eraser, text, eyedropper, measure, scissors, knife, lasso, free-transform). | `TOOL_ICONS`, individual named icon constants | — |
| `LayersPanel.tsx` | 180 | Side panel listing layers from the document model, with add/rename/delete/reorder/visibility/lock controls. Uses `subscribeSelection` to refresh. | `LayersPanel` | `EditorContext`, `document`, `commands`, `activeLayer`, `selection` |
| `MenuBar.tsx` | 76 | Generic menu bar: renders a list of `MenuDef` objects as a horizontal bar with drop-down items, separators, shortcuts, and disabled states. | `MenuBar` | — |
| `PropertiesPanel.tsx` | 684 | The right-side properties inspector: shows and edits all SVG attributes for the selection (position, size, fill, stroke, opacity, font, markers, gradients, skew, align/distribute). The heaviest component file. | `PropertiesPanel` | `selection`, `EditorContext`, `commands`, `ColorPicker`, `defaultStyle`, `markers`, `gradients`, `align`, `matrix`, `geometry` |
| `PropertiesPanel.test.tsx` | 199 | Tests PropertiesPanel renders "No selection" message, shows attribute fields when an element is selected. Heavy use of vi.mock. | — | `./PropertiesPanel` (mocks `selection`, `EditorContext`) |
| `Ruler.tsx` | 278 | Canvas-based horizontal (`HRuler`) and vertical (`VRuler`) rulers with adaptive tick intervals. Dragging from the ruler calls `addGuide()` to create a user guide. Exports `pickInterval` and `formatLabel` for unit tests. | `HRuler`, `VRuler`, `pickInterval`, `formatLabel`, `ViewBoxInfo` | `model/guides` |
| `Ruler.test.ts` | ~40 | Unit tests for `pickInterval` and `formatLabel` at various zoom levels. | — | `./Ruler` |
| `StatusBar.tsx` | 15 | Footer strip displaying cursor X/Y position and zoom percent. | `StatusBar` | — |
| `SwatchPanel.tsx` | 50 | Swatch palette panel: lists named colour swatches, supports add/remove. Accepts `onColorSelect` callback. **Not imported anywhere outside its own file** (orphaned component). | `SwatchPanel` | `model/swatches` |
| `ToolStrip.tsx` | 39 | Left-side vertical tool palette: lists all registered tools (except `eyedropper`), highlights the active one, calls `setActiveTool` on click. Renders `FillStrokeWidget` at the bottom. | `ToolStrip` | `tools/registry`, `./icons`, `./FillStrokeWidget` |

## src/model — 62 files

### Core architecture

| File | LOC | Responsibility | Main Exports | Notable Internal Deps |
|------|-----|----------------|--------------|----------------------|
| `activeLayer.ts` | 27 | Pub-sub singleton tracking which layer element receives new shapes. | `getActiveLayerElement`, `setActiveLayerElement`, `subscribeActiveLayer` | — |
| `commands.ts` | 274 | Command pattern infrastructure: `CommandHistory` (undo/redo stack, max 200), plus concrete commands: `AddElementCommand`, `RemoveElementCommand`, `ModifyAttributeCommand`, `ReorderElementCommand`, `GroupCommand`, `UngroupCommand`, `CompoundCommand`. | All above classes + `Command` interface | `document` (type only) |
| `commands.test.ts` | 211 | Tests for `AddElementCommand`, `RemoveElementCommand`, `ModifyAttributeCommand`, `CommandHistory` undo/redo, and `CompoundCommand`. | — | `./commands`, `./document` |
| `commandsNew.test.ts` | 285 | Tests for `ReorderElementCommand`, `GroupCommand`, `UngroupCommand` — all imported from `commands.ts` (despite the misleading "New" name; no `commandsNew.ts` source exists). | — | `./commands` |
| `document.ts` | 111 | `DocumentModel` interface + `createDocumentModel(svg)` factory. Also provides `generateId`, `resetIdCounter`, `syncIdCounter`. | `DocumentModel`, `generateId`, `resetIdCounter`, `syncIdCounter`, `createDocumentModel` | `activeLayer` |
| `document.test.ts` | 128 | Tests document model CRUD operations: addElement, removeElement, setAttribute, getLayerElements, serialize, getDefs. | — | `./document` |
| `EditorContext.tsx` | 162 | React context that owns `CommandHistory` and the `DocumentModel` reference. Wires up all global keyboard shortcuts (undo/redo, copy/cut/paste/duplicate, group/ungroup, delete, nudge, z-order, select-all, grid toggle). | `EditorProvider`, `useEditor` | `commands`, `document`, `selection`, `tools/registry`, `grid`, `clipboard`, `nudge`, `zOrder` |
| `selection.ts` | 277 | Pub-sub singleton managing the selected-element set plus SVG overlay rendering (handles, rotation handle). Depends on `geometry` for bbox math. | `getSelection`, `setSelection`, `clearSelection`, `toggleSelection`, `removeFromSelection`, `subscribeSelection`, `refreshOverlay`, `refreshOverlaySync`, `setOverlayGroup`, `HandlePosition` | `geometry` |
| `selection.test.ts` | 245 | Tests selection set management, overlay update, subscriptions. | — | `./selection`, `./geometry` |

### Geometry & math

| File | LOC | Responsibility | Main Exports | Notable Internal Deps |
|------|-----|----------------|--------------|----------------------|
| `coordinates.ts` | 67 | Screen↔document coordinate conversions, viewBox parsing/setting, `getZoomPercent`. | `screenToDoc`, `docToScreen`, `parseViewBox`, `setViewBox`, `getZoomPercent` | — |
| `coordinates.test.ts` | ~40 | Tests for coordinate conversion functions. | — | `./coordinates` |
| `geometry.ts` | 213 | Transform-aware AABB computation (`transformedAABB`), element AABB extraction (`getElementAABB`), hit testing (`hitTestElement`, `hitTestAll`), translation attribute computation (`computeTranslateAttrs`). Central geometry hub. | `BBox`, `transformedAABB`, `getElementAABB`, `hitTestElement`, `hitTestAll`, `computeTranslateAttrs` | `matrix`, `pathOps`, `coordinates` |
| `matrix.ts` | 199 | 2D affine matrix math: identity, translate, scale, rotate, multiply, invert, decompose, apply to point, parse SVG `transform` attribute, serialize back to string. Also `parseSkew`/`setSkew`. | `Matrix`, all matrix functions | — |
| `matrix.test.ts` | 378 | Extensive unit tests for all matrix operations. | — | `./matrix` |
| `zoom.ts` | 66 | Zoom-at-point logic (scroll-wheel zooming keeping the cursor doc-point stable) and fit-to-page. Uses pure viewBox math rather than DOM APIs for testability. | `zoomAtPoint`, `fitToPage` | `coordinates` |
| `zoom.test.ts` | 97 | Tests zoom-at-point and fit-to-page. | — | `./zoom` |

### Path processing

| File | LOC | Responsibility | Main Exports | Notable Internal Deps |
|------|-----|----------------|--------------|----------------------|
| `pathOps.ts` | 668 | Core SVG path library: parse `d` to `PathCommand[]`, convert back to string, split at parameter t, find nearest segment point, translate/scale path, join two paths, compute intersections, `intersectLineWithPath`, `splitPathAt`. The largest model file. | `PathCommand`, `parsePathD`, `commandsToD`, `translatePathD`, `scalePathD`, `splitPathAt`, `splitPathAtT`, `nearestSegment`, `joinPaths`, `intersectLineWithPath` | — |
| `pathOps.test.ts` | 207 | Tests for parsePathD, commandsToD, splitPathAt, nearestSegment, joinPaths. | — | `./pathOps` |
| `pathBooleans.ts` | 80 | Boolean path operations (unite/subtract/intersect/exclude/divide) via lazy-loaded Paper.js WASM. | `pathBoolean` | — (dynamic `import('paper')`) |
| `pathBooleans.test.ts` | ~50 | Tests (likely skipped/mocked given WASM dependency). | — | `./pathBooleans` |
| `pathSimplify.ts` | 63 | Ramer-Douglas-Peucker path simplification for the pencil tool. | `simplifyPath`, `pointsToPathD`, `Point` | — |
| `pathSimplify.test.ts` | 83 | Tests simplification with varying epsilon values. | — | `./pathSimplify` |
| `compoundPath.ts` | 50 | Combine multiple d-strings into one compound path and split them back. | `makeCompoundD`, `releaseCompoundD` | — |
| `compoundPath.test.ts` | ~40 | Tests make/release round-trips. | — | `./compoundPath` |
| `offsetPath.ts` | 218 | Offset path algorithm: sample path densely, compute outward normals, fit cubic Béziers through offset points. | `offsetPathD` | `pathOps` |
| `offsetPath.test.ts` | ~50 | Tests offset path returns a valid d string. | — | `./offsetPath` |
| `shapeToPath.ts` | 111 | Convert SVG shape primitives (rect, ellipse, circle, line, polyline, polygon) to `path` d strings. Also `extractStyleAttrs`. | `rectToPathD`, `ellipseToPathD`, `elementToPathD`, `extractStyleAttrs` | — |
| `shapeToPath.test.ts` | 77 | Tests each shape converter. | — | `./shapeToPath` |

### Document features

| File | LOC | Responsibility | Main Exports | Notable Internal Deps |
|------|-----|----------------|--------------|----------------------|
| `align.ts` | 132 | Align and distribute operations for multi-selection: compute translation deltas, apply them. | `computeAlign`, `computeDistribute`, `applyDelta`, `AlignOp`, `DistributeOp` | `geometry` |
| `artboard.ts` | 137 | Multi-artboard state: add/remove/activate artboards, horizontal layout with gap, `computeDocumentBounds`. | `Artboard`, `getArtboards`, `addArtboard`, `getActiveArtboard`, `subscribeArtboards`, `computeDocumentBounds`, `resetArtboards` | — |
| `artboard.test.ts` | 112 | Tests artboard CRUD, active switching, `computeDocumentBounds`. | — | `./artboard` |
| `clipboard.ts` | 93 | Copy/cut/paste/duplicate selection using XML serialization + DOM import. | `copySelection`, `cutSelection`, `pasteClipboard`, `duplicateSelection` | `commands`, `document`, `geometry`, `selection` |
| `clipping.ts` | 157 | Make/release SVG clipping masks (`<clipPath>` in defs). Implements `ClipMaskCommand` and `ReleaseClipMaskCommand`. | `ClipMaskCommand`, `makeClippingMask`, `releaseClippingMask`, `hasClipPath` | `document`, `commands` |
| `clipping.test.ts` | 123 | Tests make + release + undo round-trips. | — | `./clipping`, `./document` |
| `defaultStyle.ts` | 39 | Pub-sub singleton for the current default stroke/fill/strokeWidth (read by drawing tools). | `DefaultStyle`, `getDefaultStyle`, `setDefaultStyle`, `subscribeDefaultStyle` | — |
| `gradients.ts` | 146 | Create/update linear and radial `<linearGradient>`/`<radialGradient>` definitions in SVG defs, detect fill type of an element. | `FillType`, `LinearGradientDef`, `RadialGradientDef`, `detectFillType`, `createLinearGradient`, `createRadialGradient`, `parseGradientColors` | `document` |
| `grid.ts` | 128 | Grid state: visibility, snap-enabled, major/minor spacing, pub-sub, `renderGrid`, `snapToGrid`. | `GridSettings`, `getGridSettings`, `setGridSettings`, `toggleGridVisible`, `toggleGridSnap`, `renderGrid`, `snapToGrid`, `subscribeGrid` | — |
| `guides.ts` | ~60 | User placement guides (horizontal/vertical lines at fixed positions). Also exports `getGuideCandidates` for smart-guide snap. | `Guide`, `addGuide`, `removeGuide`, `clearAllGuides`, `getGuides`, `subscribeGuides`, `getGuideCandidates`, `resetGuides` | — |
| `guides.test.ts` | ~50 | Tests add/remove/subscribe/getGuideCandidates. | — | `./guides` |
| `markers.ts` | 106 | Arrow-marker preset definitions and lazy creation in SVG `<defs>`. | `MarkerType`, `MARKER_TYPES`, `getMarkerLabel`, `getMarkerUrl`, `parseMarkerType`, `ensureMarkerDef` | — |
| `nudge.ts` | 31 | Arrow-key nudge: moves all selected elements by (dx, dy) using `computeTranslateAttrs`. | `nudgeSelection` | `commands`, `geometry`, `selection` |
| `opacityMask.ts` | 116 | Make/release SVG opacity masks (`<mask>` in defs). Mirrors `clipping.ts` pattern exactly. | `MaskCommand`, `makeOpacityMask`, `releaseOpacityMask`, `hasMask` | `document`, `commands` |
| `opacityMask.test.ts` | ~60 | Tests make + release + undo for opacity masks. | — | `./opacityMask`, `./document` |
| `reflect.ts` | 87 | Compute attribute changes to flip elements horizontally or vertically about their center. | `computeReflectH`, `computeReflectV` | `geometry` |
| `reflect.test.ts` | 122 | Tests each element type's reflect deltas. | — | `./reflect` |
| `smartGuides.ts` | 287 | Smart guides: collect alignment candidates from scene elements, compute snap deltas, render/clear guide line SVG overlay. Also point-snap support for line tool (`collectPointCandidates`, `snapToNearestPoint`). | `setGuideGroup`, `cacheSmartGuideCandidates`, `clearCachedCandidates`, `computeSmartGuides`, `renderGuides`, `clearGuides`, `PointCandidate`, `collectPointCandidates`, `snapToNearestPoint` | `geometry`, `guides` |
| `smartGuides.test.ts` | 95 | Tests snap computation and guide rendering. | — | `./smartGuides` |
| `swatches.ts` | 72 | Named colour swatch palette with localStorage persistence. | `Swatch`, `getSwatches`, `addSwatch`, `removeSwatch`, `subscribeSwatches` | — |
| `swatches.test.ts` | 50 | Tests CRUD operations on the swatch store. | — | `./swatches` |
| `textPath.ts` | 114 | Place a `<text>` element along a `<path>` using `<textPath href>`, and release it back. | `placeTextOnPath`, `releaseTextFromPath`, `hasTextPath` | `document`, `commands` |
| `textPath.test.ts` | 110 | Tests placeTextOnPath and releaseTextFromPath undo. | — | `./textPath`, `./document` |
| `wireframe.ts` | 34 | Toggle wireframe/outline view: pub-sub flag plus the CSS string (`WIREFRAME_STYLE`) injected by Canvas. | `isWireframe`, `toggleWireframe`, `setWireframe`, `subscribeWireframe`, `WIREFRAME_STYLE`, `resetWireframe` | — |
| `wireframe.test.ts` | 49 | Tests toggle, subscribe, reset. | — | `./wireframe` |
| `zOrder.ts` | 51 | Z-order operations (bring forward/back, to front/back) wrapping `ReorderElementCommand`. | `bringForward`, `sendBackward`, `bringToFront`, `sendToBack` | `commands`, `selection` |
| `areaText.ts` | 66 | Word-wrap text to fit a bounding rectangle width using approximate character widths; returns `<tspan>` lines. | `wrapText`, `buildAreaTextElement` | — |
| `areaText.test.ts` | ~40 | Tests wrapText with various inputs. | — | `./areaText` |

### Export/Import

| File | LOC | Responsibility | Main Exports | Notable Internal Deps |
|------|-----|----------------|--------------|----------------------|
| `fileio.ts` | 338 | SVG/PDF/PNG/TikZ export and SVG/image import. Strips editor overlays before export. Uses jsPDF + svg2pdf for PDF. Exports `exportSvgString`, `parseSvgString` for tests. | `exportSvg`, `exportPdf`, `exportPng`, `exportTikz`, `importSvg`, `placeImage`, `exportSvgString`, `parseSvgString` | `document`, `selection`, `commands`, `tikzExport`, `jspdf`, `svg2pdf.js` |
| `fileio.test.ts` | 217 | Tests exportSvgString strips overlays, parseSvgString extracts layers/defs. | — | `./fileio`, `./document` |
| `pdfImport.ts` | 153 | PDF import via lazy-loaded MuPDF WASM: renders page to SVG, post-processes, pipes through `parseSvgString`. | `importPdf` | `document`, `selection`, `fileio` (+ dynamic `import('mupdf')`) |
| `pdfImport.test.ts` | ~40 | Tests (likely skipped due to WASM). | — | `./pdfImport` |
| `tikzExport.ts` | 178 | Converts SVG elements to TikZ drawing commands. Handles rect, ellipse, path, text, line. Y-axis inversion applied. | `svgToTikz`, `hexToTikzColor` | — |
| `tikzExport.test.ts` | 119 | Tests `hexToTikzColor` and element-to-TikZ conversion. | — | `./tikzExport` |

### Test-only / omnibus tests

| File | LOC | Responsibility |
|------|-----|----------------|
| `pureLogic.test.ts` | 442 | Omnibus pure-logic tests: covers `defaultStyle`, `grid`, `markers`, `geometry` — no single corresponding source file. |

## src/tools — 26 files

| File | LOC | Responsibility | Main Exports | Notable Internal Deps |
|------|-----|----------------|--------------|----------------------|
| `registry.ts` | 84 | Tool registry: `registerTool`, `setActiveTool`, `getActiveTool`, `getAllTools`, `findToolByShortcut`, `subscribe`, `isKeyboardCaptured`, `setKeyboardCapture`. | `ToolConfig`, `ToolEventHandlers`, and all registry functions | — |
| `registry.test.ts` | 105 | Tests tool registration, activation, subscription, keyboard capture. | — | `./registry` |
| `registerAllTools.ts` | 43 | Calls each tool's `register*` function and sets `select` as the default active tool. | `registerAllTools` | All tool files, `registry`, `model/document`, `model/commands` |
| `useToolShortcuts.ts` | 21 | React hook that wires single-key shortcuts to `setActiveTool` (skips when keyboard is captured or Ctrl/Alt/Meta held). | `useToolShortcuts` | `./registry` |
| `selectTool.ts` | 736 | Selection tool (V): click-to-select, marquee drag, move, 8-handle scale, rotation handle, shift-toggle, smart-guide snap during move. Heaviest tool file. | `registerSelectTool` | `registry`, `coordinates`, `selection`, `document`, `commands`, `grid`, `smartGuides`, `geometry`, `pathOps`, `matrix` |
| `selectTool.test.ts` | 520 | Tests for hit-test, marquee, move, scale, rotate, shift-select. | — | `./selectTool`, model mocks |
| `directSelectTool.ts` | 502 | Direct-select tool (A): edit path anchor points and Bézier handles individually. Exports `parsePathWithHandles` for external use. | `registerDirectSelectTool`, `parsePathWithHandles`, `ControlPoints` | `registry`, `coordinates`, `geometry`, `document`, `commands`, `shapeToPath` |
| `directSelectTool.test.ts` | 121 | Tests `parsePathWithHandles` for M/L/C/Z path data. | — | `./directSelectTool` |
| `penTool.ts` | 392 | Pen tool (P): click/drag to place anchor points with Bézier handles, close path, auto-switch to select on commit. | `registerPenTool` | `registry`, `coordinates`, `commands`, `document`, `defaultStyle`, `selection` |
| `penTool.test.ts` | 275 | Tests anchor placement, path close, preview rendering. | — | `./penTool`, registry mocks |
| `textTool.ts` | 419 | Text tool (T): click to place, type with cursor/selection/caret blink, Backspace/Delete/arrows/Shift-select, commits on Escape or tool-switch. | `registerTextTool`, `createTextTool` | `registry`, `coordinates`, `commands`, `document`, `defaultStyle` |
| `textTool.test.ts` | 233 | Tests typing, backspace, selection, commit. | — | `./textTool` |
| `freeTransformTool.ts` | 313 | Free-transform tool (Q): corner-handles scale, outside-corner rotate (15° snap), edge-midpoint+Ctrl skew. | `registerFreeTransformTool` | `registry`, `coordinates`, `selection`, `commands`, `document`, `matrix`, `pathOps` |
| `freeTransformTool.test.ts` | 67 | Tests scale, rotate, skew mode detection. | — | `./freeTransformTool` |
| `lineTool.ts` | 202 | Line tool (L): drag to draw `<line>`, shift-constrain to 45° angles, snap-to-point via smartGuides. Auto-switches to select on commit. | `registerLineTool` | `registry`, `coordinates`, `commands`, `document`, `defaultStyle`, `grid`, `selection`, `smartGuides` |
| `rectTool.ts` | 156 | Rectangle tool (R): drag to draw `<rect>`, shift=square, Ctrl=from-center. Snap-to-grid. | `registerRectTool` | `registry`, `coordinates`, `commands`, `document`, `defaultStyle`, `grid`, `selection` |
| `ellipseTool.ts` | 160 | Ellipse tool (E): drag to draw `<ellipse>`, shift=circle, Ctrl=corner-mode. Snap-to-grid. | `registerEllipseTool` | `registry`, `coordinates`, `commands`, `document`, `defaultStyle`, `grid`, `selection` |
| `pencilTool.ts` | 120 | Pencil/freehand tool (B): capture pointer points, simplify with RDP, commit as `<path>`. | `registerPencilTool` | `registry`, `coordinates`, `commands`, `document`, `defaultStyle`, `pathSimplify`, `selection` |
| `eraserTool.ts` | 130 | Eraser tool (X): hover highlights, click/drag erases touched elements via `RemoveElementCommand`. | `registerEraserTool` | `registry`, `commands`, `document`, `selection`, `geometry` |
| `eyedropperTool.ts` | 39 | Eyedropper tool (I): click to sample stroke/fill/strokeWidth from any element into `defaultStyle`. Hidden from tool strip. | `registerEyedropperTool` | `registry`, `document`, `defaultStyle`, `geometry` |
| `measureTool.ts` | 139 | Measure tool (M): drag to draw a measurement line, shows distance in mm as SVG text overlay (not committed to document). | `registerMeasureTool`, `measureDistance` | `registry`, `coordinates`, `document` |
| `scissorsTool.ts` | 89 | Scissors tool (C): click on a path to split it at the nearest point using `splitPathAt`. | `registerScissorsTool` | `registry`, `coordinates`, `commands`, `document`, `pathOps` |
| `knifeTool.ts` | 168 | Knife tool (K): drag a cut line, splits all intersecting paths at intersection points. | `registerKnifeTool` | `registry`, `coordinates`, `commands`, `document`, `pathOps`, `shapeToPath` |
| `lassoTool.ts` | 141 | Lasso tool (O): freeform polygon selection using ray-casting point-in-polygon test. | `registerLassoTool`, `pointInPolygon` | `registry`, `coordinates`, `selection`, `geometry`, `document` |
| `lassoTool.test.ts` | 42 | Tests `pointInPolygon` with various polygons. | — | `./lassoTool` |
| `snapAngle.test.ts` | 156 | Tests the `snapLineAngle` function — **duplicates the private function from `lineTool.ts`** because it is not exported. The comment explicitly notes this and warns it must stay in sync. | — | — (self-contained duplicate) |

## src/test — 1 file

| File | LOC | Responsibility | Main Exports |
|------|-----|----------------|--------------|
| `setup.ts` | 1 | Vitest global test setup: imports `@testing-library/jest-dom` to extend matchers. | — |

## Hotspots & Suspicious Patterns

### Unusually large / complex files

| File | LOC | Notes |
|------|-----|-------|
| `tools/selectTool.ts` | 736 | Largest file. Five drag modes, selection logic, bbox maths, smart-guide integration, scale & rotate. Candidate for decomposition. |
| `model/pathOps.ts` | 668 | Wide responsibility: parsing, serialization, split, nearest-segment, translate, scale, join, line intersection. Could split into parser/transformer/query sub-modules. |
| `components/PropertiesPanel.tsx` | 684 | One mega-component covers all attribute editing, gradients, markers, font, skew, align/distribute. Hard to test; 199-line test needs heavy mocking. |
| `model/pureLogic.test.ts` | 442 | Omnibus test file covering 4 unrelated modules; should be split. |
| `tools/directSelectTool.ts` | 502 | Complex anchor/handle rendering and dragging logic. |
| `App.tsx` | 464 | Owns all menu definitions plus Object menu operations inline — a lot of business logic at the component-tree root. |

### Commented-out code / "sorry"-style placeholders

| Location | Note |
|----------|------|
| `model/textPath.ts:26` | `// Oops — we don't want a new element, just an id. Set it directly.` — known workaround, not cleaned up. |
| `model/pathBooleans.ts:8,42` | `eslint-disable-next-line @typescript-eslint/no-explicit-any` — Paper.js lazy load. |
| `model/pdfImport.ts:15` | Same pattern for MuPDF WASM lazy load. |
| `components/Canvas.tsx:139` | `eslint-disable react-hooks/exhaustive-deps` — dep array intentionally omitted. |

No TODO/FIXME/HACK/XXX annotations found in source.

### Possibly unused files

| File | Evidence |
|------|----------|
| `components/SwatchPanel.tsx` | Exported `SwatchPanel` is never imported by any other src/ file — orphaned. |

### Files with overlapping / duplicated responsibilities

| Pair | Overlap |
|------|---------|
| `model/clipping.ts` + `model/opacityMask.ts` | Near-identical structure: both implement a `make/release` command pair with `<defs>` injection. `opacityMask.ts` header explicitly says "Mirrors the clipping.ts pattern exactly." Could share base class. |
| `tools/snapAngle.test.ts` + `tools/lineTool.ts` | `snapLineAngle` is duplicated verbatim into the test because the source is private. Either export it or move to integration tests. |
| `model/commandsNew.test.ts` + `model/commands.test.ts` | Both test `commands.ts`. The split is historical (no `commandsNew.ts` source) — confusing naming. |
| `tools/freeTransformTool.ts` + `tools/selectTool.ts` | Both implement scale and rotate with matrix math; some duplication. |

## Summary figures

| Directory | File count (source + test) | LOC (est.) |
|-----------|---------------------------|-----------|
| src/ root | 3 | ~491 |
| src/components | 18 | ~3,133 |
| src/model | 62 | ~8,573 |
| src/tools | 26 | ~5,373 |
| src/test | 1 | 1 |
| **Total** | **110** | **~17,570** |
