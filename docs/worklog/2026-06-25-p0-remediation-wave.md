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

## Next session — recommended

Remaining `3yu` epic: design-only **`3yu.2`** (imported-PDF text content editor — now
unblocked by `3yu.3`; needs a designed feature: double-click-to-edit, in-place content
+ caret/IME, Text-tool-over-text), and nine un-investigated UI P1s — **`3yu.10`**
(Document Setup no-op), **`3yu.12`** (layer hide/lock bypass history), **`3yu.17`**
(stale Frame readout), **`3yu.18`** (negative/zero W/H), **`3yu.20`** (ruler axis),
**`3yu.21`** (mostly-outlined badge), **`3yu.22`** (zoom buttons/scroll-pan),
**`3yu.23`** (bold/italic → Carlito-Regular), **`3yu.24`** (eraser shortcut label).
Then P2s `3yu.25` (real-producer fixtures), `3yu.26` (dead code) + the follow-ups.
Same rhythm: prose-investigate (skeptic-verified) → parallel disjoint-file implementers
(no git ops) → orchestrator golden + headed + one-bead-one-commit.
