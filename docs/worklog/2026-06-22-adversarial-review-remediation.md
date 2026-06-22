# 2026-06-22 — Major adversarial review + Phase 0 remediation start

Owner asked for a complete adversarial examination of the app — "scrutinise every
part, every line of code," driven primarily by **experiencing** it through a real
browser — because they were ready to dump the project and start over and wanted to
know what (if anything) was saveable.

## What was done

**Review (committed `77245b7`).** Two adversarial multi-agent workflows + hands-on
headed reproduction:
- **Static audit** — 12 subsystem clusters, all ~80 source files, line-by-line;
  each high/critical finding re-checked by a skeptic. 38 agents, 109 findings.
- **Experiential** — 14 user journeys, each agent driving the real app in a browser,
  screenshotting, reasoning visually, exporting+rendering PDFs to compare. 42 agents,
  66 findings.
- **Owner-thread headed repro** — I personally drove headed Chromium through core
  editing, PDF import/edit/export, and compositing, and reproduced the top data-loss
  interlocks myself.
- Totals: **80 agents, ~3M tokens, 175 findings, 51 high/critical confirmed.**

**Verdict: SAVE, do not rewrite.** The hard core is sound — graft PDF engine
(B/solid, round-trip verified by hand), geometry/matrix/AABB (B/solid), selection
model + command/undo spine clean, compositing correct. The 8 critical + 46 high bugs
collapse to **~6 shared root causes** (coordinate-frame confusion · mutations
bypassing the command system · selection not reconciled with undo · split keyboard
ownership · state never torn down · one bad path parser) → a ~3–4 week fix campaign,
not a green-field restart. The one real gap: **editing imported-PDF text is
non-functional via the UI** and needs a designed feature (`3yu.2`/`3yu.3`).

Full report: `docs/review/2026-06-21-adversarial-review.md`. Harness, scenario
scripts, and findings JSON under `test/review/` (+ `test/review/out/*.json`).

**Toolchain fix.** Playwright's Chromium had been wiped from `~/.cache/ms-playwright`,
so `npm run golden`/`dogfood` would have failed to launch. Reinstalled it.

## Beads

- Filed epic **`vectorfeld-3yu`** — "Adversarial review remediation campaign" —
  with 26 children (8 P0, 16 P1, 2 P2), all labelled `review-2026-06`.
- Closed **`vectorfeld-6z0`** — verified headed that the composite exports
  edge-to-edge (no white margin / clipping); the original svg2pdf.js concern is moot.
- Confirmed existing beads `t7u` (pen asymmetric handles) and `9hu` (pen S/s curves)
  from the experiential pass; referenced in the epic, not duplicated.

## Phase 0 fixes shipped (committed `edf62bc`)

Three confirmed data-loss interlocks, all **verified headed**
(`test/review/scenarios/verify-fixes.mjs`) with golden gate + 837 unit tests green:

- **`3yu.6`** — text-edit Ctrl+Z clobbered a previously committed shape. EditorContext
  now suppresses ALL document shortcuts while the text tool holds keyboard capture.
- **`3yu.9`** — stale selection after undo (phantom boxes, "N SELECTED" over an empty
  canvas, Ctrl+D resurrection, Delete-wipes-redo). Added `pruneSelection()` called
  after `history.undo()/redo()`; `updateOverlay` now filters to `el.isConnected`.
  Regression tests added in `selection.test.ts`.
- **`3yu.19`** — shortcuts fired while a Properties `<select>` was focused. Keydown
  editable-target guard now covers `<select>` and contentEditable.

Lessons captured (`57881e1`): `pkill -f`/`pgrep -f` self-kill footgun; Playwright
Chromium cache-miss before headed runs.

## State at end of session

- Branch **`review/adversarial-2026-06-21`** — 4 commits ahead of `main` (review,
  Phase 0 fixes, lessons, this handoff). Pushed to remote.
- Build green, type check clean, 837 unit tests + 11/11 golden gates green.
- Dev server may still be running on :5173.

## Next session — recommended

Continue Phase 0 with the next contained cluster: **`3yu.4`** (ungroup drops group
transform — bake transform into children in `commands.ts`), **`3yu.5`** (eraser-drag
undo throws — fix multi-element restore order in `eraserTool.ts`), **`3yu.1`**
(Open-PDF wipes doc — confirm-if-dirty guard + make import an undoable Command).
Then the root-cause levers (`3yu.8` coordinate-frame helper, `3yu.13` paste id
uniquification, `3yu.11` cross-layer group). Scope **`3yu.2`/`3yu.3`** (imported-PDF
text editing) as a designed feature separately. Use the same rhythm: fix → headed
repro via `test/review/_driver.mjs` → `npm run golden` → close bead.
