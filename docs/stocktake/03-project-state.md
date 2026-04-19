# Vectorfeld Project State — Stocktake 03

**Date:** 2026-04-19  
**Tool:** `bd` (Beads) issue tracker + `git log` analysis

---

## 1. Issue Tracker Snapshot

### Counts by status

| Status      | Count |
|-------------|-------|
| Open        | 9     |
| In Progress | 0     |
| Blocked     | 0     |
| Closed      | 17    |
| **Total**   | **26**|

> Note: `bd stats` reports 150 total / 150 closed because the Dolt SQL layer and the JSONL file are out of sync. The JSONL file (`.beads/issues.jsonl`) is the source of truth and contains 26 records: 17 closed, 9 open. The discrepancy likely comes from the 2026-03-17 `bd init` re-initialising the Dolt DB without re-importing the earlier JSONL export, leaving 150 older issues visible only in the SQL store.

### Open issues by priority

| Priority | Count |
|----------|-------|
| P2       | 5     |
| P3       | 3     |
| P4       | 1     |

### Open issues by type

| Type    | Count |
|---------|-------|
| bug     | 6     |
| feature | 2     |
| chore   | 1     |

### Closed issues by type (for reference)

| Type | Count |
|------|-------|
| bug  | 10    |
| task | 7     |

Issues span 2026-03-04 (earliest) to 2026-03-18 (latest).

---

## 2. Currently In-Progress

**None.** There are zero issues with `status=in_progress`. Nothing is formally claimed. The last active session committed on 2026-03-18 and filed 4 pen tool issues + 1 layout bug, then stopped without claiming any of them.

There is no abandoned work to clean up — but there is also nothing actively progressing.

---

## 3. Top of the Ready Queue

All 9 open issues are unblocked. Ranked by priority then impact:

### 1. `vectorfeld-ptz` — P2 bug: Default style bleeds fill to subsequent drawings
**Rationale:** Directly breaks the drawing workflow: after setting a fill on one shape, subsequent shapes inherit stale fill state. This is a regression in the `defaultStyle.ts` pub-sub module noticed during benchmark redraw. High user-visible impact; the fix is likely a reset/flush guard in `defaultStyle.ts` when the fill-type switches via the Properties panel.

### 2. `vectorfeld-vj5` — P2 bug: Stroke color picker has `allowNone=false`
**Rationale:** A one-line fix in `PropertiesPanel.tsx` (line 478: change `allowNone={false}` to `allowNone={true}`). Users cannot remove stroke through the UI — they must set stroke-width to 0 as a workaround, which is semantically wrong. Quick win with outsized UX benefit.

### 3. `vectorfeld-9hu` — P2 bug: Pen tool cannot produce S/s (smooth curveto) path commands
**Rationale:** The pen tool is incomplete for SVG fidelity. It cannot produce the `S`/`s` smooth-curveto commands needed for proper Bézier path authoring. This was surfaced by SVG benchmark testing (paths-data-01 failed), and is directly tied to the project's benchmark pass/fail status. Harder than the above two but highest strategic value for proving the tool against W3C reference SVGs.

Other ready items:
- `vectorfeld-t7u` — P2 bug: Pen tool asymmetric Bézier handles (Alt+drag to break symmetry)
- `vectorfeld-els` — P2 feature: No UI for rx/ry rounded corners on rects
- `vectorfeld-eke` — P3 bug: Canvas SVG overflows flex container on viewport resize (min-h-0 fix)
- `vectorfeld-lb4` — P3 bug: Input focus traps keyboard tool shortcuts (blur after Enter commit)
- `vectorfeld-3t8` — P3 feature: Pen tool multi-subpath support
- `vectorfeld-87e` — P4 chore: Pen tool outputs only absolute path commands (cosmetic)

---

## 4. Blockers & Orphans

**None.** `bd blocked` and `bd orphans` both report clean. No issue has dependency edges in the JSONL. All 9 open issues are independently actionable.

---

## 5. Recent Commit Activity

### Activity timeline (meaningful commits only, no bd backup noise)

| Date       | Hash    | Description |
|------------|---------|-------------|
| 2026-03-18 | a760c2e | SVG benchmark exact recreation: 2 PASS, 1 FAIL + 4 pen tool issues filed |
| 2026-03-18 | 17d891d | Fix removeChild crash + SVG benchmark redraw protocol |
| 2026-03-17 | 71d05b5 | Fix 26 bugs from stress test + code review: 2 P0, 7 P1, 12 P2, 5 P3 |
| 2026-03-17 | ab2ec21 | Handoff: document 4 select-tool bugs in groups/paths |
| 2026-03-13 | fbe6dd1 | bd: backup (no code change) |
| 2026-03-05 | 1e6ca51 | Fix all 16 chaos monkey issues: hit test, undo, perf, layer lock |
| 2026-03-05 | 74e93a5 | Update handoff: 16 open issues from chaos monkey |
| 2026-03-04 | 6efae7f | Add 15 issues from chaos monkey testing + code analysis |
| 2026-03-04 | 2fe7b41 | Fix parsePathD: H, V, S, Q, T, A commands |
| 2026-03-04 | dd8830a | Fix path transform bugs: bake translation into d coordinates |
| 2026-03-04 | e976c0c | Chaos monkey: zero errors across 6-phase stress test |
| 2026-03-04 | 3789634 | Complete Phase 2: PDF import, artboards, and all remaining features |

### Commits per day

| Date       | Commits |
|------------|---------|
| 2026-03-01 | 60      |
| 2026-03-02 | 4       |
| 2026-03-03 | 7       |
| 2026-03-04 | 21      |
| 2026-03-05 | 2       |
| 2026-03-13 | 1       |
| 2026-03-17 | 7       |
| 2026-03-18 | 2       |

### Hot areas of the codebase

Based on files touched in the last meaningful commits:

- **`src/tools/penTool.ts`** — modified in 71d05b5, and is the subject of 4 of 9 open issues. The hottest file right now.
- **`src/tools/selectTool.ts`** — 204 lines of changes in 71d05b5; bugs in group/path selection documented in ab2ec21 (though these were filed as handoff notes, not as bd issues).
- **`src/model/commands.ts`** and **`src/model/document.ts`** — null-guard fixes for removeChild crash in 17d891d.
- **`src/components/PropertiesPanel.tsx`** — 82-line change in 71d05b5; stroke color picker bug (vectorfeld-vj5) lives here.
- **`src/tools/directSelectTool.ts`** — 65-line change in 71d05b5.
- **`src/model/pathOps.ts`** — major refactor in 71d05b5 (286→ restructured).
- **`test-benchmarks/`** — entirely new directory added in 17d891d/a760c2e; benchmark runner, comparison PNGs, SVG reference files. This is where W3C SVG test suite comparison work lives.

The project was built from scratch on 2026-03-01 (60 commits in a single day — a full sprint run). The subsequent days layered on Phase 2 features, stress testing, code review remediation, and finally SVG benchmarking.

---

## 6. Stale Work

`bd stale` reports no stale issues (all active). Technically correct — all 9 open issues were filed on 2026-03-18, only a month ago. None have been touched since filing.

However, the following should be flagged for review:

- **`vectorfeld-87e`** (P4 chore: relative path commands) — This is cosmetic and explicitly noted as such in the description ("visually equivalent"). Strong candidate to close as `won't fix` or defer indefinitely; it only matters for SVG diff exactness and the benchmark already notes this as acceptable.

- **Select-tool group/path bugs** — The commit `ab2ec21` ("Handoff: document 4 select-tool bugs in groups/paths") suggests there are known bugs filed as handoff text but **not as bd issues**. These are invisible to the tracker. Worth creating bd issues for them before they get lost.

---

## 7. Project Mood/Momentum Verdict

Vectorfeld went from zero to a feature-complete vector graphics editor in a compressed 18-day sprint (2026-03-01 through 2026-03-18), powered almost entirely by AI-assisted development. The project completed Phase 1 (MVP) and Phase 2 (advanced tools: path booleans, PDF import, text-on-path, knife, lasso, free transform, chaos-monkey-verified) with 100% issue closure, 449 tests, and zero TypeScript errors. The last burst of activity on 2026-03-17/18 was a code-quality pass (fixing 26 bugs from a 7-agent code review) followed by W3C SVG benchmark testing that surfaced the remaining 9 open issues — all pen tool limitations or minor UI gaps. Since 2026-03-18, the repo has been completely idle (32 days as of today). The project is in a **"parked at the finish line" state**: Phase 2 is done, the codebase is clean, there are no blockers, and the 9 open issues are all well-understood and independently actionable. This is not stalled or abandoned — it is deliberately paused with a clear and shallow queue waiting for the next session to pick up.
