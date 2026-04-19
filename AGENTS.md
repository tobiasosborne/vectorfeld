# Agent Instructions

**START HERE.** Before making changes, read:

1. **docs/stocktake/00-SYNTHESIS.md** — current-state summary and what matters
2. **docs/stocktake/01-source-map.md** — file-by-file inventory (what each module does)
3. **docs/API.md** — API reference for the model + tool registry (kept in sync with source)
4. **CLAUDE.md** — project workflow rules (plan mode, subagents, verification, beads)

This project uses **bd** (beads) for issue tracking. Never use TodoWrite/TaskCreate/markdown TODOs.

## The pivot — what this tool is for

Vectorfeld was originally a scientific-diagram editor with LaTeX/TikZ export. **That vision is obsolete.**

The new primary use case: **casual PDF editing.** The owner opens the tool maybe once every few months when they need to edit a Word-generated PDF (flowing text, embedded images, simple shapes) and be done. Sessions are short and infrequent.

Implications that shape every decision:

- Multi-document workflow is first-class (copy elements from PDF B into PDF A).
- UI must be self-explanatory on cold pickup — no remembering shortcuts.
- Round-trip fidelity (PDF→edit→PDF preserving fonts + images) is load-bearing.
- Scientific-diagram precision (rulers, mm-snap, Bézier authoring, TikZ) is NOT the target.
- The owner is one specific person. No multi-user, no cloud, no auth.

## Current state (2026-04-19)

- **Build**: green. 437 tests passing across 32 test files.
- **Bundle**: ~824 KB main chunk + 10 MB MuPDF WASM (lazy).
- **PDF import**: MuPDF `text=text` mode validated end-to-end. Produces real `<text>`/`<tspan>`/`<image>`. Individual elements are click-selectable. Drag moves glyphs as a coherent unit (tspan x-arrays shift). See `docs/stocktake/06-pdf-roundtrip-experiment.md`.
- **Security**: SVG sanitizer strips `<script>`, `<foreignObject>`, `on*` handlers, `javascript:` hrefs. Tauri CSP tightened from `null` to an explicit policy.
- **Shell**: 7 tools visible in the strip (select, direct-select, rectangle, ellipse, line, text, eraser). 6 tools hidden but keyboard-accessible (pen P, pencil N, measure M, lasso J, free-transform Q, eyedropper I).

## What's NOT here (removed 2026-04-19)

~2,100 LOC of old-PRD code was deleted:

- TikZ export (`tikzExport.*`)
- Offset path (`offsetPath.*`)
- Text-on-path (`textPath.*`)
- Compound paths (`compoundPath.*`)
- Path booleans (`pathBooleans.*`, Paper.js dep)
- Clipping + opacity masks (`clipping.*`, `opacityMask.*`)
- Color swatches (`swatches.*`, `SwatchPanel.tsx`)
- Scissors tool, knife tool
- All corresponding Object-menu items (compound, booleans, masks, text-on-path, offset, TikZ export)

Don't re-add these unless the use case changes. Ask first.

## Known open issues (beads)

Run `bd ready` for the live queue. As of 2026-04-19:

- `vectorfeld-uxj` (P1, big) — DocumentState context refactor. Nine module-level singletons assume one document; multi-doc workflow needs them scoped per-document. Prerequisite for cross-document clipboard.
- `vectorfeld-vqb` (P2) — Move MuPDF WASM to a Web Worker. Currently blocks the main thread for 1–3 s on first import; worse for multi-page.
- Nine older bugs from the pre-pivot session: all pen-tool Bézier authoring (smooth curveto, asymmetric handles, multi-subpath) or properties-panel polish. Not relevant to PDF edit. Defer.

## Workflow — how to make changes here

1. **Check beads first**: `bd ready` — pick something unblocked.
2. **Claim**: `bd update <id> --claim`.
3. **Plan mode** if 3+ steps or non-trivial. Use subagents liberally for research.
4. **Before coding**: read `docs/stocktake/01-source-map.md` entry for the file you're touching.
5. **Implement** with minimal blast radius. Don't add features that weren't asked for.
6. **Test**: `npm test -- --run`. For UI changes: `experiments/pdf-roundtrip/verify-import.mjs` is a headed-Chromium end-to-end check that imports a PDF and verifies select + move. Use it or write a similar one.
7. **Commit + push**: `git push` is the definition of "done". Include `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>` line.
8. **Close the bead**: `bd close <id> --reason="<what you did>"`.

## Essential commands

```bash
# Tests
npm test -- --run             # Single-shot test run
npm test                      # Watch mode

# Build
npm run build                 # tsc -b + vite build
npx tsc -b                    # Type-check only

# Dev
npm run dev                   # Vite on :5173
# Run experiments/pdf-roundtrip/verify-import.mjs against the running server

# Beads
bd ready                      # Actionable work
bd show <id>                  # Issue detail
bd update <id> --claim        # Claim
bd close <id> --reason="..."  # Close
bd memories <keyword>         # Search persistent notes
bd remember "..."             # Save a note
```

## Non-interactive shell flags

Some system aliases make `cp`/`mv`/`rm` interactive. Always pass `-f`:

```bash
cp -f | mv -f | rm -f | rm -rf <dir>
apt-get -y | ssh -o BatchMode=yes
```

## Critical safety rules

- **Never commit `.beads/.beads-credential-key`** or `.beads/backup/*.darc`. They contain per-machine secrets. `.beads/.gitignore` now covers this — but `git add -A` can still slip them through. Always stage specific files.
- **Never force-push main** without explicit user authorization. The credential-key leak on 2026-04-19 is still in history at commit 92caae4; purging it requires `git filter-repo` + force-push, user-driven.
- Rotate the beads credential if it was ever pushed to a public remote: `bd admin rotate-key` (or delete the file and let bd regenerate).

## For more detail

- `docs/stocktake/00-SYNTHESIS.md` — cross-cutting findings from the 6-reviewer audit
- `docs/stocktake/02-architecture.md` — architectural hostility matrix, singleton critique, command-pattern back-doors
- `docs/stocktake/03-performance.md` — hot-path analysis, memory audit
- `docs/stocktake/04-code-smells.md` — maintainability liabilities, god files, dead code
- `docs/stocktake/05-security.md` — attack surface, remaining gaps
- `docs/stocktake/06-pdf-roundtrip-experiment.md` — the make-or-break PDF-import validation
- `docs/stocktake/07-reviews/` — individual reviewer reports (6 of them)
- `docs/lessons.md` — corrections from past sessions; read before writing code
- `vectorfeld-prd.md` — ORIGINAL PRD; most of it is obsolete post-pivot (see "What's NOT here")
