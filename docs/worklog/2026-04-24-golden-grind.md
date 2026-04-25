# 2026-04-24 — Golden suites — gates + milestones, 1→10 grind

One session shifted the project from "5 broken things visible every time" to "10 tool-combination flows prove themselves on every run." Built two new test classes and ground the scoreboard from 0/10 to 10/10.

## What shipped

**Gate suite (`test/golden/` — CI BLOCKER).** Headed-Chromium Playwright stories drive the UI, capture Export SVG + Export PDF downloads, canonicalize, byte-match against committed masters. Phase 1: 5 stories green (circle, rect, text, three-shapes, PDF round-trip). Determinism fix landed in `src/model/pdfExport.ts` (`CreationDate`/`ModDate`/`Producer`/`Creator` pinned). Epic `vectorfeld-7lo` closed. Follow-on stories 6-10 filed as beads (`u7s`/`00r`/`44a`/`6yf`/`n87`/`x0x`).

**Milestone suite (`test/golden/milestones/` — SCOREBOARD, never blocks).** 10 tool-combination exercises. Each pairs a target SVG fixture with a driver script that must use a specific combo (e.g. `rect + select + Frame X/Y/W/H/R`). `semanticCanonical.mjs` extends the gate canonicalizer with shape→path, hex colors, app-chrome strip, transform flatten to matrix, and aggressive path-coord normalization. Scoreboard states: ✓ matched, ✗ drift (bug), — gap (feature missing). Epic `vectorfeld-4xi` closed.

## Scoreboard progression

| Commit | State |
|---|---|
| Initial | 1✓ · 4✗ · 5— |
| `d6c7510` | 5✓ · 3✗ · 2— |
| `7396772` | 8✓ · 2✗ · 0— |
| `727d8e2` | 9✓ · 1✗ · 0— |
| `a0859ac` | **10✓ · 0✗ · 0—** |

Each ✗→✓ was a REAL bug or feature gap, not a driver hack. The scoreboard was designed to surface things the unit suite couldn't see, and it did.

## Real app bugs fixed (closed beads)

| Bead | Bug | Fix |
|---|---|---|
| `vectorfeld-cj3` | Copy/paste loses original rect | `EditorContext.tsx` Ctrl+shortcuts case-insensitive (Playwright synthesizes `'C'` uppercase; handler checked `'c'`). Now `e.key.toLowerCase()`. Real user-facing bug — some IMEs behave the same way. |
| `vectorfeld-qum` | Ellipse Frame W/H breaks X/Y math | `ControlBar.tsx` onW/onH for ellipse/circle now compensates cx/cy so bbox origin is preserved when rx/ry change. Sequential `setFrame({x, w})` calls no longer move the bbox. |
| `vectorfeld-ka1` | Text rotation pivot around bbox center instead of anchor | `ControlBar.tsx` onRot special-cases `<text>` to pivot around (x, y) attributes. Matches SVG convention + user expectation (baseline-left stays put). |
| `vectorfeld-82g` | No Object > Group/Ungroup menu items | Added Group/Ungroup + 6 Align items to the Object menu. Ctrl+G/Shift+G shortcuts already existed; now discoverable. |
| `vectorfeld-lj5` | Multi-draw select-click imprecision | Turned out to be driver geometry, not an app bug. Closed with notes. |

Other non-bead fixes landed during the grind:

- **`PropertiesPanel.tsx` subscribes to history mutations.** Critical latent bug. The panel derived `fillType = detectFillType(el)` each render but only re-rendered on selection changes — so switching the fill-type select from "None" to "Solid" mutated the DOM but the panel's derived state stayed stale until the next selection change. Every attribute edit via the panel was stale. Fixed with `history.subscribe(() => setHistoryTick(n => n+1))`.
- **`LayersPanel.tsx`** got the `+` Add Layer button back in embedded mode. Ship regression from Atrium that had no pre-existing bead.
- **`reflect.ts`** now bakes horizontal/vertical mirrors into path `d` and polygon `points` attributes rather than emitting a `scale(-1, 1)` transform. Cleaner representation and avoids the scale-transform interacting badly with subsequent `setFrame` calls.
- **`textTool.ts`** auto-selects the committed text node and switches to select tool after Escape. Frame inputs now work immediately after text placement.
- **`ColorPicker.tsx`** + **`ControlBar.tsx`** + **`PropertiesPanel.tsx`** gained `data-testid` hooks (`frame-{x,y,w,h,r}`, `colorpicker-{fill,stroke}-{,hex}`, `fill-type`, `add-layer`) so drivers target by stable identifier, not layout-brittle DOM walking.

## Canonicalizer infrastructure

`test/golden/canonicalize.mjs` (shared by both suites) now handles:
- ID strip, 2dp round, attr alphabetize (existing)
- xlink-aware namespace handling via `setAttributeNS` — fixed a day-one jsdom crash on imported PDFs
- Transform-arg separator unification (`rotate(45 110 140)` ≡ `rotate(45, 110, 140)`)
- Inter-element whitespace collapse (pretty-printed fixtures ≡ serialized output)
- PDF via pdfjs extraction, with docId-prefix scrubbed

`test/golden/semanticCanonical.mjs` (milestone-only) adds:
- Shape→path via a 100-LOC inline converter
- Color tokens → `#rrggbb` lowercase hex (named, `rgb()`, hex3, hex6)
- App-chrome strip (artboard groups/rects, empty `<defs>`, SVG-root width/height/style/viewBox/data-*)
- Layer-group unwrap
- Transform flatten: every `rotate()`/`translate()`/`scale()`/`skew()`/`matrix()` → single `matrix(a, b, c, d, e, f)`
- Path-coord normalize: collapse comma/space separators, round decimals to nearest 0.5mm (absorbs pen tool's screen→mm FP drift)

## Harness helpers added

`test/golden/harness.mjs`:
- `setFrame({x, y, w, h, r})` — drives the Inspector's Frame inputs by `data-testid`, commits via Enter, blurs back to body
- `setFill(hex)` / `setStroke(hex)` — open the Properties-panel ColorPicker, auto-flip fill-type to Solid first if needed, type hex, commit
- `clickAtMm(mmX, mmY)` — mm → screen via `svg.getScreenCTM()`, then `page.mouse.click`. Lets pen/line/measure tools land anchors at exact mm without driver pixel math

## Commits pushed this session

```
a0859ac  Milestone grind: 9/10 → 10/10 (path-reflect bake + path-coord normalize)
727d8e2  Milestone grind: 8/10 → 9/10 (z-order with select-blue-only-point)
7396772  Milestone grind: 5/10 → 8/10 (text rotation, align menu, fill picker, re-render fix)
d6c7510  Milestone grind: 1/10 → 5/10 (cj3, qum, layers gap, ctrl-keys, canonicalizer)
250702b  Golden-master milestones: tool-combination scoreboard (vectorfeld-4xi)
e5572fc  Golden-master test suite: headed-Chromium stories → byte-match exports (vectorfeld-7lo)
```

Starting point `d702125` (Atrium redesign end) → ending `a0859ac`. 6 commits.

## Tests

- Gates: **5/5 green**
- Milestones: **10/10 green**
- Unit tests: **600/600 green** (no change in count — existing suite unchanged except PropertiesPanel.test mock needed `history.subscribe`, and reflect.test needed new path-bake assertions)

## Key files to know

- `test/golden/run.mjs` / `milestone.mjs` — the two runners. `npm run golden` and `npm run golden:milestones`.
- `test/golden/harness.mjs` — shared Playwright helpers. Every new milestone driver imports from here.
- `test/golden/canonicalize.mjs` / `semanticCanonical.mjs` — the two canonicalizer layers. Touch with care; gate masters are pinned to canonicalize.mjs's exact output.
- `test/golden/stories/` — gate stories. Byte-exact against masters.
- `test/golden/milestones/{fixtures,drivers}/` — milestone target + driver pairs.
- `src/components/ControlBar.tsx` — Frame inputs. The scoreboard exercises these heavily; any change here should run `npm run golden:milestones`.
- `src/model/EditorContext.tsx` — keyboard-shortcut handler. Now case-insensitive for Ctrl combos.

## Lessons

- **Turn the headed-Chromium dogfood into a first-class gate, not a script.** `temp/composite-via-playwright.mjs` (now `test/dogfood/composite.mjs`) had been catching bugs for months but only when someone remembered to run it. Promoting that pattern to `npm run golden` made it non-skippable.
- **Byte-level "canonicalized" byte-match is strict enough and doesn't false-positive.** The trick is canonicalizing away everything that isn't semantic (IDs, timestamps, element order in Object-pool-driven PDF, transform form) while preserving everything that IS semantic (geometry, colors, text content).
- **Milestones surface real bugs that unit tests can't.** Five of six closed beads this session were genuine runtime bugs, not test-code-only issues. The PropertiesPanel re-render bug in particular had been making every attribute edit subtly broken for anyone who happened to change a dropdown; nothing in the 600-test suite would have caught it.
- **Driver pixel math is fragile; prefer DOM-queried geometry and mm-precise click helpers.** `clickAtMm` replaced several hand-tuned pixel-offset calculations that would have broken on the next layout change.
