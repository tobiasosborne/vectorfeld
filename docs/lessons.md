# Lessons Learned

## playwright-cli mouse events
- `mousedown` and `mouseup` default to `button: 'undefined'` which doesn't trigger `button === 0` checks
- Always pass `left` argument: `playwright-cli mousedown left`, `playwright-cli mouseup left`
- Canvas container has offset from viewport edge (toolstrip + layers panel) — coordinates must be within the container bounds

## Test setup for DocumentModel
- Tests using `createDocumentModel(svg)` need a layer `<g data-layer-name="...">` in the SVG
- Without it, `getActiveLayer()` returns null and `addElement()` fails with "Cannot read properties of null"
- Always include `makeSvg()` helper that adds the default layer

## Export cleanliness
- Every new overlay group needs a `data-role` attribute and must be stripped in ALL export functions (SVG, PDF, PNG)
- Selector list: `[data-role="overlay"], [data-role="preview"], [data-role="grid-overlay"], [data-role="guides-overlay"], [data-role="user-guides-overlay"], [data-role="wireframe"]`
- When adding a new overlay, update the strip selector in `exportSvg`, `exportPdf`, and `exportPng`

## image tag support
- When adding a new SVG element type, it needs support in: geometry.ts (`computeTranslateAttrs`), EditorContext.tsx (nudge + paste), selectTool.ts (hit test + move/scale)
- The `image` tag uses same position model as `rect` (x/y/width/height)
