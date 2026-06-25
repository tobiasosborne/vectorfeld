# 2026-06-25 — Adversarial-review remediation: main P0/P1 wave (11 beads)

Orchestrated continuation of the `vectorfeld-3yu` remediation epic (filed 2026-06-22).
Owner asked to upgrade CLAUDE.md from neighbour repos, then drive the bead campaign
via subagents — "choose a bead, granular plan, delegate each step, monitor, raise
beads, keep working through all the beads. Bias for code quality and perf."

## What was done

**CLAUDE.md upgrade (`c4920c6`).** Scouted 10 neighbouring repos' agent-instruction
files (workflow), synthesized an anti-bloat upgrade (+18 lines): named failure-mode
anchor (silent PDF corruption), tiered subagent/effort scaling, "green ≠ correct"
golden mutation-proof rule, concrete stop-and-re-plan triggers, post-compaction
re-read, fail-loud + one-bead-one-commit.

**Investigation (2 workflows).** Adversarially-verified diagnoses (opus diagnose →
opus skeptic) for 10 P0/P1 beads. The skeptics caught real errors the implementers
then avoided: `3yu.3`'s net-new `data-pdf-run` attribute (used existing source-tag
instead) + its false "wrapper and text are co-located" hedge (transforms actually
compose); `3yu.15`'s `clearSelection`-ordering misattribution; `3yu.11`'s naive
`insertBefore` that throws `NotFoundError`. First workflow's strict JSON schema hit
the StructuredOutput retry cap on 6/12 agents → re-ran those as prose (lesson).

**11 beads shipped, each headed-verified (xvfb Chromium) + golden 11/11 + full unit
suite green.** Grouped by shared root cause:

- **Document-replace cluster** — `3yu.1` (Open PDF wipes doc, not undoable),
  `3yu.15` (Open SVG leaves stale SourcePdfStore → 10MB leak + wrong-source graft +
  phantom rows), `3yu.14` (import not undoable). One generic `ReplaceDocumentCommand`
  + `replaceDocumentWithParsed(doc, parsed, processLayer?)` in new
  `src/model/documentReplace.ts`; PDF passes `processImportedPdfLayer`, SVG passes
  none; both route through it with confirm-if-dirty. Eliminated the duplicated
  `applyParsedSvg` pair. (`70714e0`, `9141fac`)
- **Canonical-path-reuse** — `3yu.7` (directSelect's 2nd regex parser dropped
  H/V/S/Q/T/A + read relative as absolute → rebuilt on `pathOps.parsePathD/commandsToD`),
  `3yu.16` (pdf-lib fallback discarded rotation/skew on rect/ellipse/circle →
  `drawShapeAsPath` per-point emission; images deferred). (`e0ee29d`, `9a59149`)
- **Nested-structure** — `3yu.3` (hit-test returned wrapping `<g>`, never inner
  `<text>` → `resolveHitLeaf` descends source-tagged run-wrappers with composed
  transforms + tagFilter), `3yu.13` (paste/duplicate produced duplicate descendant
  ids → `uniquifyIds`). (`2c2a5ff`, `314e691`)
- **Command-system** — `3yu.4` (ungroup dropped the group transform → bake
  group∘child into children, no-transform fast-path, redo-idempotent), `3yu.5`
  (eraser hand-rolled command threw `NotFoundError` on multi-element undo → canonical
  `CompoundCommand(RemoveElementCommand[])` + visibility:hidden feedback), `3yu.8`
  (free-transform rotate rebuilt a `rotate()` string, dropping a matrix() element's
  translate+scale → compose onto existing matrix), `3yu.11` (cross-layer group undo
  dumped all children into one layer → per-child provenance + connectivity-guarded
  restore). (`288b858`, `714275b`, `b026589`, `065f4ec`)

**`3yu.16` golden re-master.** Routing shapes through path ops changed the canonical
operator stream for ALL pdf-lib stories (every export draws the artboard background
rect first) — 01/02/03/04/07/08/09 went red. Verified NOT a regression (SVG canonicals
byte-identical; fill preserved; rendered circle/three-shapes/real-flyer PDFs correct)
before `--accept`. Mutation-proof intent satisfied (gate went red on the change).

**Orchestration.** Parallel implementer subagents on disjoint files (waves of 2–4),
each stopping before integration gates; orchestrator ran golden + headed + committed
selectively (one bead, one commit). A subagent's `git checkout`/restore to test its
own tsc amid concurrent edits was a near-miss → hardened later waves with explicit
no-git-ops + ignore-foreign-tsc-errors instructions.

**Lessons (`df499f1`).** Parallel-subagent git safety; implementer-written headed
scenarios are unverified scaffolding (off-screen clicks, wrong-element measurement,
`[data-selected]` vs selection-box overlay) — render/inspect, fix the scenario before
commit; golden re-master verification discipline.

## Beads

- **Closed (11):** `3yu.1, .3, .4, .5, .7, .8, .11, .13, .14, .15, .16`.
- **Raised (follow-ups, ~10):** ungroup drops non-transform group props; harden
  `CommandHistory.undo/redo` exception-safety; directSelect arc→line flattening warn;
  free-transform skew/scale ignore matrix() (`pox`); pdf-lib image cm-matrix rotation;
  `drawText` rotation (`t0e`); eraser strands empty wrapper after `3yu.3` (`kpw`);
  source-layer add/remove should be a Command; `exportSvgString` leaks provenance
  tags; group-undo z-order interleaving.

## State at end of session

- Branch `review/adversarial-2026-06-21`, pushed (HEAD `065f4ec`), 16 commits ahead
  of the 2026-06-22 handoff.
- Build green, tsc clean, **908 unit tests** + **golden 11/11** green.
- Dev server may still be running on :5173.

## UI P1 wave (continued, same session) — 9 more beads shipped

After the 11-bead data-loss wave above, prose-investigated (skeptic-verified) the nine
UI P1s and shipped them all, each headed-verified, in disjoint-file parallel batches:

- **`3yu.10`** — Document Setup Apply was a no-op (only set React state, never the
  artboard model) → new undoable `ResizeArtboardCommand`. (`10b0fe9`)
- **`3yu.17`** — ControlBar Frame readout stale after nudge/undo → subscribe to history.
  (`1309f0e`)
- **`3yu.12`** — layer hide/lock bypassed history (Ctrl+Z ate the prior edit) → route
  through `ModifyAttributeCommand`; CSSOM-safe style swap preserves opacity/blend.
  (`dd729ea`)
- **`3yu.23`** — bold/italic overlay text always rendered Carlito-Regular → register
  Carlito Bold/Italic faces + a bounded generic-sans family-alias; an `overlayWantsFaces`
  usage-gate keeps all PDF golden masters byte-identical. (`247416f`)
- **`3yu.24`** — eraser rail label said 'E' (which activates Ellipse); real binding is
  'x'. (`ec8ce1b`)
- **`3yu.21`** — mostly-outlined badge: already fixed by `3yu.1` (primary path now runs
  import analysis); added regression pins. (`61b9ed5`)
- **`3yu.18`** — negative/zero W/H produced invalid SVG / invisible shapes → `clampAttr`
  in new `numeric.ts`, wired into ControlBar + both PropertiesPanel paths. (`54fcfd3`)
- **`3yu.20`** — ruler drag-to-guide landed on the orthogonal axis AND (pre-existing,
  exposed during verify) never fired at all (onMouseUp on the ruler couldn't catch a
  release over the canvas) → `screenToDoc` drop-coord + window-mouseup tracking. (`d4946fa`)
- **`3yu.22`** — dead status-bar zoom buttons + no scroll-to-pan → wire zoom via
  `onZoomReady`, plain wheel pans / ctrl+wheel zooms. (`2974d23`)

Two correctness landmines were pre-flagged and handled: `3yu.12`'s CSSOM-vs-literal
style clobber, and `3yu.23`'s family-aliasing + a hidden subset-bloat gate. Four
implementer-written headed scenarios had targeting/measurement bugs (off-screen clicks,
synthetic-wheel-not-reaching-native-listener, wrong-element measurement) — the
orchestrator rendered/probed to confirm fix-vs-scenario and fixed each scenario.

## Campaign total

**20 `3yu` beads closed** (1/3/4/5/7/8/11/13/14/15/16 + 10/12/17/18/20/21/22/23/24), each
headed-verified; **967 tests + golden 11/11**; ~16 follow-up beads raised. All pushed.

## Next session — recommended

Epic `3yu` remaining: design-only **`3yu.2`** (imported-PDF text **content** editor — a
FEATURE, now unblocked by `3yu.3`: double-click-to-edit, in-place content + caret/IME,
Text-tool-over-text — needs a design pass, not a quick fix); **`3yu.25`** (real-producer
test fixtures) and **`3yu.26`** (dead-code deletion), both P2 cleanup. Plus the ~16
follow-up beads (notably P2 `harden CommandHistory.undo/redo exception-safety`, undoable
guides `7ap`, source-layer-add/remove as a Command). The data-loss/corruption core and
all UI P1s are now fixed — what's left is a designed feature + cleanup.
