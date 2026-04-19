# vectorfeld — Agent-First API Reference

This document is the primary reference for AI agents working on vectorfeld. Start here before writing code.

**Pivot context (2026-04-19):** the project has pivoted from "scientific-diagram editor with LaTeX export" to "casual PDF editor" (Adobe CC replacement for editing Word-generated PDFs). See `AGENTS.md` for the pivot details. Several modules in the original design were deleted; this doc reflects the current state, not the original PRD.

---

## Quick Orientation

```
src/
  model/          Core domain: document, commands, selection, geometry, matrix, path ops,
                  coordinates, zoom, file I/O, PDF import, pub-sub singletons (grid,
                  guides, smartGuides, artboard, defaultStyle, wireframe, activeLayer)
  tools/          13 tool implementations + registry. 7 visible in sidebar; 6 hidden
                  but reachable via keyboard shortcut.
  components/     React UI: Canvas, ToolStrip, MenuBar, ControlBar, LayersPanel,
                  PropertiesPanel, StatusBar, ColorPicker, FillStrokeWidget,
                  ArtboardDialog, ContextMenu, Ruler, icons
  test/           Vitest setup
src-tauri/        Rust shell — thin, no custom commands wired yet
```

**Data flow:**
```
User Input (Mouse/Keyboard)
  -> Canvas handlers / EditorProvider keybindings
  -> Tool handlers / CommandHistory.execute(command)
  -> Command.execute() modifies SVG DOM (via DocumentModel)
  -> Selection/registry subscribers notified
  -> React components re-render
```

**SVG DOM structure:**
```xml
<svg viewBox="0 0 210 297">
  <rect data-role="artboard" fill="white" />        <!-- Artboard background -->
  <g data-layer-name="Layer 1">                      <!-- Content layer(s) -->
    <rect id="vf-1" ... />                           <!-- User elements -->
  </g>
  <g data-role="overlay" pointer-events="none">      <!-- Non-document overlays -->
    <rect data-role="selection-box" ... />            <!-- Selection indicators -->
  </g>
</svg>
```

---

## 1. Document Model (`src/model/document.ts`)

### Interface: `DocumentModel`

| Method | Signature | Description |
|--------|-----------|-------------|
| `svg` | `SVGSVGElement` | The SVG root element |
| `addElement` | `(parent: Element, tag: string, attrs: Record<string, string>) => Element` | Creates SVG element with auto-generated id, appends to parent |
| `removeElement` | `(el: Element) => { parent: Element; nextSibling: Element \| null }` | Removes element, returns parent + sibling for undo |
| `setAttribute` | `(el: Element, attr: string, value: string) => string \| null` | Sets attribute, returns old value |
| `getElement` | `(id: string) => Element \| null` | Finds element by id |
| `serialize` | `() => string` | Returns XML string of entire SVG |
| `getLayerElements` | `() => Element[]` | Returns all `g[data-layer-name]` elements |
| `getActiveLayer` | `() => Element \| null` | Returns first layer or null |

### Functions

| Function | Signature | Description |
|----------|-----------|-------------|
| `createDocumentModel` | `(svg: SVGSVGElement) => DocumentModel` | Factory — wraps SVG element |
| `generateId` | `() => string` | Sequential IDs: vf-1, vf-2, ... |
| `resetIdCounter` | `() => void` | Resets counter (for testing) |

---

## 2. Command Pattern (`src/model/commands.ts`)

### Interface: `Command`

```typescript
interface Command {
  readonly description: string
  execute(): void
  undo(): void
}
```

### Class: `CommandHistory`

| Method | Returns | Description |
|--------|---------|-------------|
| `execute(cmd)` | `void` | Runs command, pushes to undo stack, clears redo stack |
| `undo()` | `void` | Pops undo stack, runs `cmd.undo()`, pushes to redo |
| `redo()` | `void` | Pops redo stack, runs `cmd.execute()`, pushes to undo |
| `canUndo` | `boolean` | True if undo stack non-empty |
| `canRedo` | `boolean` | True if redo stack non-empty |
| `subscribe(fn)` | `() => void` | Returns unsubscribe function |

### Concrete Commands

| Class | Constructor | Description |
|-------|-------------|-------------|
| `AddElementCommand` | `(doc, parent, tag, attrs)` | Creates element; undo removes it; redo re-appends same node |
| `RemoveElementCommand` | `(doc, element)` | Removes element; undo restores at original position |
| `ModifyAttributeCommand` | `(element, attr, newValue)` | Sets attribute; undo restores old value (or removes if didn't exist) |
| `CompoundCommand` | `(commands[], description?)` | Execute all in order; undo all in reverse |

`AddElementCommand` has `.getElement(): Element | null` to retrieve the created element.

---

## 3. Selection (`src/model/selection.ts`)

| Function | Signature | Description |
|----------|-----------|-------------|
| `getSelection` | `() => Element[]` | Returns copy of selected elements |
| `setSelection` | `(elements: Element[]) => void` | Replaces selection, updates overlay |
| `addToSelection` | `(el: Element) => void` | Adds if not already selected |
| `removeFromSelection` | `(el: Element) => void` | Removes from selection |
| `toggleSelection` | `(el: Element) => void` | Toggle in/out of selection |
| `clearSelection` | `() => void` | Empties selection |
| `isSelected` | `(el: Element) => boolean` | Check membership |
| `subscribeSelection` | `(fn: () => void) => () => void` | Subscribe to changes |
| `setOverlayGroup` | `(g: SVGGElement) => void` | Set the overlay `<g>` for rendering boxes |
| `refreshOverlay` | `() => void` | Force redraw selection boxes |

Selection boxes: dashed blue rects (`stroke: #2563eb`, `stroke-dasharray: 2 1`) from `getBBox()`.

---

## 4. Coordinates (`src/model/coordinates.ts`)

| Function | Signature | Description |
|----------|-----------|-------------|
| `screenToDoc` | `(svg, screenX, screenY) => Point` | Browser pixels to document mm |
| `docToScreen` | `(svg, docX, docY) => Point` | Document mm to browser pixels |
| `parseViewBox` | `(svg) => { x, y, width, height }` | Extract viewBox components |
| `setViewBox` | `(svg, x, y, width, height) => void` | Set viewBox attribute |
| `getZoomLevel` | `(svg) => number` | Pixels per SVG unit |
| `getZoomPercent` | `(svg) => number` | Zoom % relative to 96 DPI |

`Point = { x: number; y: number }`

---

## 5. Zoom (`src/model/zoom.ts`)

| Function/Const | Value/Signature | Description |
|----------------|-----------------|-------------|
| `MIN_ZOOM` | `0.1` | Minimum px/unit (10%) |
| `MAX_ZOOM` | `64` | Maximum px/unit (6400%) |
| `ZOOM_FACTOR` | `1.1` | 10% per scroll step |
| `zoomAtPoint` | `(svg, screenX, screenY, deltaY) => void` | Zoom toward cursor; deltaY>0 = out, <0 = in |

Uses pure viewBox math (no SVG DOM APIs — works in jsdom).

---

## 6. File I/O (`src/model/fileio.ts` + `src/model/pdfImport.ts`)

| Function | Signature | Description |
|----------|-----------|-------------|
| `exportSvg` | `(doc, filename?) => void` | Clones SVG, strips overlays/previews, triggers browser download |
| `exportPdf` | `(doc, filename?) => void` | jsPDF + svg2pdf.js pipeline |
| `exportPng` | `(doc, filename?) => void` | SVG-to-canvas raster at 96 DPI |
| `importSvg` | `(doc) => Promise<void>` | Opens file picker, parses SVG, imports to active layer |
| `placeImage` | `(doc, history) => Promise<void>` | File picker for PNG/JPG, creates `<image>` data URI |
| `importPdf` | `(doc) => Promise<void>` | File picker, MuPDF WASM, `text=text` mode → real `<text>`/`<tspan>`/`<image>` |
| `parseSvgString` | `(xml) => ParsedSvg` | DOMParser + `sanitizeSvgTree()` + extract defs/layers |
| `sanitizeSvgTree` | `(root: Element) => void` | **Security**: strips `<script>`, `<foreignObject>`, `<iframe>`, `on*` attrs, `javascript:`/`data:text/html` hrefs |
| `exportSvgString` | `(doc) => string` | For tests |

The PDF pipeline (`pdfImport.ts`) prepends `scale(25.4/72)` to each top-level element's `transform` so content (MuPDF emits pt) scales into the mm viewBox. Each text/image stays a direct layer child (individually selectable).

---

## 7. Editor Context (`src/model/EditorContext.tsx`)

### `useEditor(): EditorContextValue`

```typescript
interface EditorContextValue {
  history: CommandHistory
  doc: DocumentModel | null    // null until SVG is mounted
  setSvg: (svg: SVGSVGElement) => void
}
```

### `EditorProvider({ children })`

Wraps app with context. Manages:
- CommandHistory instance
- DocumentModel (created when `setSvg` is called)
- Clipboard ref passed to `src/model/clipboard.ts` functions
- All global keybindings (undo/redo, copy/cut/paste/duplicate, group/ungroup, delete, nudge, z-order, select-all, grid toggle)

---

## 8. Tool Registry (`src/tools/registry.ts`)

### Interfaces

```typescript
interface ToolEventHandlers {
  onMouseDown?: (e: MouseEvent) => void
  onMouseMove?: (e: MouseEvent) => void
  onMouseUp?: (e: MouseEvent) => void
  onClick?: (e: MouseEvent) => void
  onKeyDown?: (e: KeyboardEvent) => void
}

interface ToolConfig {
  name: string           // e.g., "select", "line"
  icon: ReactNode        // Shown in toolbar button
  shortcut: string       // Single key, e.g., "v"
  handlers: ToolEventHandlers
}
```

### Functions

| Function | Signature | Description |
|----------|-----------|-------------|
| `registerTool` | `(config: ToolConfig) => void` | Add tool to registry |
| `setActiveTool` | `(name: string) => void` | Switch active tool (ignores unknown names) |
| `getActiveTool` | `() => ToolConfig \| null` | Get active tool config |
| `getActiveToolName` | `() => string \| null` | Get active tool name |
| `getAllTools` | `() => ToolConfig[]` | All registered tools |
| `subscribe` | `(fn) => () => void` | Subscribe to tool changes |
| `findToolByShortcut` | `(key: string) => ToolConfig \| undefined` | Case-insensitive search |
| `clearRegistry` | `() => void` | Reset all (for testing) |

---

## 9. Tool Implementations

All tool factories follow this signature:
```typescript
function createXxxTool(
  getSvg: () => SVGSVGElement | null,
  getDoc: () => DocumentModel | null,
  getHistory: () => CommandHistory
): ToolConfig
```

### Registered Tools (13 total; 7 visible, 6 hidden-but-keyboard-accessible)

| Tool | Name | Key | Visible | File | Behavior |
|------|------|-----|---------|------|----------|
| Select | `select` | V | ✓ | `selectTool.ts` | Click, shift-click toggle, marquee, drag-move, 8-handle scale, rotation handle. Snapshots tspan x-arrays so MuPDF-imported text moves as a unit. |
| Direct Select | `direct-select` | A | ✓ | `directSelectTool.ts` | Edit path anchor points and Bézier handles |
| Rectangle | `rectangle` | R | ✓ | `rectTool.ts` | Click-drag; shift=square, ctrl=from-center |
| Ellipse | `ellipse` | E | ✓ | `ellipseTool.ts` | Click-drag; shift=circle |
| Line | `line` | L | ✓ | `lineTool.ts` | Click-drag; shift=45°, endpoint snap via smartGuides |
| Text | `text` | T | ✓ | `textTool.ts` | Click to place, typeable with caret + selection |
| Eraser | `eraser` | X | ✓ | `eraserTool.ts` | Click or drag to delete touched elements |
| Pen | `pen` | P | — | `penTool.ts` | Bézier anchor placement. Known limitations (no S/s curveto, symmetric handles only) — see beads issues. |
| Pencil | `pencil` | N | — | `pencilTool.ts` | Freehand with Ramer-Douglas-Peucker simplification |
| Measure | `measure` | M | — | `measureTool.ts` | Click-drag shows distance overlay in mm |
| Lasso | `lasso` | J | — | `lassoTool.ts` | Freeform polygon select (ray-cast PiP) |
| Free Transform | `free-transform` | Q | — | `freeTransformTool.ts` | Scale + rotate + skew in one tool (redundant with selectTool handles for most cases) |
| Eyedropper | `eyedropper` | I | — | `eyedropperTool.ts` | Sample stroke/fill/strokeWidth into `defaultStyle` |

Visible tools are shown in `ToolStrip.tsx`. Hidden tools are filtered out via `HIDDEN_TOOLS` set. To toggle visibility, edit `ToolStrip.tsx` — all tools stay registered and reachable via keyboard.

### `registerAllTools(getSvg, getDoc, getHistory): void`

Registers all 13 tools and sets `select` as active. Called once on SVG mount.

### `useToolShortcuts(): void`

Hook — listens for single-key presses to switch tools. Ignores when input/textarea focused or Ctrl/Alt/Meta held.

---

## 10. Keybindings (Complete)

### Tool Shortcuts (via `useToolShortcuts`)

| Key | Action |
|-----|--------|
| V | Select tool |
| A | Direct-select tool |
| R | Rectangle tool |
| E | Ellipse tool |
| L | Line tool |
| T | Text tool |
| X | Eraser tool |
| P | Pen tool (hidden from strip) |
| N | Pencil tool (hidden) |
| M | Measure tool (hidden) |
| J | Lasso tool (hidden) |
| Q | Free Transform tool (hidden) |
| I | Eyedropper (hidden) |

### Editor Actions (via `EditorProvider`)

| Key | Action |
|-----|--------|
| Ctrl+C | Copy selection to internal clipboard |
| Ctrl+X | Cut (copy + delete) |
| Ctrl+V | Paste (offset +5mm, new IDs) |
| Ctrl+D | Duplicate (copy + paste in one step) |
| Ctrl+G | Group selected into `<g>` |
| Ctrl+Shift+G | Ungroup selected `<g>` |
| Ctrl+Z | Undo |
| Ctrl+Shift+Z | Redo |
| Arrow keys | Nudge selection 1mm |
| Shift+Arrow | Nudge selection 10mm |
| Delete/Backspace | Delete selection |

### Canvas Navigation

| Input | Action |
|-------|--------|
| Scroll wheel | Zoom at cursor |
| Middle-click drag | Pan |
| Space + drag | Pan |

All keybindings skip when `<input>` or `<textarea>` is focused.

---

## 11. React Components

### `Canvas` (`src/components/Canvas.tsx`)

```typescript
interface CanvasProps {
  dimensions?: DocumentDimensions    // Default: { width: 210, height: 297 } (A4)
  onStateChange?: (state: CanvasState) => void
  onSvgReady?: (svg: SVGSVGElement) => void
}
```

Creates SVG once on mount. Handles zoom, pan, and tool event dispatch.

### `ToolStrip` (`src/components/ToolStrip.tsx`)

Vertical tool palette on the left side. Renders icon buttons for each registered tool EXCEPT those in the module-level `HIDDEN_TOOLS` set. Active tool highlighted via accent color. Bottom contains a `FillStrokeWidget`.

### `MenuBar` (`src/components/MenuBar.tsx`)

Horizontal menu bar along the top. Takes a `MenuDef[]` prop; renders dropdown menus with separators, shortcut text, and disabled states. Closes on outside click.

### `ControlBar` (`src/components/ControlBar.tsx`)

Top strip (below MenuBar) with X/Y/W/H/R numeric inputs bound to the selection. Also renders align and distribute buttons when 2+ elements are selected.

### `LayersPanel` (`src/components/LayersPanel.tsx`)

Lists layers from `g[data-layer-name]`. Add/delete/rename/reorder/visibility toggle (`style.display`)/lock toggle (`data-locked`). Subscribes to `history` and `selection` (not polling).

### `FillStrokeWidget` (`src/components/FillStrokeWidget.tsx`)

Illustrator-style stacked fill+stroke swatches at the bottom of the ToolStrip. Shows `defaultStyle` current values; supports swap and reset.

### `Ruler` (`src/components/Ruler.tsx`)

Exports `HRuler` and `VRuler`. Canvas-based; adaptive tick intervals follow zoom level. Dragging from the ruler body calls `addGuide('h'|'v', pos)` to create a user placement guide. Exports `pickInterval`, `formatLabel`, `ViewBoxInfo` for tests.

### `ContextMenu` (`src/components/ContextMenu.tsx`)

Portal-style floating right-click menu. Props: `{ x, y, items: ContextMenuItem[], onClose }`. Closes on outside click or Escape.

### `PropertiesPanel` (`src/components/PropertiesPanel.tsx`)

Context-sensitive: shows position, size, and style fields for single selected element. Changes via `ModifyAttributeCommand`.

### `StatusBar` (`src/components/StatusBar.tsx`)

```typescript
interface StatusBarProps {
  cursorX?: number
  cursorY?: number
  zoomPercent?: number
}
```

### `ColorPicker` (`src/components/ColorPicker.tsx`)

```typescript
interface ColorPickerProps {
  value: string                    // Color or "none"
  onChange: (color: string) => void
  allowNone?: boolean              // Default: true
}
```

18-color preset grid + hex input + "none" option.

### `ArtboardDialog` (`src/components/ArtboardDialog.tsx`)

```typescript
interface ArtboardDialogProps {
  dimensions: DocumentDimensions
  onApply: (dimensions: DocumentDimensions) => void
  onClose: () => void
}
```

Presets: A4 (210x297), A3 (297x420), Letter (215.9x279.4), A5 (148x210), Square (100x100).

---

## 12. Testing

### Unit Tests (Vitest + jsdom)

```bash
npm test            # single run
npm run test:watch  # watch mode
```

66 tests across 8 files. jsdom workarounds: mock `clientWidth`/`clientHeight` via `Object.defineProperty`, mock `getBoundingClientRect`.

### E2E Verification (playwright-cli)

```bash
playwright-cli open http://localhost:5173     # Launch browser
playwright-cli snapshot                        # Accessibility tree
playwright-cli screenshot                      # PNG capture
playwright-cli click <ref>                     # Click element by ref
playwright-cli mousemove <x> <y>              # Move cursor
playwright-cli mousedown                       # Press mouse
playwright-cli mouseup                         # Release mouse
playwright-cli mousewheel -- <dx> <dy>        # Scroll (use -- for negative values)
playwright-cli press <key>                     # Keyboard (e.g., Delete, Control+z)
playwright-cli eval "<js expression>"          # Run JS in page
playwright-cli close                           # Close browser
```

**Useful eval patterns:**
```bash
# Check viewBox
playwright-cli eval "document.querySelector('svg')?.getAttribute('viewBox')"

# Count elements in layer
playwright-cli eval "document.querySelector('g[data-layer-name]')?.children.length"

# Check selection boxes
playwright-cli eval "document.querySelectorAll('[data-role=selection-box]').length"

# Check preview element
playwright-cli eval "document.querySelector('[data-role=preview]')?.tagName"

# Check layer visibility
playwright-cli eval "document.querySelector('g[data-layer-name]')?.style.display"
```

---

## 13. How to Add a New Tool

1. Create `src/tools/myTool.ts` following the factory pattern:
   ```typescript
   export function createMyTool(getSvg, getDoc, getHistory): ToolConfig {
     return {
       name: 'mytool',
       icon: 'M',
       shortcut: 'm',
       handlers: {
         onMouseDown(e) { ... },
         onMouseMove(e) { ... },
         onMouseUp(e) { ... },
       }
     }
   }
   export function registerMyTool(getSvg, getDoc, getHistory): void {
     registerTool(createMyTool(getSvg, getDoc, getHistory))
   }
   ```

2. Add `registerMyTool(...)` call in `src/tools/registerAllTools.ts`

3. Use `screenToDoc(getSvg()!, e.clientX, e.clientY)` for coordinate conversion

4. Use `AddElementCommand` / `ModifyAttributeCommand` for undoable changes

5. Mark preview elements with `data-role="preview"` (stripped on export)

6. Test with `npm test` and verify with `playwright-cli`

---

## 14. How to Add a New Property to the Properties Panel

1. In `PropertiesPanel.tsx`, add a conditional block checking `tag`:
   ```tsx
   {tag === 'mytype' && (
     <PropertyInput label="X" value={getAttr(el, 'x')} onChange={(v) => applyAttr(el, 'x', v)} />
   )}
   ```

2. For color properties, use `<ColorPicker>` instead of `<PropertyInput>`

3. Changes are automatically undoable via `applyAttr` which calls `ModifyAttributeCommand`

---

## 15. Critical Implementation Details

- **SVG is created once** on Canvas mount (never recreated on dimension change)
- **Dimension changes** only update viewBox and artboard rect attributes
- **Tool state persists** across tool switches (not reset)
- **IDs are sequential** (vf-1, vf-2, ...) — `generateId()` is global
- **Layers** are `<g>` elements with `data-layer-name` attribute
- **Locked layers** have `data-locked="true"` — skipped in hit testing
- **Hidden layers** have `style.display="none"` — skipped in hit testing
- **Overlay group** is last child of SVG, has `pointer-events="none"`
- **Export** clones SVG, strips `data-role="overlay"` and `data-role="preview"` elements
- **Clipboard** is internal (serialized SVG fragments), not system clipboard
