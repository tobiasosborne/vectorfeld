# 2026-04-22 — Orientation + design-drop staging

Short session. No production code changed. Oriented on the project state, then staged a redesign bundle for Claude Design because the owner dislikes the current UI ("1998 Java Swing app").

## What shipped

- **`design-drop/`** — self-contained upload bundle for Claude Design. Contains `App.tsx`, `index.css`, `components/*.tsx` (13 files, tests excluded), `current-ui.png` (the 1280×720 screenshot at repo root), and `BRIEF.md`. 2,766 LOC total. Model/tools layers deliberately excluded — they're logic, not design, and would only dilute the context. The brief frames the post-pivot use case (cold-pickup PDF editing, multi-doc compositing) and gives redesign license rather than restyle license.

## Observations for next session

- **bd database is empty on this clone** (`bd stats` → 0). But `.beads/issues.jsonl` has 68 lines including the 30+ `vectorfeld-*` IDs from prior sessions (`ccl`, `byq`, `4w7`, `dcx`, etc.). This is the exact "bd state lost on a fresh device" situation called out in `docs/lessons.md` — use the existing jsonl to restore, don't recreate beads from scratch. Restore before doing any bd-tracked work.
- **`temp/` is missing** — the spike verdict docs (`spike-01-verdict.md` etc.) and `composite-via-playwright.mjs` driver referenced in the prior session log live there but aren't in git. Re-runnable from `scripts/spike/*.mjs` if needed.

## Next work unchanged

Top of queue: `vectorfeld-byq` (live `mupdf.PDFDocument` handle in `DocumentState`), pending bd restore.
