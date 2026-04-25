# Worklog

Chronological session logs. Each file describes one working session: what shipped, beads opened/closed, lessons captured. Most-recent first.

| Date | Session | One-line |
|---|---|---|
| 2026-04-25 | [graft-8v3](2026-04-25-graft-8v3.md) | Source-PDF back-references on imported SVG elements (page + layer-id tags) |
| 2026-04-25 | [graft-byq](2026-04-25-graft-byq.md) | Phase 2 of `ccl` starts: SourcePdfStore lands bytes in DocumentState |
| 2026-04-24 | [golden-grind](2026-04-24-golden-grind.md) | Built golden gates + milestone scoreboard; 1→10 grind, 6 real bugs fixed |
| 2026-04-23 | [atrium](2026-04-23-atrium.md) | Atrium UI redesign — 17-commit autonomous ship; 600 tests green |
| 2026-04-22 | [graft-spikes](2026-04-22-graft-spikes.md) | Kerning + double-Y-flip + font embed; graft-architecture spikes pass; epic `ccl` filed |
| 2026-04-22 | [design-drop](2026-04-22-design-drop.md) | Staged `design-drop/` for Claude Design; bd-state-lost recovery |
| 2026-04-20 | [tdd-roundtrip](2026-04-20-tdd-roundtrip.md) | pdf-lib export engine from scratch; closed `9s9`/`cd2`/`ape`/`dns`; 461→509 tests |
| 2026-04-20 | [composite](2026-04-20-composite.md) | Composite use case validated; `<g>`-wrapper regression fixed; Open as Background Layer |
| 2026-04-19 | [pivot](2026-04-19-pivot.md) | Pivoted from scientific-diagram to PDF-edit; deleted 2,126 LOC; DocumentState Phase 1 |

## When to read these

- Read the **most recent** entry at session start to know what's currently in flight.
- Read older entries when touching the subsystem they describe (e.g. open `2026-04-22-graft-spikes.md` before working on `vectorfeld-ccl`).
- The truth about *current* state lives in `AGENTS.md` "Current state". Worklogs are append-only history.
