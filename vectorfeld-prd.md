# vectorfeld — Product Requirements Document

**Version:** 0.1.0 (MVP)
**Date:** 2026-03-01
**Author:** Tobias (product owner) + Claude (technical author)

---

## 1. Vision

**vectorfeld** is a hyper-personal vector graphics editor built for one user. It implements only the features its owner actually uses, with no feature bloat, no subscription, no learning curve for unused functionality. It is designed to be extended incrementally through continued AI-assisted development.

The guiding philosophy: natural language and precision input for nearly everything, GUI only for the workflow steps where direct manipulation genuinely matters (canvas interaction, spatial selection, visual feedback).

---

## 2. Use Cases

### 2.1 Primary: Scientific Diagram Creation (MVP)

Create publication-quality vector diagrams for inclusion in LaTeX documents via `\includegraphics{}`. Diagram types include quantum circuits, geometric constructions, graphs, lattice structures, region visualisations, and schematic figures. Final output is PDF (via SVG export and conversion) or SVG directly.

Workflow: rough placement via mouse → precision pass with exact coordinates/dimensions → style → export.

### 2.2 Secondary: Surgical PDF Editing (Phase 2)

Open an existing PDF (often originating from Microsoft Word), decompose it into editable vector objects, make targeted fixes (text corrections, line adjustments, repositioning), and re-export. Font fidelity is critical — embedded font subsets must be extracted and reused for edited text.

---

## 3. Design Principles

1. **Modularity is the law.** Every feature is an independent module. Adding a feature never requires modifying unrelated code.
2. **TDD is the law.** Tests are written first when at all possible. Red-green-refactor.
3. **~200 LOC per implementation step.** Each atomic unit of work is small, testable, and tracked as a beads issue.
4. **SVG is the internal representation.** The document model is SVG. The browser renders it natively. No conversion pipeline.
5. **Metric units.** The coordinate system and all user-facing dimensions are in millimetres/centimetres.
6. **Research issues are explicit.** If an implementation step has unresolved technical questions, it is flagged as a research issue before any code is written.
7. **Incremental dogfooding.** The MVP is the smallest set of features that enables real diagram work. Everything else is added as needed through use.

---

## 4. Architecture

### 4.1 Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Shell | Tauri v2 | Native window, small binary, cross-platform (Linux + Windows). Uses OS webview. |
| Frontend | React + TypeScript + Vite | Fastest LLM-assisted iteration. Best HMR. Highest code generation reliability. |
| Styling | Tailwind CSS (constrained palette) | Minimal UI chrome. No component library. |
| IR | SVG DOM | Browser-native rendering. The document *is* the display. |
| Canvas | SVG element managed imperatively via React refs | React handles UI chrome (toolbar, panels, inputs). SVG canvas is outside React's virtual DOM reconciliation. |
| Backend (Tauri/Rust) | Thin — filesystem, dialogs, export only | Touched rarely. Plugins cover most native needs. |
| Testing | Vitest (unit/integration), Playwright (e2e when needed) | Vitest is Vite-native, fast, TypeScript-first. |

### 4.2 Development Environment

- **Primary development:** WSL2 (Ubuntu)
- **Build toolchain:** Node.js + npm + Vite in WSL2
- **Daily workflow:** Develop and test frontend against `localhost:5173` in a Windows browser. 95% of work requires no Tauri involvement.
- **Tauri testing:** Invoked only for native features (file dialogs, system export). Run from Windows side or WSL2+WSLg for spot checks.
- **AI tooling:** Claude Code (100% of implementation)
- **Issue tracking:** beads CLI

### 4.3 Module Structure

Each feature is a self-contained module exposing:
- A tool registration (name, icon, keyboard shortcut)
- Mouse/keyboard event handlers (when the tool is active)
- SVG manipulation functions (pure, testable)
- Optional UI panel (React component)

The application core provides:
- Tool registry and switching
- Canvas (SVG viewport, pan/zoom, coordinate transforms)
- Document model (SVG DOM wrapper with undo history)
- Event dispatch (routes input events to the active tool)

---

## 5. MVP Feature Set (Phase 1)

22 features, grouped by function:

### 5.1 Drawing Tools

| # | Feature | Description |
|---|---------|-------------|
| 1 | Line segment | Click start point, click/drag to end point. Creates SVG `<line>`. |
| 2 | Rectangle | Click corner, drag to opposite corner. Shift constrains to square. Creates SVG `<rect>`. |
| 4 | Ellipse | Click center, drag for radii. Shift constrains to circle. Creates SVG `<ellipse>`. |
| 9 | Pen tool (Bézier) | Click to place anchor points, drag to create control handles. Creates SVG `<path>` with cubic Bézier segments. |
| 12 | Eraser | Click/drag over path segments or objects to delete them. |

### 5.2 Selection & Manipulation

| # | Feature | Description |
|---|---------|-------------|
| 13 | Selection tool | Click to select object. Click+drag for marquee. Shift+click to add/remove from selection. |
| 14 | Direct selection | Click to select individual anchor points and control handles. Drag to move them. |
| 17 | Group / ungroup | Group selected objects. Ungroup selected group. Groups behave as single object for selection and transforms. |
| 18 | Move | Drag selected objects. Arrow keys for nudge. Type exact offset values. |
| 19 | Scale | Drag handles on selection bounding box. Type exact scale factor or target dimensions. |
| 20 | Rotate | Drag rotation handle. Type exact angle. |

### 5.3 Organisation

| # | Feature | Description |
|---|---------|-------------|
| 34 | Layers panel | Layer list with ordering (drag to reorder), visibility toggle, lock toggle. Each layer maps to a top-level SVG `<g>`. |
| 60 | Copy / paste / duplicate | Standard clipboard operations. Duplicate offsets slightly from original. |
| 61 | Arrange | Bring to front, send to back, bring forward, send backward within layer. |

Note: #61 (arrange/z-order) was not in the original MVP selection but is necessary for any multi-object workflow. Added as essential.

### 5.4 Styling

| # | Feature | Description |
|---|---------|-------------|
| 35 | Stroke weight | Numeric input for stroke width (in current units). |
| 39 | Solid color fill | Color picker: preset palette + hex/RGB input. Applies to fill and/or stroke. |

### 5.5 Text

| # | Feature | Description |
|---|---------|-------------|
| 45 | Point text | Click on canvas to place text cursor. Type. Creates SVG `<text>`. |
| 48 | Font selection / size / spacing | Font family dropdown (system fonts), size input, letter-spacing input. |

### 5.6 Infrastructure

| # | Feature | Description |
|---|---------|-------------|
| 56 | Artboard setup | Document dimensions (width × height in mm/cm), orientation. Maps to SVG `viewBox` and root element dimensions. |
| 58 | Zoom / pan | Scroll wheel to zoom, middle-click drag or space+drag to pan. Zoom level indicator. |
| 59 | Undo / redo | Full undo/redo stack. Ctrl+Z / Ctrl+Shift+Z. Operates on document model snapshots or command history. |
| 70 | SVG export | Save document as SVG file. Native file dialog via Tauri. |
| 75 | SVG import | Open existing SVG file and load into the editor as editable objects. |

---

## 6. Coordinate System & Units

- **User-facing units:** millimetres (mm) with centimetres (cm) as secondary. Configurable units is a future feature.
- **Internal representation:** SVG user units, with a fixed mapping to mm. The SVG `viewBox` is set such that 1 SVG unit = 1 mm. For a document that is 210mm × 297mm (A4), `viewBox="0 0 210 297"`.
- **Pixel mapping:** Zoom level determines the screen-pixel-to-mm ratio. At 100% zoom, 1mm ≈ 3.78 screen pixels (96 DPI convention).
- **Coordinate display:** Status bar shows cursor position in mm. All numeric inputs accept mm values.
- **Relative positioning:** Objects can be positioned relative to other objects ("2mm right of X"). This is a one-shot operation — it computes the absolute position and places the object there. No persistent constraint (persistent constraints are a future feature).

---

## 7. UI Design

### 7.1 Aesthetic

Functional, dense, neutral. No gradients, no rounded-everything, no decorative elements. The canvas is the focus; chrome stays out of the way.

- **Palette:** grays for chrome, white canvas, one accent color for selection/active state
- **Typography:** system font stack for UI, monospace for coordinate/dimension readouts
- **Controls:** small, sharp, tight spacing. Every element earns its pixels
- **No component library.** Fewer than 15 distinct UI elements needed — built from scratch

### 7.2 Layout

```
┌─────────────────────────────────────────────────┐
│ Toolbar (horizontal, top)                       │
├────────┬────────────────────────────┬───────────┤
│ Layers │                            │ Properties│
│ Panel  │        Canvas (SVG)        │ Panel     │
│ (left) │                            │ (right)   │
├────────┴────────────────────────────┴───────────┤
│ Status bar: coordinates, zoom, units, selection │
└─────────────────────────────────────────────────┘
```

- Toolbar: tool selection buttons, active tool highlighted
- Layers panel: collapsible, left side
- Properties panel: context-sensitive (shows stroke/fill/transform for selected object, font properties for text), collapsible, right side
- Status bar: always visible, shows cursor position (mm), zoom level, selection info

---

## 8. Document Model

The document is an SVG DOM tree with a thin wrapper that provides:

- **Serialisation:** the document can be serialised to SVG string at any time (this *is* the file format)
- **Undo/redo:** command-based history. Each user action is a reversible command object (e.g., `AddElement`, `MoveElement`, `ChangeAttribute`). Undo replays the inverse. This is more memory-efficient than full DOM snapshots and enables granular undo.
- **Layer mapping:** top-level `<g>` elements with `data-layer-name` attributes
- **Metadata:** document dimensions, units, and editor state stored in SVG `<metadata>` element or namespaced attributes

---

## 9. Phase 2 Features (Post-MVP, Prioritised)

Listed in approximate priority order. Each becomes a set of beads issues when the time comes.

1. **PDF import** — decompose PDF into editable SVG objects, extract embedded font subsets
2. **PDF export** — render SVG to PDF (via Tauri backend or WASM library)
3. **Align & distribute** (#24, #25)
4. **Snap to grid, snap to point, smart guides** (#52, #53, #54)
5. **Guides** (#50)
6. **Grid display** (#51)
7. **Path booleans** — unite, subtract, intersect, exclude, divide (#26–#30)
8. **Compound paths** (#31)
9. **Clipping masks** (#32)
10. **Linear gradient fill** (#40)
11. **Radial gradient fill** (#41)
12. **Stroke dash patterns, caps, joins** (#36, #37, #38)
13. **Area text** (#46)
14. **Text on a path** (#47)
15. **Arrow markers** (#63)
16. **Offset path** (#64)
17. **Eyedropper** (#43)
18. **Color swatches** (#44)
19. **Pencil tool** (#10)
20. **Brush tool** (#11)
21. **Lasso selection** (#15)
22. **Magic wand** (#16)
23. **Reflect / mirror** (#21)
24. **Shear / skew** (#22)
25. **Free transform** (#23)
26. **Rulers** (#49)
27. **Measure tool** (#55)
28. **Multiple artboards** (#57)
29. **Outline / wireframe view** (#62)
30. **Simplify path** (#65)
31. **Join / average anchors** (#66)
32. **Scissors tool** (#67)
33. **Knife tool** (#68)
34. **Blend tool** (#69)
35. **PNG export** (#72)
36. **Raster image embedding** (#76)
37. **Image trace** (#77)
38. **Opacity / transparency** (#80)
39. **Opacity masks** (#33)
40. **Appearance panel** (#81)
41. **TikZ export** — render document to TikZ commands for direct LaTeX inclusion
42. **Persistent constraints** — objects defined relative to others, maintained on move
43. **Natural language command input** — type commands to manipulate objects

---

## 10. Implementation Plan (MVP)

All steps tracked as beads issues. Each step is ~200 LOC, has tests, and is atomic.

### Sprint 0: Scaffolding

| Issue | Description | Depends on |
|-------|-------------|------------|
| S0-01 | Tauri v2 + React + TypeScript + Vite project scaffold | — |
| S0-02 | Vitest setup with basic smoke test | S0-01 |
| S0-03 | Project structure: module registry, canvas component, app shell layout | S0-02 |
| S0-04 | SVG canvas component with viewBox, managed via ref (outside React reconciliation) | S0-03 |

### Sprint 1: Canvas Fundamentals

| Issue | Description | Depends on |
|-------|-------------|------------|
| S1-01 | Coordinate system: viewBox mapping (1 unit = 1mm), screen↔document coordinate conversion | S0-04 |
| S1-02 | Zoom (scroll wheel) with coordinate-stable zoom (zoom towards cursor) | S1-01 |
| S1-03 | Pan (middle-click drag + space+drag) | S1-01 |
| S1-04 | Status bar: cursor position in mm, zoom level display | S1-02 |
| S1-05 | Artboard setup: document dimensions dialog, updates viewBox | S1-01 |

### Sprint 2: Document Model & Undo

| Issue | Description | Depends on |
|-------|-------------|------------|
| S2-01 | Document model: thin SVG DOM wrapper with element add/remove/modify | S1-01 |
| S2-02 | Command history: base command interface (execute/undo), history stack | S2-01 |
| S2-03 | Undo/redo keybindings (Ctrl+Z, Ctrl+Shift+Z) wired to command history | S2-02 |

### Sprint 3: Core Drawing Tools

| Issue | Description | Depends on |
|-------|-------------|------------|
| S3-01 | Tool registry: register/switch tools, active tool state, keyboard shortcuts | S2-01 |
| S3-02 | Line tool: click start, click end, creates `<line>` via AddElement command | S3-01 |
| S3-03 | Rectangle tool: click-drag, shift-constrain to square, creates `<rect>` | S3-01 |
| S3-04 | Ellipse tool: click-drag from center, shift-constrain to circle, creates `<ellipse>` | S3-01 |
| S3-05 | Toolbar UI: tool buttons with active state indication | S3-01 |

### Sprint 4: Selection & Basic Manipulation

| Issue | Description | Depends on |
|-------|-------------|------------|
| S4-01 | Selection tool: click to select, click empty to deselect, visual selection indicator (bounding box) | S3-01 |
| S4-02 | Marquee selection: click-drag rectangle to select contained objects | S4-01 |
| S4-03 | Multi-select: shift+click to toggle selection membership | S4-01 |
| S4-04 | Move: drag selected objects, creates MoveElement command | S4-01 |
| S4-05 | Move: arrow key nudge (1mm) and shift+arrow (10mm) | S4-04 |
| S4-06 | Move: numeric input for exact offset in properties panel | S4-04 |
| S4-07 | Delete selected objects (Delete/Backspace key) | S4-01 |

### Sprint 5: Transforms

| Issue | Description | Depends on |
|-------|-------------|------------|
| S5-01 | Selection bounding box with scale handles (8 points) | S4-01 |
| S5-02 | Scale: drag corner handle, shift-constrain proportions | S5-01 |
| S5-03 | Scale: numeric input for exact dimensions/factor | S5-02 |
| S5-04 | Rotation handle on selection bounding box | S5-01 |
| S5-05 | Rotate: drag rotation handle, shift-constrain to 15° increments | S5-04 |
| S5-06 | Rotate: numeric input for exact angle | S5-05 |

### Sprint 6: Styling

| Issue | Description | Depends on |
|-------|-------------|------------|
| S6-01 | Properties panel shell: context-sensitive, shows for selected object | S4-01 |
| S6-02 | Stroke weight: numeric input in properties panel, applies to selection | S6-01 |
| S6-03 | Color picker: preset palette (16–20 colors) + hex input | S6-01 |
| S6-04 | Apply fill color to selection | S6-03 |
| S6-05 | Apply stroke color to selection | S6-03 |
| S6-06 | Default style: new objects inherit last-used stroke/fill | S6-04, S6-05 |

### Sprint 7: Organisation

| Issue | Description | Depends on |
|-------|-------------|------------|
| S7-01 | Layers panel UI: list of layers, add/delete layer | S2-01 |
| S7-02 | Layer visibility toggle, lock toggle | S7-01 |
| S7-03 | Layer reordering (drag or up/down buttons) | S7-01 |
| S7-04 | Active layer: new objects are created in the active layer | S7-01 |
| S7-05 | Group: group selected objects into `<g>`, ungroup | S4-01 |
| S7-06 | Copy / paste / duplicate (Ctrl+C, Ctrl+V, Ctrl+D) | S4-01 |
| S7-07 | Arrange: bring to front, send to back, forward, backward (within layer) | S7-01 |

### Sprint 8: Pen Tool (Bézier Paths)

| Issue | Description | Depends on |
|-------|-------------|------------|
| S8-01 | Pen tool: click to place anchor points connected by straight segments | S3-01 |
| S8-02 | Pen tool: drag on place to create cubic Bézier control handles | S8-01 |
| S8-03 | Pen tool: close path by clicking first anchor | S8-01 |
| S8-04 | Pen tool: finish open path (Enter or double-click) | S8-01 |
| S8-05 | Direct selection: click anchor points on paths, drag to move | S8-01 |
| S8-06 | Direct selection: display and drag control handles | S8-05 |

### Sprint 9: Text

| Issue | Description | Depends on |
|-------|-------------|------------|
| S9-01 | Point text tool: click to place, enter edit mode, type to create `<text>` | S3-01 |
| S9-02 | Text editing: cursor, selection, basic keyboard navigation in text | S9-01 |
| S9-03 | Font family dropdown (enumerate system fonts via Tauri or hardcoded safe list) | S9-01 |
| S9-04 | Font size and letter-spacing inputs in properties panel | S9-01 |

### Sprint 10: Eraser & File I/O

| Issue | Description | Depends on |
|-------|-------------|------------|
| S10-01 | Eraser tool: click on object to delete it | S3-01, S4-07 |
| S10-02 | Eraser tool: drag to delete objects the cursor passes over | S10-01 |
| S10-03 | SVG export: serialise document model to SVG, save via Tauri file dialog | S2-01 |
| S10-04 | SVG import: open SVG file via Tauri file dialog, parse into document model | S2-01 |
| S10-05 | **RESEARCH ISSUE:** SVG import fidelity — what subset of SVG features do we support on import? How to handle unsupported elements gracefully? | — |

### Sprint 11: Polish & Integration

| Issue | Description | Depends on |
|-------|-------------|------------|
| S11-01 | Keyboard shortcut map: all tools and actions have shortcuts, displayed in toolbar tooltips | All tools |
| S11-02 | Cursor icons: tool-appropriate cursors (crosshair for drawing, move for selection, etc.) | All tools |
| S11-03 | **RESEARCH ISSUE:** Font enumeration strategy — system font access from Tauri/webview, fallback approaches | S9-03 |
| S11-04 | **RESEARCH ISSUE:** WSL2+WSLg Tauri testing — verify WebKitGTK rendering, document any quirks | S0-01 |

---

## 11. Research Issues (Explicit Unknowns)

| ID | Question | When to resolve |
|----|----------|-----------------|
| R-01 | SVG import fidelity: which SVG elements/attributes do we parse? How to handle transforms, CSS styles, `<use>` references, embedded images? | Before Sprint 10 |
| R-02 | Font enumeration: Tauri plugin? `fc-list` via backend command? Hardcoded safe list for MVP? | Before Sprint 9 |
| R-03 | WSL2+WSLg: does Tauri (WebKitGTK) render SVG correctly? Performance? Known bugs? | Sprint 0 |
| R-04 | Path boolean library selection: paper.js, Clipper2 WASM, path-bool npm, or other? Performance and correctness comparison. | Before Phase 2 path booleans |
| R-05 | PDF import: which library decomposes PDF to SVG-like objects? pdf.js? pdf2svg? mupdf? Font subset extraction feasibility. | Before Phase 2 |
| R-06 | PDF export: browser print-to-PDF? Tauri backend? WASM library (e.g. jsPDF, pdf-lib)? Quality comparison. | Before Phase 2 |

---

## 12. Non-Goals (Explicit)

- 3D anything
- Mesh gradients
- Live effects pipeline
- Asset/symbol library management
- Cloud sync or collaboration
- Plugin/extension marketplace
- Mobile support
- Raster editing (beyond embedding images)
- CMYK color (handle at PDF export time if ever needed)
- Illustrator/Sketch/Figma file format import
