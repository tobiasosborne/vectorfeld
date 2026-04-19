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

## Underscore-prefixed parameters
- When a function parameter is prefixed with `_` (e.g., `_getDoc`), it means "intentionally unused"
- If you later ADD code that uses that parameter, REMOVE the underscore prefix
- The chaos monkey found `_getDoc` → `getDoc` bug in directSelectTool.ts because the shape-to-path auto-convert code called `getDoc()` but the parameter was still `_getDoc`

## Transform model
- `geometry.ts:transformedAABB()` now uses full affine matrix via `matrix.ts` — handles translate, scale, rotate, skewX, skewY, matrix, and chained transforms
- Old regex-only approach silently returned wrong AABB for non-rotate transforms
- 6 consumers benefit automatically: selectTool (2), selection.ts (2), smartGuides (1), geometry.ts (1)

## Selection overlay and rotation
- For rotated single elements, use LOCAL `getBBox()` (not `unionBBox/transformedAABB`) for:
  - Rotation center computation (always local bbox center)
  - Scale anchor computation (anchor must be in same space as element attributes)
- During scale of rotated elements, inverse-rotate mouse point into local space before computing scale factors

## EditorContext refactoring
- Extracted modules (clipboard.ts, nudge.ts, zOrder.ts) should reuse `computeTranslateAttrs` from geometry.ts
- The old EditorContext had duplicated per-element-type offset logic in both nudge and paste handlers
- When extracting, pass React refs (like clipboardRef) as `{ current: T }` parameters for testability

## Beads issue tracking
- Dolt server must be running for bd to work: check `ps aux | grep dolt`
- bd v0.58+ auto-starts Dolt if installed at `~/.local/bin/dolt`
- Use `/home/tobias/.local/bin/bd` (not just `bd`) if PATH has old version
- Old JSONL backup may have schema incompatibilities with newer bd versions — fresh `bd init` is safer than `--from-jsonl`

## Playwright-cli
- Install: `npm install -g @playwright/cli` then `playwright-cli install` (downloads chromium)
- `playwright-cli console error` shows only actual errors (not info/debug)
- `mousewheel` args must be positive: `playwright-cli mousewheel 0 100` not `0 -300`
- The chaos monkey script is at `/tmp/chaos-monkey.sh` — 20 phases, run after any major change

## Subagent file-writing
- The Explore subagent is read-only — it cannot Write/Edit files even when the prompt asks for output to a path
- For tasks that must produce files (reports, refactors), use the general-purpose subagent OR plan to write the output yourself from the agent's response
- When asked to delegate report-writing, prefer general-purpose; reserve Explore for "search and summarise back to me" tasks
